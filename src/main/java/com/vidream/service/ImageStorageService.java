package com.vidream.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.URISyntaxException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

@Service
public class ImageStorageService {

    private static final Set<String> ALLOWED_EXT = Set.of("png", "jpg", "jpeg", "webp", "gif");
    private static final DateTimeFormatter TS = DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss");

    private final Path imagesRoot;

    public ImageStorageService(@Value("${vidream.images-dir:}") String configuredImagesDir) {
        this.imagesRoot = resolveImagesRoot(configuredImagesDir);
    }

    public UploadResult storeImage(MultipartFile file, String category) throws IOException {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("请选择要上传的图片");
        }
        String safeCategory = normalizeCategory(category);
        String ext = getExtension(file.getOriginalFilename(), file.getContentType());
        if (!ALLOWED_EXT.contains(ext)) {
            throw new IllegalArgumentException("仅支持上传 png/jpg/jpeg/webp/gif 图片");
        }

        Path targetDir = imagesRoot.resolve("uploads").resolve(safeCategory).normalize();
        Files.createDirectories(targetDir);

        String filename = TS.format(LocalDateTime.now()) + "-" + UUID.randomUUID().toString().replace("-", "") + "." + ext;
        Path target = targetDir.resolve(filename).normalize();

        try (InputStream in = file.getInputStream()) {
            Files.copy(in, target, StandardCopyOption.REPLACE_EXISTING);
        }

        String url = "/images/uploads/" + safeCategory + "/" + filename;
        return new UploadResult(url, file.getOriginalFilename(), file.getSize());
    }

    public Path getImagesRoot() {
        return imagesRoot;
    }

    public boolean isManagedUploadUrl(String imageUrl) {
        String normalized = normalizeManagedUploadUrl(imageUrl);
        return normalized != null;
    }

    public boolean deleteManagedImage(String imageUrl) throws IOException {
        String normalized = normalizeManagedUploadUrl(imageUrl);
        if (normalized == null) {
            return false;
        }
        Path target = imagesRoot.resolve(normalized.substring("/images/".length())).normalize();
        if (!target.startsWith(imagesRoot)) {
            throw new IllegalArgumentException("图片路径非法");
        }
        boolean deleted = Files.deleteIfExists(target);
        cleanupEmptyParents(target.getParent());
        return deleted;
    }

    private static String normalizeCategory(String category) {
        String c = (category == null ? "" : category.trim().toLowerCase(Locale.ROOT));
        return switch (c) {
            case "partners", "partner", "partner_logos" -> "partners";
            case "wechat", "wechat_qr", "wechat_qr_url" -> "wechat";
            case "company", "company_logo" -> "company";
            default -> throw new IllegalArgumentException("不支持的上传类型");
        };
    }

    private static String getExtension(String originalFilename, String contentType) {
        String ext = "";
        if (originalFilename != null) {
            int idx = originalFilename.lastIndexOf('.');
            if (idx > -1 && idx < originalFilename.length() - 1) {
                ext = originalFilename.substring(idx + 1).trim().toLowerCase(Locale.ROOT);
            }
        }
        if (!ext.isEmpty()) return ext;
        if (contentType == null) return "";
        String ct = contentType.toLowerCase(Locale.ROOT);
        if (ct.contains("png")) return "png";
        if (ct.contains("jpeg") || ct.contains("jpg")) return "jpg";
        if (ct.contains("webp")) return "webp";
        if (ct.contains("gif")) return "gif";
        return "";
    }

    private static String normalizeManagedUploadUrl(String imageUrl) {
        String raw = imageUrl == null ? "" : imageUrl.trim();
        if (raw.isEmpty()) {
            return null;
        }
        String path = raw;
        if (raw.startsWith("http://") || raw.startsWith("https://")) {
            try {
                path = new URI(raw).getPath();
            } catch (URISyntaxException e) {
                throw new IllegalArgumentException("图片路径非法");
            }
        }
        if (path == null || !path.startsWith("/images/uploads/")) {
            return null;
        }
        int queryIndex = path.indexOf('?');
        if (queryIndex >= 0) {
            path = path.substring(0, queryIndex);
        }
        int hashIndex = path.indexOf('#');
        if (hashIndex >= 0) {
            path = path.substring(0, hashIndex);
        }
        return path;
    }

    private void cleanupEmptyParents(Path dir) throws IOException {
        Path uploadsRoot = imagesRoot.resolve("uploads").normalize();
        while (dir != null && dir.startsWith(uploadsRoot) && !dir.equals(uploadsRoot)) {
            try {
                Files.delete(dir);
            } catch (IOException e) {
                break;
            }
            dir = dir.getParent();
        }
    }

    private static Path resolveImagesRoot(String configuredImagesDir) {
        String configured = configuredImagesDir == null ? "" : configuredImagesDir.trim();
        if (!configured.isEmpty()) {
            return Path.of(configured).toAbsolutePath().normalize();
        }
        Path dev = Path.of("src", "main", "resources", "static", "images").toAbsolutePath().normalize();
        if (Files.exists(dev) && Files.isDirectory(dev)) {
            return dev;
        }
        return Path.of("images").toAbsolutePath().normalize();
    }

    public record UploadResult(String url, String originalName, long size) {}
}
