package com.vidream.controller;

import com.vidream.dto.ApiResponse;
import com.vidream.dto.BackgroundAssetInfo;
import com.vidream.entity.Case;
import com.vidream.entity.Order;
import com.vidream.service.BackgroundMediaService;
import com.vidream.service.BackgroundVideoDerivationService;
import com.vidream.service.ImageStorageService;
import com.vidream.service.OssStorageService;
import com.vidream.service.SiteService;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@RestController
@RequestMapping("/api/admin")
public class AdminController {

    private static final String ADMIN_TOKEN = "vidream-admin-2024";

    private final SiteService siteService;
    private final ImageStorageService imageStorageService;
    private final OssStorageService ossStorageService;
    private final BackgroundMediaService backgroundMediaService;
    private final BackgroundVideoDerivationService backgroundVideoDerivationService;

    public AdminController(SiteService siteService,
                           ImageStorageService imageStorageService,
                           OssStorageService ossStorageService,
                           BackgroundMediaService backgroundMediaService,
                           BackgroundVideoDerivationService backgroundVideoDerivationService) {
        this.siteService = siteService;
        this.imageStorageService = imageStorageService;
        this.ossStorageService = ossStorageService;
        this.backgroundMediaService = backgroundMediaService;
        this.backgroundVideoDerivationService = backgroundVideoDerivationService;
    }

    private boolean checkAuth(String token) {
        return ADMIN_TOKEN.equals(token);
    }

    @GetMapping("/config")
    public ApiResponse getAllConfig(@RequestHeader(value = "X-Admin-Token", required = false) String token) {
        if (!checkAuth(token)) {
            return ApiResponse.fail("未授权访问");
        }
        return ApiResponse.ok(siteService.getAllConfig());
    }

    @PutMapping("/config")
    public ApiResponse updateConfig(@RequestHeader(value = "X-Admin-Token", required = false) String token,
                                     @RequestBody Map<String, String> configs) {
        if (!checkAuth(token)) {
            return ApiResponse.fail("未授权访问");
        }
        siteService.updateConfigBatch(configs);
        return ApiResponse.ok("配置已更新");
    }

    @PostMapping(value = "/images/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ApiResponse uploadImage(@RequestHeader(value = "X-Admin-Token", required = false) String token,
                                   @RequestParam(value = "category", required = false) String category,
                                   @RequestParam("file") MultipartFile file) {
        if (!checkAuth(token)) {
            return ApiResponse.fail("未授权访问");
        }
        try {
            return ApiResponse.ok(imageStorageService.storeImage(file, category));
        } catch (IllegalArgumentException e) {
            return ApiResponse.fail(e.getMessage());
        } catch (IOException e) {
            return ApiResponse.fail("上传失败");
        }
    }

    @PostMapping("/images/delete")
    public ApiResponse deleteImage(@RequestHeader(value = "X-Admin-Token", required = false) String token,
                                   @RequestBody Map<String, String> body) {
        if (!checkAuth(token)) {
            return ApiResponse.fail("未授权访问");
        }
        String configKey = body.get("configKey");
        String imageUrl = body.get("imageUrl");
        if (configKey == null || configKey.trim().isEmpty()) {
            return ApiResponse.fail("缺少配置项");
        }
        try {
            imageStorageService.deleteManagedImage(imageUrl);
            siteService.removeConfigImageReference(configKey.trim(), imageUrl == null ? "" : imageUrl.trim());
            return ApiResponse.ok("已删除");
        } catch (IllegalArgumentException e) {
            return ApiResponse.fail(e.getMessage());
        } catch (IOException e) {
            return ApiResponse.fail("删除图片失败");
        }
    }

    @PostMapping(value = "/background-assets/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ApiResponse uploadBackgroundAsset(@RequestHeader(value = "X-Admin-Token", required = false) String token,
                                             @RequestParam("slot") String slot,
                                             @RequestParam("file") MultipartFile file) {
        if (!checkAuth(token)) {
            return ApiResponse.fail("未授权访问");
        }
        try {
            BackgroundAssetInfo uploaded = uploadAndPersistBackgroundAsset(slot, file);
            return ApiResponse.ok(uploaded);
        } catch (IllegalArgumentException | IllegalStateException e) {
            return ApiResponse.fail(e.getMessage());
        } catch (IOException e) {
            return ApiResponse.fail("上传失败");
        }
    }

