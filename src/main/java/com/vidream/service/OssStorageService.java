package com.vidream.service;

import com.aliyun.oss.ClientException;
import com.aliyun.oss.OSS;
import com.aliyun.oss.OSSClientBuilder;
import com.aliyun.oss.OSSException;
import com.aliyun.oss.common.auth.DefaultCredentialProvider;
import com.aliyun.oss.common.comm.SignVersion;
import com.aliyun.oss.model.CompleteMultipartUploadRequest;
import com.aliyun.oss.model.InitiateMultipartUploadRequest;
import com.aliyun.oss.model.InitiateMultipartUploadResult;
import com.aliyun.oss.model.ObjectMetadata;
import com.aliyun.oss.model.OSSObject;
import com.aliyun.oss.model.PartETag;
import com.aliyun.oss.model.PutObjectRequest;
import com.aliyun.oss.model.UploadPartRequest;
import com.aliyun.oss.model.UploadPartResult;
import com.vidream.config.OssProperties;
import com.vidream.dto.BackgroundAssetInfo;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

@Service
public class OssStorageService {

    public static final long SIMPLE_UPLOAD_LIMIT = 5L * 1024 * 1024;
    public static final long MAX_VIDEO_SIZE = 100L * 1024 * 1024;
    public static final long PART_SIZE = 5L * 1024 * 1024;

    private static final DateTimeFormatter TS = DateTimeFormatter.ofPattern("yyyyMMddHHmmss");

    private final OssProperties ossProperties;

    public OssStorageService(OssProperties ossProperties) {
        this.ossProperties = ossProperties;
    }

    public BackgroundAssetInfo uploadSimple(MultipartFile file, String objectKey) throws IOException {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("请选择要上传的文件");
        }
        OSS client = createClient();
        try (InputStream inputStream = file.getInputStream()) {
            PutObjectRequest request = new PutObjectRequest(ossProperties.getBucket(), objectKey, inputStream);
            ObjectMetadata metadata = new ObjectMetadata();
            metadata.setContentLength(file.getSize());
            metadata.setContentType(resolveContentType(file.getContentType(), file.getOriginalFilename()));
            request.setMetadata(metadata);
            client.putObject(request);
            return new BackgroundAssetInfo(buildPublicUrl(objectKey), objectKey, safeOriginalName(file.getOriginalFilename()), file.getSize());
        } catch (OSSException | ClientException e) {
            throw new IllegalStateException("OSS上传失败: " + safeErrorMessage(e));
        } finally {
            client.shutdown();
        }
    }

    public Path downloadObjectToTempFile(String objectKey, String suffix) {
        if (isBlank(objectKey)) {
            throw new IllegalArgumentException("objectKey不能为空");
        }
        String safeSuffix = normalizeText(suffix);
        if (safeSuffix.isEmpty()) {
            safeSuffix = ".tmp";
        } else if (!safeSuffix.startsWith(".")) {
            safeSuffix = "." + safeSuffix;
        }
        OSS client = createClient();
        try (OSSObject obj = client.getObject(ossProperties.getBucket(), objectKey);
             InputStream inputStream = obj.getObjectContent()) {
            Path tmp = Files.createTempFile("vidream-bg-", safeSuffix);
            Files.copy(inputStream, tmp, StandardCopyOption.REPLACE_EXISTING);
            return tmp;
        } catch (OSSException | ClientException e) {
            throw new IllegalStateException("OSS下载失败: " + safeErrorMessage(e));
        } catch (IOException e) {
            throw new IllegalStateException("下载文件失败");
        } finally {
            client.shutdown();
        }
    }

    public BackgroundAssetInfo uploadLocalFile(Path localFile, String objectKey, String originalName, String contentType) {
        if (localFile == null || !Files.exists(localFile)) {
            throw new IllegalArgumentException("本地文件不存在");
        }
        if (isBlank(objectKey)) {
            throw new IllegalArgumentException("objectKey不能为空");
        }
        OSS client = createClient();
        try {
            PutObjectRequest request = new PutObjectRequest(ossProperties.getBucket(), objectKey, localFile.toFile());
            ObjectMetadata metadata = new ObjectMetadata();
            try {
                metadata.setContentLength(Files.size(localFile));
            } catch (IOException ignored) {
            }
            metadata.setContentType(resolveContentType(contentType, originalName));
            request.setMetadata(metadata);
            client.putObject(request);
            Long size = null;
            try {
                size = Files.size(localFile);
            } catch (IOException ignored) {
            }
            return new BackgroundAssetInfo(buildPublicUrl(objectKey), objectKey, safeOriginalName(originalName), size);
        } catch (OSSException | ClientException e) {
            throw new IllegalStateException("OSS上传失败: " + safeErrorMessage(e));
        } finally {
            client.shutdown();
        }
    }

    public Map<String, Object> initiateMultipart(String objectKey, String contentType) {
        OSS client = createClient();
        try {
            InitiateMultipartUploadRequest request = new InitiateMultipartUploadRequest(ossProperties.getBucket(), objectKey);
            ObjectMetadata metadata = new ObjectMetadata();
            metadata.setContentType(resolveContentType(contentType, objectKey));
            request.setObjectMetadata(metadata);
            InitiateMultipartUploadResult result = client.initiateMultipartUpload(request);
            return Map.of(
                "uploadId", result.getUploadId(),
                "objectKey", objectKey,
                "chunkSize", PART_SIZE
            );
        } catch (OSSException | ClientException e) {
            throw new IllegalStateException("初始化分片上传失败: " + safeErrorMessage(e));
        } finally {
            client.shutdown();
        }
    }

    public Map<String, Object> uploadPart(String objectKey, String uploadId, int partNumber, MultipartFile file) throws IOException {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("分片内容不能为空");
        }
        OSS client = createClient();
        try (InputStream inputStream = file.getInputStream()) {
            UploadPartRequest request = new UploadPartRequest();
            request.setBucketName(ossProperties.getBucket());
            request.setKey(objectKey);
            request.setUploadId(uploadId);
            request.setPartNumber(partNumber);
            request.setInputStream(inputStream);
            request.setPartSize(file.getSize());
            UploadPartResult result = client.uploadPart(request);
            return Map.of(
                "partNumber", partNumber,
                "etag", result.getPartETag().getETag()
            );
        } catch (OSSException | ClientException e) {
            throw new IllegalStateException("上传分片失败: " + safeErrorMessage(e));
        } finally {
            client.shutdown();
        }
    }

    public BackgroundAssetInfo completeMultipart(String objectKey, String uploadId, List<Map<String, Object>> parts,
                                                 String originalName, Long size) {
        if (parts == null || parts.isEmpty()) {
            throw new IllegalArgumentException("缺少分片信息");
        }
        List<PartETag> partETags = new ArrayList<>();
        for (Map<String, Object> item : parts) {
            if (item == null) {
                continue;
            }
            int partNumber = parsePartNumber(item.get("partNumber"));
            String etag = String.valueOf(item.getOrDefault("etag", "")).trim();
            if (partNumber <= 0 || etag.isEmpty()) {
                throw new IllegalArgumentException("分片信息不完整");
            }
            partETags.add(new PartETag(partNumber, etag));
        }
        partETags.sort(Comparator.comparingInt(PartETag::getPartNumber));
        OSS client = createClient();
        try {
            CompleteMultipartUploadRequest request =
                new CompleteMultipartUploadRequest(ossProperties.getBucket(), objectKey, uploadId, partETags);
            client.completeMultipartUpload(request);
            return new BackgroundAssetInfo(buildPublicUrl(objectKey), objectKey, safeOriginalName(originalName), size);
        } catch (OSSException | ClientException e) {
            throw new IllegalStateException("完成分片上传失败: " + safeErrorMessage(e));
        } finally {
            client.shutdown();
        }
    }

    public void abortMultipart(String objectKey, String uploadId) {
        if (isBlank(objectKey) || isBlank(uploadId)) {
            return;
        }
        OSS client = createClient();
        try {
            client.abortMultipartUpload(new com.aliyun.oss.model.AbortMultipartUploadRequest(
                ossProperties.getBucket(), objectKey, uploadId
            ));
        } catch (OSSException | ClientException e) {
            throw new IllegalStateException("取消分片上传失败: " + safeErrorMessage(e));
        } finally {
            client.shutdown();
        }
    }

    public void deleteObject(String objectKey) {
        if (isBlank(objectKey)) {
            return;
        }
        OSS client = createClient();
        try {
            client.deleteObject(ossProperties.getBucket(), objectKey);
        } catch (OSSException | ClientException e) {
            throw new IllegalStateException("删除OSS文件失败: " + safeErrorMessage(e));
        } finally {
            client.shutdown();
        }
    }

    public String createObjectKey(String slot, String originalName) {
        String normalizedSlot = normalizeSlot(slot);
        String ext = detectExtension(originalName);
        String safeExt = ext.isEmpty() ? "" : "." + ext;
        String filename = TS.format(LocalDateTime.now()) + "-" + UUID.randomUUID().toString().replace("-", "") + safeExt;
        String prefix = trimSlashes(ossProperties.getPrefix());
        return prefix + "/" + normalizedSlot + "/" + filename;
    }

    public boolean shouldUseMultipart(long size) {
        return size > SIMPLE_UPLOAD_LIMIT;
    }

    public void validateVideoFile(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("请选择视频文件");
        }
        String contentType = normalizeText(file.getContentType()).toLowerCase(Locale.ROOT);
        String ext = detectExtension(file.getOriginalFilename());
        boolean isVideo = contentType.startsWith("video/")
            || List.of("mp4", "mov", "m4v", "webm", "ogg").contains(ext);
        if (!isVideo) {
            throw new IllegalArgumentException("仅支持上传视频文件");
        }
        if (file.getSize() > MAX_VIDEO_SIZE) {
            throw new IllegalArgumentException("视频大小不能超过100M");
        }
    }

    public void validateImageFile(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("请选择图片文件");
        }
        String contentType = normalizeText(file.getContentType()).toLowerCase(Locale.ROOT);
        String ext = detectExtension(file.getOriginalFilename());
        boolean isImage = contentType.startsWith("image/")
            || List.of("png", "jpg", "jpeg", "webp", "gif").contains(ext);
        if (!isImage) {
            throw new IllegalArgumentException("仅支持上传图片文件");
        }
    }

    public void ensureConfigured() {
        if (isBlank(ossProperties.getEndpoint()) || isBlank(ossProperties.getRegion()) || isBlank(ossProperties.getBucket())) {
            throw new IllegalStateException("OSS配置不完整，请先配置 endpoint、region、bucket");
        }
        if (isBlank(readAccessKeyId()) || isBlank(readAccessKeySecret())) {
            throw new IllegalStateException("未检测到 OSS_ACCESS_KEY_ID 或 OSS_ACCESS_KEY_SECRET，请检查环境变量或 application.properties 配置");
        }
    }

    private OSS createClient() {
        ensureConfigured();
        com.aliyun.oss.ClientBuilderConfiguration configuration = new com.aliyun.oss.ClientBuilderConfiguration();
        configuration.setSignatureVersion(SignVersion.V4);
        return OSSClientBuilder.create()
            .endpoint(ossProperties.getEndpoint())
            .credentialsProvider(new DefaultCredentialProvider(readAccessKeyId(), readAccessKeySecret()))
            .clientConfiguration(configuration)
            .region(ossProperties.getRegion())
            .build();
    }

    private String readAccessKeyId() {
        String fromProps = normalizeText(ossProperties.getAccessKeyId());
        if (!fromProps.isEmpty()) {
            return fromProps;
        }
        return normalizeText(System.getenv("OSS_ACCESS_KEY_ID"));
    }

    private String readAccessKeySecret() {
        String fromProps = normalizeText(ossProperties.getAccessKeySecret());
        if (!fromProps.isEmpty()) {
            return fromProps;
        }
        return normalizeText(System.getenv("OSS_ACCESS_KEY_SECRET"));
    }

    private String buildPublicUrl(String objectKey) {
        String publicBaseUrl = trimSlashes(ossProperties.getPublicBaseUrl());
        if (!publicBaseUrl.isEmpty()) {
            return publicBaseUrl + "/" + trimLeadingSlash(objectKey);
        }
        String endpoint = normalizeText(ossProperties.getEndpoint());
        if (!endpoint.startsWith("http://") && !endpoint.startsWith("https://")) {
            endpoint = "https://" + endpoint;
        }
        return endpoint + "/" + ossProperties.getBucket() + "/" + trimLeadingSlash(objectKey);
    }

    private int parsePartNumber(Object value) {
        if (value instanceof Number number) {
            return number.intValue();
        }
        try {
            return Integer.parseInt(String.valueOf(value));
        } catch (Exception e) {
            return -1;
        }
    }

    private String normalizeSlot(String slot) {
        String normalized = normalizeText(slot).toLowerCase(Locale.ROOT);
        return switch (normalized) {
            case "main", "mainvideo", "main-video" -> "main-video";
            case "first", "firstvideo", "first-video", "intro", "introvideo" -> "first-video";
            case "second", "secondvideo", "second-video", "middle", "middlevideo" -> "second-video";
            case "third", "thirdvideo", "third-video" -> "third-video";
            case "last", "lastvideo", "last-video", "outro", "outrovideo", "bottom" -> "last-video";
            case "whole", "wholevideo", "whole-video", "wholeasset", "whole-asset" -> "whole-video";
            case "whole-rev", "wholerev", "whole_rev", "whole-video-rev", "wholevideorev" -> "whole-video-rev";
            case "seg1", "segment1", "seg-1" -> "seg1-video";
            case "seg2", "segment2", "seg-2" -> "seg2-video";
            case "seg3", "segment3", "seg-3" -> "seg3-video";
            case "seg1-rev", "seg1rev", "seg1_rev", "segment1-rev", "segment1_rev" -> "seg1-video-rev";
            case "seg2-rev", "seg2rev", "seg2_rev", "segment2-rev", "segment2_rev" -> "seg2-video-rev";
            case "seg3-rev", "seg3rev", "seg3_rev", "segment3-rev", "segment3_rev" -> "seg3-video-rev";
            case "sequence", "sequenceframe", "sequence-frame", "frames" -> "sequence-frames";
            case "mobile", "mobilebg", "mobile-bg", "mobile-image", "mobilebackgroundimage" -> "mobile-background-image";
            case "mobileposter", "mobile-poster", "mobile-cover", "mobilecover", "mobile-background-poster" -> "mobile-background-poster";
            default -> throw new IllegalArgumentException("不支持的背景资源类型");
        };
    }

    private String detectExtension(String originalName) {
        String filename = normalizeText(originalName);
        int dotIndex = filename.lastIndexOf('.');
        if (dotIndex < 0 || dotIndex >= filename.length() - 1) {
            return "";
        }
        return filename.substring(dotIndex + 1).trim().toLowerCase(Locale.ROOT);
    }

    private String resolveContentType(String contentType, String originalName) {
        String normalized = normalizeText(contentType);
        if (!normalized.isEmpty()) {
            return normalized;
        }
        return switch (detectExtension(originalName)) {
            case "mp4" -> "video/mp4";
            case "mov" -> "video/quicktime";
            case "webm" -> "video/webm";
            case "png" -> "image/png";
            case "jpg", "jpeg" -> "image/jpeg";
            case "webp" -> "image/webp";
            case "gif" -> "image/gif";
            default -> "application/octet-stream";
        };
    }

    private String safeOriginalName(String originalName) {
        String safeName = normalizeText(originalName);
        return safeName.isEmpty() ? "unnamed" : safeName;
    }

    private String safeErrorMessage(Exception e) {
        String message = e == null ? "" : normalizeText(e.getMessage());
        return message.isEmpty() ? "请求被OSS拒绝" : message;
    }

    private String trimLeadingSlash(String value) {
        return normalizeText(value).replaceFirst("^/+", "");
    }

    private String trimSlashes(String value) {
        return normalizeText(value).replaceAll("^/+", "").replaceAll("/+$", "");
    }

    private String normalizeText(String value) {
        return value == null ? "" : value.trim();
    }

    private boolean isBlank(String value) {
        return normalizeText(value).isEmpty();
    }
}