    @PostMapping("/background-assets/multipart/init")
    public ApiResponse initBackgroundMultipartUpload(@RequestHeader(value = "X-Admin-Token", required = false) String token,
                                                     @RequestBody Map<String, Object> body) {
        if (!checkAuth(token)) {
            return ApiResponse.fail("未授权访问");
        }
        try {
            String slot = readText(body, "slot");
            String fileName = readText(body, "fileName");
            String contentType = readText(body, "contentType");
            long fileSize = readLong(body, "fileSize");
            validateBackgroundSlotAndSize(slot, fileName, contentType, fileSize);
            String objectKey = ossStorageService.createObjectKey(slot, fileName);
            return ApiResponse.ok(ossStorageService.initiateMultipart(objectKey, contentType));
        } catch (IllegalArgumentException | IllegalStateException e) {
            return ApiResponse.fail(e.getMessage());
        }
    }

    @PostMapping(value = "/background-assets/multipart/part", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ApiResponse uploadBackgroundMultipartPart(@RequestHeader(value = "X-Admin-Token", required = false) String token,
                                                     @RequestParam("objectKey") String objectKey,
                                                     @RequestParam("uploadId") String uploadId,
                                                     @RequestParam("partNumber") Integer partNumber,
                                                     @RequestParam("file") MultipartFile file) {
        if (!checkAuth(token)) {
            return ApiResponse.fail("未授权访问");
        }
        try {
            if (partNumber == null || partNumber <= 0) {
                throw new IllegalArgumentException("分片序号无效");
            }
            return ApiResponse.ok(ossStorageService.uploadPart(objectKey, uploadId, partNumber, file));
        } catch (IllegalArgumentException | IllegalStateException e) {
            return ApiResponse.fail(e.getMessage());
        } catch (IOException e) {
            return ApiResponse.fail("分片上传失败");
        }
    }

    @PostMapping("/background-assets/multipart/complete")
    public ApiResponse completeBackgroundMultipartUpload(@RequestHeader(value = "X-Admin-Token", required = false) String token,
                                                         @RequestBody Map<String, Object> body) {
        if (!checkAuth(token)) {
            return ApiResponse.fail("未授权访问");
        }
        try {
            String slot = readText(body, "slot");
            String objectKey = readText(body, "objectKey");
            String uploadId = readText(body, "uploadId");
            BackgroundAssetInfo uploaded = ossStorageService.completeMultipart(
                objectKey,
                uploadId,
                readPartList(body.get("parts")),
                readText(body, "fileName"),
                readNullableLong(body, "fileSize")
            );
            persistBackgroundAsset(slot, uploaded);
            return ApiResponse.ok(uploaded);
        } catch (IllegalArgumentException | IllegalStateException e) {
            return ApiResponse.fail(e.getMessage());
        }
    }

    @PostMapping("/background-assets/multipart/abort")
    public ApiResponse abortBackgroundMultipartUpload(@RequestHeader(value = "X-Admin-Token", required = false) String token,
                                                      @RequestBody Map<String, Object> body) {
        if (!checkAuth(token)) {
            return ApiResponse.fail("未授权访问");
        }
        try {
            ossStorageService.abortMultipart(readText(body, "objectKey"), readText(body, "uploadId"));
            return ApiResponse.ok("已取消上传");
        } catch (IllegalArgumentException | IllegalStateException e) {
            return ApiResponse.fail(e.getMessage());
        }
    }

    @PostMapping("/background-assets/delete")
    public ApiResponse deleteBackgroundAsset(@RequestHeader(value = "X-Admin-Token", required = false) String token,
                                             @RequestBody Map<String, Object> body) {
        if (!checkAuth(token)) {
            return ApiResponse.fail("未授权访问");
        }
        try {
            String slot = readText(body, "slot");
            BackgroundAssetInfo removed;
            if (backgroundMediaService.isSequenceSlot(slot)) {
                removed = backgroundMediaService.removeSequenceFrame(readText(body, "objectKey"), readText(body, "url"));
            } else {
                String normalizedSlot = backgroundMediaService.normalizeSingleAssetSlot(slot);
                if ("whole".equals(normalizedSlot)) {
                    List<BackgroundAssetInfo> removedItems = new java.util.ArrayList<>();
                    removedItems.add(backgroundMediaService.removeVideo("whole"));
                    removedItems.add(backgroundMediaService.removeVideo("whole-rev"));
                    removedItems.add(backgroundMediaService.removeVideo("seg1"));
                    removedItems.add(backgroundMediaService.removeVideo("seg2"));
                    removedItems.add(backgroundMediaService.removeVideo("seg3"));
                    removedItems.add(backgroundMediaService.removeVideo("seg1-rev"));
                    removedItems.add(backgroundMediaService.removeVideo("seg2-rev"));
                    removedItems.add(backgroundMediaService.removeVideo("seg3-rev"));
                    for (BackgroundAssetInfo item : removedItems) {
                        deleteManagedBackgroundObject(item);
                    }
                    return ApiResponse.ok("已删除");
                } else if ("mobile-image".equals(normalizedSlot)) {
                    BackgroundAssetInfo removedMain = backgroundMediaService.removeVideo("mobile-image");
                    BackgroundAssetInfo removedPoster = backgroundMediaService.removeVideo("mobile-poster");
                    if (removedMain == null && removedPoster == null) {
                        return ApiResponse.fail("当前没有可删除的资源");
                    }
                    deleteManagedBackgroundObject(removedMain);
                    deleteManagedBackgroundObject(removedPoster);
                    return ApiResponse.ok("已删除");
                } else {
                    removed = backgroundMediaService.removeVideo(slot);
                }
            }
            if (removed == null) {
                return ApiResponse.fail("当前没有可删除的资源");
            }
            deleteManagedBackgroundObject(removed);
            return ApiResponse.ok("已删除");
        } catch (IllegalArgumentException | IllegalStateException e) {
            return ApiResponse.fail(e.getMessage());
        }
    }

    @GetMapping("/leads")
    public ApiResponse getLeads(@RequestHeader(value = "X-Admin-Token", required = false) String token,
                                @RequestParam(value = "page", defaultValue = "1") int page,
                                @RequestParam(value = "size", defaultValue = "10") int size,
                                @RequestParam(value = "phone", required = false) String phone,
                                @RequestParam(value = "startDate", required = false) String startDate,
                                @RequestParam(value = "endDate", required = false) String endDate) {
        if (!checkAuth(token)) {
            return ApiResponse.fail("未授权访问");
        }
        return ApiResponse.ok(siteService.getAdminLeads(page, size, phone, startDate, endDate));
    }

    @GetMapping("/orders")
    public ApiResponse getOrders(@RequestHeader(value = "X-Admin-Token", required = false) String token,
                                 @RequestParam(value = "title", required = false) String title,
                                 @RequestParam(value = "startDate", required = false) String startDate,
                                 @RequestParam(value = "endDate", required = false) String endDate) {
        if (!checkAuth(token)) {
            return ApiResponse.fail("未授权访问");
        }
        return ApiResponse.ok(siteService.getAdminOrders(title, startDate, endDate));
    }

    @PostMapping("/orders")
    public ApiResponse createOrder(@RequestHeader(value = "X-Admin-Token", required = false) String token,
                                    @RequestBody Order order) {
        if (!checkAuth(token)) {
            return ApiResponse.fail("未授权访问");
        }
        return ApiResponse.ok(siteService.saveOrder(order));
    }

    @PutMapping("/orders/{id}/status")
    public ApiResponse updateOrderStatus(@RequestHeader(value = "X-Admin-Token", required = false) String token,
                                          @PathVariable Long id,
                                          @RequestBody Map<String, String> body) {
        if (!checkAuth(token)) {
            return ApiResponse.fail("未授权访问");
        }
        siteService.updateOrderStatus(id, body.get("status"));
        return ApiResponse.ok("状态已更新");
    }

    @PostMapping("/orders/{id}/status")
    public ApiResponse updateOrderStatusPost(@RequestHeader(value = "X-Admin-Token", required = false) String token,
                                             @PathVariable Long id,
                                             @RequestBody Map<String, String> body) {
        return updateOrderStatus(token, id, body);
    }

    @PutMapping("/orders/{id}")
    public ApiResponse updateOrder(@RequestHeader(value = "X-Admin-Token", required = false) String token,
                                   @PathVariable Long id,
                                   @RequestBody Order order) {
        if (!checkAuth(token)) {
            return ApiResponse.fail("未授权访问");
        }
        if (order == null || order.getTitle() == null || order.getTitle().trim().isEmpty()) {
            return ApiResponse.fail("请输入标题");
        }
        return siteService.updateOrder(id, order)
            .<ApiResponse>map(ApiResponse::ok)
            .orElseGet(() -> ApiResponse.fail("订单不存在"));
    }

    @PostMapping("/orders/{id}")
    public ApiResponse updateOrderPost(@RequestHeader(value = "X-Admin-Token", required = false) String token,
                                       @PathVariable Long id,
                                       @RequestBody Order order) {
        return updateOrder(token, id, order);
    }

    @DeleteMapping("/orders/{id}")
    public ApiResponse deleteOrder(@RequestHeader(value = "X-Admin-Token", required = false) String token,
                                   @PathVariable Long id) {
        if (!checkAuth(token)) {
            return ApiResponse.fail("未授权访问");
        }
        boolean deleted = siteService.deleteOrder(id);
        if (!deleted) {
            return ApiResponse.fail("订单不存在");
        }
        return ApiResponse.ok("已删除");
    }

    @GetMapping("/cases")
    public ApiResponse getCases(@RequestHeader(value = "X-Admin-Token", required = false) String token,
                                @RequestParam(value = "page", defaultValue = "1") int page,
                                @RequestParam(value = "size", defaultValue = "10") int size,
                                @RequestParam(value = "title", required = false) String title) {
        if (!checkAuth(token)) {
            return ApiResponse.fail("未授权访问");
        }
        return ApiResponse.ok(siteService.getAdminCases(page, size, title));
    }

    @PostMapping("/cases")
    public ApiResponse createCase(@RequestHeader(value = "X-Admin-Token", required = false) String token,
                                   @RequestBody Case c) {
        if (!checkAuth(token)) {
            return ApiResponse.fail("未授权访问");
        }
        return ApiResponse.ok(siteService.saveCase(c));
    }

    @PutMapping("/cases/{id}")
    public ApiResponse updateCase(@RequestHeader(value = "X-Admin-Token", required = false) String token,
                                  @PathVariable Long id,
                                  @RequestBody Case c) {
        if (!checkAuth(token)) {
            return ApiResponse.fail("未授权访问");
        }
        return siteService.updateCase(id, c)
            .<ApiResponse>map(ApiResponse::ok)
            .orElseGet(() -> ApiResponse.fail("案例不存在"));
    }

    @PostMapping("/cases/{id}")
    public ApiResponse updateCasePost(@RequestHeader(value = "X-Admin-Token", required = false) String token,
                                      @PathVariable Long id,
                                      @RequestBody Case c) {
        return updateCase(token, id, c);
    }

    @DeleteMapping("/cases/{id}")
    public ApiResponse deleteCase(@RequestHeader(value = "X-Admin-Token", required = false) String token,
                                   @PathVariable Long id) {
        if (!checkAuth(token)) {
            return ApiResponse.fail("未授权访问");
        }
        siteService.deleteCase(id);
        return ApiResponse.ok("已删除");
    }

    private BackgroundAssetInfo uploadAndPersistBackgroundAsset(String slot, MultipartFile file) throws IOException {
        validateSlotFile(slot, file);
        String objectKey = ossStorageService.createObjectKey(slot, file.getOriginalFilename());
        BackgroundAssetInfo uploaded = ossStorageService.uploadSimple(file, objectKey);
        persistBackgroundAsset(slot, uploaded);
        return uploaded;
    }

    private void persistBackgroundAsset(String slot, BackgroundAssetInfo uploaded) {
        if (backgroundMediaService.isSequenceSlot(slot)) {
            backgroundMediaService.appendSequenceFrames(List.of(uploaded));
            return;
        }
        String normalizedSlot = backgroundMediaService.normalizeSingleAssetSlot(slot);
        if ("whole".equals(normalizedSlot)) {
            var before = backgroundMediaService.getBackgroundMediaConfig();
            BackgroundAssetInfo previous = backgroundMediaService.replaceVideo("whole", uploaded);
            BackgroundVideoDerivationService.DerivedBackgroundVideos derived =
                backgroundVideoDerivationService.deriveWholeVideoAssets(uploaded);
            backgroundMediaService.replaceVideo("whole-rev", derived.getWholeRev());
            backgroundMediaService.replaceVideo("seg1", derived.getSeg1());
            backgroundMediaService.replaceVideo("seg2", derived.getSeg2());
            backgroundMediaService.replaceVideo("seg3", derived.getSeg3());
            backgroundMediaService.replaceVideo("seg1-rev", derived.getSeg1Rev());
            backgroundMediaService.replaceVideo("seg2-rev", derived.getSeg2Rev());
            backgroundMediaService.replaceVideo("seg3-rev", derived.getSeg3Rev());

            deleteIfReplaced(before.getWholeVideo(), uploaded);
            deleteIfReplaced(before.getWholeVideoRev(), derived.getWholeRev());
            deleteIfReplaced(before.getSeg1(), derived.getSeg1());
            deleteIfReplaced(before.getSeg2(), derived.getSeg2());
            deleteIfReplaced(before.getSeg3(), derived.getSeg3());
            deleteIfReplaced(before.getSeg1Rev(), derived.getSeg1Rev());
            deleteIfReplaced(before.getSeg2Rev(), derived.getSeg2Rev());
            deleteIfReplaced(before.getSeg3Rev(), derived.getSeg3Rev());
            return;
        }

        BackgroundAssetInfo previous = backgroundMediaService.replaceVideo(slot, uploaded);
        deleteIfReplaced(previous, uploaded);
    }

    private void deleteIfReplaced(BackgroundAssetInfo previous, BackgroundAssetInfo uploaded) {
        if (previous == null || uploaded == null) {
            return;
        }
        String prevKey = previous.getObjectKey();
        String nextKey = uploaded.getObjectKey();
        if (prevKey == null || prevKey.trim().isEmpty() || nextKey == null || nextKey.trim().isEmpty()) {
            return;
        }
        if (!prevKey.equals(nextKey)) {
            deleteManagedBackgroundObject(previous);
        }
    }

    private void deleteManagedBackgroundObject(BackgroundAssetInfo assetInfo) {
        if (assetInfo == null || assetInfo.getObjectKey() == null || assetInfo.getObjectKey().trim().isEmpty()) {
            return;
        }
        ossStorageService.deleteObject(assetInfo.getObjectKey());
    }

    private void validateSlotFile(String slot, MultipartFile file) {
        if (backgroundMediaService.isSequenceSlot(slot)) {
            ossStorageService.validateImageFile(file);
            return;
        }
        String normalizedSlot = backgroundMediaService.normalizeSingleAssetSlot(slot);
        if ("mobile-image".equals(normalizedSlot)) {
            validateBackgroundMediaFile(file);
            return;
        }
        if ("mobile-poster".equals(normalizedSlot)) {
            ossStorageService.validateImageFile(file);
            return;
        }
        ossStorageService.validateVideoFile(file);
    }

    private void validateBackgroundSlotAndSize(String slot, String fileName, String contentType, long fileSize) {
        if (fileSize <= 0) {
            throw new IllegalArgumentException("文件大小无效");
        }
        if (backgroundMediaService.isSequenceSlot(slot)) {
            validateBackgroundImageDescriptor(fileName, contentType);
            if (backgroundMediaService.getBackgroundMediaConfig().getSequenceFrames().size() >= BackgroundMediaService.MAX_SEQUENCE_FRAMES) {
                throw new IllegalArgumentException("序列帧最多只能上传500张");
            }
            return;
        }
        String normalizedSlot = backgroundMediaService.normalizeSingleAssetSlot(slot);
        if ("mobile-image".equals(normalizedSlot)) {
            validateBackgroundMediaDescriptor(fileName, contentType);
            return;
        }
        if ("mobile-poster".equals(normalizedSlot)) {
            validateBackgroundImageDescriptor(fileName, contentType);
            return;
        }
        validateBackgroundVideoDescriptor(fileName, contentType);
        if (fileSize > OssStorageService.MAX_VIDEO_SIZE) {
            throw new IllegalArgumentException("视频大小不能超过100M");
        }
    }

    private void validateBackgroundMediaFile(MultipartFile file) {
        try {
            ossStorageService.validateImageFile(file);
            return;
        } catch (IllegalArgumentException ignored) {
        }
        ossStorageService.validateVideoFile(file);
    }

    private void validateBackgroundImageDescriptor(String fileName, String contentType) {
        if (fileName == null || fileName.trim().isEmpty()) {
            throw new IllegalArgumentException("文件名不能为空");
        }
        String normalizedName = fileName.trim().toLowerCase(Locale.ROOT);
        String normalizedType = contentType == null ? "" : contentType.trim().toLowerCase(Locale.ROOT);
        boolean isImage = normalizedType.startsWith("image/")
            || normalizedName.endsWith(".png")
            || normalizedName.endsWith(".jpg")
            || normalizedName.endsWith(".jpeg")
            || normalizedName.endsWith(".webp")
            || normalizedName.endsWith(".gif");
        if (!isImage) {
            throw new IllegalArgumentException("仅支持上传 png/jpg/jpeg/webp/gif 图片");
        }
    }

    private void validateBackgroundMediaDescriptor(String fileName, String contentType) {
        try {
            validateBackgroundImageDescriptor(fileName, contentType);
            return;
        } catch (IllegalArgumentException ignored) {
        }
        validateBackgroundVideoDescriptor(fileName, contentType);
    }

    private void validateBackgroundVideoDescriptor(String fileName, String contentType) {
        if (fileName == null || fileName.trim().isEmpty()) {
            throw new IllegalArgumentException("文件名不能为空");
        }
        String normalizedName = fileName.trim().toLowerCase(Locale.ROOT);
        String normalizedType = contentType == null ? "" : contentType.trim().toLowerCase(Locale.ROOT);
        boolean isVideo = normalizedType.startsWith("video/")
            || normalizedName.endsWith(".mp4")
            || normalizedName.endsWith(".mov")
            || normalizedName.endsWith(".m4v")
            || normalizedName.endsWith(".webm")
            || normalizedName.endsWith(".ogg");
        if (!isVideo) {
            throw new IllegalArgumentException("仅支持上传视频文件");
        }
    }

    private String readText(Map<String, ?> body, String key) {
        if (body == null) {
            return "";
        }
        Object value = body.get(key);
        return value == null ? "" : String.valueOf(value).trim();
    }

    private long readLong(Map<String, ?> body, String key) {
        Long value = readNullableLong(body, key);
        return value == null ? 0L : value;
    }

    private Long readNullableLong(Map<String, ?> body, String key) {
        if (body == null) {
            return null;
        }
        Object value = body.get(key);
        if (value == null) {
            return null;
        }
        if (value instanceof Number number) {
            return number.longValue();
        }
        try {
            return Long.parseLong(String.valueOf(value).trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> readPartList(Object rawParts) {
        if (!(rawParts instanceof List<?> list)) {
            throw new IllegalArgumentException("缺少分片信息");
        }
        return list.stream()
            .filter(item -> item instanceof Map<?, ?>)
            .map(item -> (Map<String, Object>) item)
            .toList();
    }
}
