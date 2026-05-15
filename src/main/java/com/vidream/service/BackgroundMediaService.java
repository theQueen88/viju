package com.vidream.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vidream.dto.BackgroundAssetInfo;
import com.vidream.dto.BackgroundMediaConfig;
import com.vidream.entity.SiteConfig;
import com.vidream.repository.SiteConfigRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;

@Service
public class BackgroundMediaService {

    public static final String CONFIG_KEY = "background_media";
    public static final int MAX_SEQUENCE_FRAMES = 500;
    public static final int MAX_MOBILE_BACKGROUND_IMAGES = 1;

    private final SiteConfigRepository siteConfigRepository;
    private final ObjectMapper objectMapper;

    public BackgroundMediaService(SiteConfigRepository siteConfigRepository, ObjectMapper objectMapper) {
        this.siteConfigRepository = siteConfigRepository;
        this.objectMapper = objectMapper;
    }

    public BackgroundMediaConfig getBackgroundMediaConfig() {
        SiteConfig config = siteConfigRepository.findByConfigKey(CONFIG_KEY)
            .orElse(new SiteConfig(CONFIG_KEY, "{\"sequenceFrames\":[]}"));
        return normalize(parseConfig(config.getConfigValue()));
    }

    @Transactional
    public BackgroundAssetInfo replaceVideo(String slot, BackgroundAssetInfo assetInfo) {
        String normalizedSlot = normalizeSingleAssetSlot(slot);
        BackgroundMediaConfig config = getBackgroundMediaConfig();
        BackgroundAssetInfo previous;
        switch (normalizedSlot) {
            case "main" -> {
                previous = config.getMainVideo();
                config.setMainVideo(assetInfo);
            }
            case "first" -> {
                previous = config.getFirstVideo();
                config.setFirstVideo(assetInfo);
            }
            case "second" -> {
                previous = config.getSecondVideo();
                config.setSecondVideo(assetInfo);
            }
            case "third" -> {
                previous = config.getThirdVideo();
                config.setThirdVideo(assetInfo);
            }
            case "last" -> {
                previous = config.getLastVideo();
                config.setLastVideo(assetInfo);
            }
            case "whole" -> {
                previous = config.getWholeVideo();
                config.setWholeVideo(assetInfo);
            }
            case "whole-rev" -> {
                previous = config.getWholeVideoRev();
                config.setWholeVideoRev(assetInfo);
            }
            case "seg1" -> {
                previous = config.getSeg1();
                config.setSeg1(assetInfo);
            }
            case "seg2" -> {
                previous = config.getSeg2();
                config.setSeg2(assetInfo);
            }
            case "seg3" -> {
                previous = config.getSeg3();
                config.setSeg3(assetInfo);
            }
            case "seg1-rev" -> {
                previous = config.getSeg1Rev();
                config.setSeg1Rev(assetInfo);
            }
            case "seg2-rev" -> {
                previous = config.getSeg2Rev();
                config.setSeg2Rev(assetInfo);
            }
            case "seg3-rev" -> {
                previous = config.getSeg3Rev();
                config.setSeg3Rev(assetInfo);
            }
            case "mobile-image" -> {
                previous = config.getMobileBackgroundImage();
                config.setMobileBackgroundImage(assetInfo);
            }
            case "mobile-poster" -> {
                previous = config.getMobileBackgroundPoster();
                config.setMobileBackgroundPoster(assetInfo);
            }
            default -> throw new IllegalArgumentException("不支持的视频类型");
        }
        saveConfig(config);
        return previous;
    }

    @Transactional
    public BackgroundAssetInfo removeVideo(String slot) {
        String normalizedSlot = normalizeSingleAssetSlot(slot);
        BackgroundMediaConfig config = getBackgroundMediaConfig();
        BackgroundAssetInfo previous;
        switch (normalizedSlot) {
            case "main" -> {
                previous = config.getMainVideo();
                config.setMainVideo(null);
            }
            case "first" -> {
                previous = config.getFirstVideo();
                config.setFirstVideo(null);
            }
            case "second" -> {
                previous = config.getSecondVideo();
                config.setSecondVideo(null);
            }
            case "third" -> {
                previous = config.getThirdVideo();
                config.setThirdVideo(null);
            }
            case "last" -> {
                previous = config.getLastVideo();
                config.setLastVideo(null);
            }
            case "whole" -> {
                previous = config.getWholeVideo();
                config.setWholeVideo(null);
            }
            case "whole-rev" -> {
                previous = config.getWholeVideoRev();
                config.setWholeVideoRev(null);
            }
            case "seg1" -> {
                previous = config.getSeg1();
                config.setSeg1(null);
            }
            case "seg2" -> {
                previous = config.getSeg2();
                config.setSeg2(null);
            }
            case "seg3" -> {
                previous = config.getSeg3();
                config.setSeg3(null);
            }
            case "seg1-rev" -> {
                previous = config.getSeg1Rev();
                config.setSeg1Rev(null);
            }
            case "seg2-rev" -> {
                previous = config.getSeg2Rev();
                config.setSeg2Rev(null);
            }
            case "seg3-rev" -> {
                previous = config.getSeg3Rev();
                config.setSeg3Rev(null);
            }
            case "mobile-image" -> {
                previous = config.getMobileBackgroundImage();
                config.setMobileBackgroundImage(null);
            }
            case "mobile-poster" -> {
                previous = config.getMobileBackgroundPoster();
                config.setMobileBackgroundPoster(null);
            }
            default -> throw new IllegalArgumentException("不支持的视频类型");
        }
        saveConfig(config);
        return previous;
    }

    @Transactional
    public void appendSequenceFrames(List<BackgroundAssetInfo> items) {
        List<BackgroundAssetInfo> safeItems = items == null ? List.of() : items.stream()
            .filter(this::hasAssetUrl)
            .toList();
        if (safeItems.isEmpty()) {
            return;
        }
        BackgroundMediaConfig config = getBackgroundMediaConfig();
        List<BackgroundAssetInfo> frames = new ArrayList<>(config.getSequenceFrames());
        if (frames.size() + safeItems.size() > MAX_SEQUENCE_FRAMES) {
            throw new IllegalArgumentException("序列帧最多只能上传500张");
        }
        frames.addAll(safeItems);
        config.setSequenceFrames(frames);
        saveConfig(config);
    }

    @Transactional
    public BackgroundAssetInfo removeSequenceFrame(String objectKey, String url) {
        String normalizedObjectKey = normalizeText(objectKey);
        String normalizedUrl = normalizeText(url);
        BackgroundMediaConfig config = getBackgroundMediaConfig();
        List<BackgroundAssetInfo> frames = new ArrayList<>(config.getSequenceFrames());
        Iterator<BackgroundAssetInfo> iterator = frames.iterator();
        BackgroundAssetInfo removed = null;
        while (iterator.hasNext()) {
            BackgroundAssetInfo item = iterator.next();
            if (item == null) {
                iterator.remove();
                continue;
            }
            boolean matchedByKey = !normalizedObjectKey.isEmpty() && normalizedObjectKey.equals(normalizeText(item.getObjectKey()));
            boolean matchedByUrl = !normalizedUrl.isEmpty() && normalizedUrl.equals(normalizeText(item.getUrl()));
            if (matchedByKey || matchedByUrl) {
                removed = item;
                iterator.remove();
                break;
            }
        }
        config.setSequenceFrames(frames);
        saveConfig(config);
        return removed;
    }

    public String normalizeVideoSlot(String slot) {
        String normalized = normalizeSingleAssetSlot(slot);
        if ("mobile-image".equals(normalized) || "mobile-poster".equals(normalized)) {
            throw new IllegalArgumentException("不支持的视频类型");
        }
        return normalized;
    }

    public String normalizeSingleAssetSlot(String slot) {
        String normalized = normalizeText(slot).toLowerCase(Locale.ROOT);
        return switch (normalized) {
            case "main", "mainvideo", "main-video" -> "main";
            case "first", "firstvideo", "first-video", "intro", "introvideo" -> "first";
            case "second", "secondvideo", "second-video", "middle", "middlevideo" -> "second";
            case "third", "thirdvideo", "third-video" -> "third";
            case "last", "lastvideo", "last-video", "outro", "outrovideo", "bottom" -> "last";
            case "whole", "wholevideo", "whole-video", "wholeasset", "whole-asset" -> "whole";
            case "whole-rev", "wholerev", "whole_rev", "whole-video-rev", "wholevideorev" -> "whole-rev";
            case "seg1", "segment1", "seg-1" -> "seg1";
            case "seg2", "segment2", "seg-2" -> "seg2";
            case "seg3", "segment3", "seg-3" -> "seg3";
            case "seg1-rev", "seg1rev", "seg1_rev", "segment1-rev", "segment1_rev" -> "seg1-rev";
            case "seg2-rev", "seg2rev", "seg2_rev", "segment2-rev", "segment2_rev" -> "seg2-rev";
            case "seg3-rev", "seg3rev", "seg3_rev", "segment3-rev", "segment3_rev" -> "seg3-rev";
            case "mobile", "mobilebg", "mobile-bg", "mobile-image", "mobilebackgroundimage" -> "mobile-image";
            case "mobileposter", "mobile-poster", "mobile-cover", "mobilecover", "mobile-background-poster" -> "mobile-poster";
            default -> throw new IllegalArgumentException("不支持的背景资源类型");
        };
    }

    public boolean isSequenceSlot(String slot) {
        String normalized = normalizeText(slot).toLowerCase(Locale.ROOT);
        return "sequence".equals(normalized)
            || "sequenceframe".equals(normalized)
            || "sequence-frame".equals(normalized)
            || "frames".equals(normalized);
    }

    private boolean hasAssetUrl(BackgroundAssetInfo item) {
        return item != null && !normalizeText(item.getUrl()).isEmpty();
    }

    private BackgroundMediaConfig parseConfig(String raw) {
        String json = normalizeText(raw);
        if (json.isEmpty()) {
            return new BackgroundMediaConfig();
        }
        try {
            return objectMapper.readValue(json, BackgroundMediaConfig.class);
        } catch (Exception e) {
            return new BackgroundMediaConfig();
        }
    }

    private BackgroundMediaConfig normalize(BackgroundMediaConfig config) {
        BackgroundMediaConfig safeConfig = config == null ? new BackgroundMediaConfig() : config;
        safeConfig.setMainVideo(normalizeAsset(safeConfig.getMainVideo()));
        safeConfig.setFirstVideo(normalizeAsset(safeConfig.getFirstVideo()));
        safeConfig.setSecondVideo(normalizeAsset(safeConfig.getSecondVideo()));
        safeConfig.setThirdVideo(normalizeAsset(safeConfig.getThirdVideo()));
        safeConfig.setLastVideo(normalizeAsset(safeConfig.getLastVideo()));
        safeConfig.setWholeVideo(normalizeAsset(safeConfig.getWholeVideo()));
        safeConfig.setWholeVideoRev(normalizeAsset(safeConfig.getWholeVideoRev()));
        safeConfig.setSeg1(normalizeAsset(safeConfig.getSeg1()));
        safeConfig.setSeg2(normalizeAsset(safeConfig.getSeg2()));
        safeConfig.setSeg3(normalizeAsset(safeConfig.getSeg3()));
        safeConfig.setSeg1Rev(normalizeAsset(safeConfig.getSeg1Rev()));
        safeConfig.setSeg2Rev(normalizeAsset(safeConfig.getSeg2Rev()));
        safeConfig.setSeg3Rev(normalizeAsset(safeConfig.getSeg3Rev()));
        safeConfig.setMobileBackgroundImage(normalizeAsset(safeConfig.getMobileBackgroundImage()));
        safeConfig.setMobileBackgroundPoster(normalizeAsset(safeConfig.getMobileBackgroundPoster()));
        safeConfig.setMobilePlaybackStrategy(normalizePlaybackStrategy(safeConfig.getMobilePlaybackStrategy()));
        List<BackgroundAssetInfo> frames = safeConfig.getSequenceFrames() == null ? new ArrayList<>() : safeConfig.getSequenceFrames();
        List<BackgroundAssetInfo> normalizedFrames = new ArrayList<>();
        for (BackgroundAssetInfo item : frames) {
            BackgroundAssetInfo normalizedItem = normalizeAsset(item);
            if (normalizedItem != null) {
                normalizedFrames.add(normalizedItem);
            }
        }
        safeConfig.setSequenceFrames(normalizedFrames);
        return safeConfig;
    }

    private BackgroundAssetInfo normalizeAsset(BackgroundAssetInfo asset) {
        if (asset == null) {
            return null;
        }
        String url = normalizeText(asset.getUrl());
        String objectKey = normalizeText(asset.getObjectKey());
        String originalName = normalizeText(asset.getOriginalName());
        Long size = asset.getSize();
        if (url.isEmpty() && objectKey.isEmpty() && originalName.isEmpty() && size == null) {
            return null;
        }
        return new BackgroundAssetInfo(url, objectKey, originalName, size);
    }

    private String normalizePlaybackStrategy(String value) {
        String normalized = normalizeText(value).toLowerCase(Locale.ROOT);
        return switch (normalized) {
            case "", "browser", "enhanced", "browser-enhanced" -> BackgroundMediaConfig.MOBILE_PLAYBACK_STRATEGY_BROWSER_ENHANCED;
            case "wechat", "wechat-conservative", "wechat_conservative" -> BackgroundMediaConfig.MOBILE_PLAYBACK_STRATEGY_WECHAT_CONSERVATIVE;
            case "unified", "uniform", "unified-visual", "unified_visual" -> BackgroundMediaConfig.MOBILE_PLAYBACK_STRATEGY_UNIFIED_VISUAL;
            default -> BackgroundMediaConfig.MOBILE_PLAYBACK_STRATEGY_BROWSER_ENHANCED;
        };
    }

    private void saveConfig(BackgroundMediaConfig config) {
        SiteConfig entity = siteConfigRepository.findByConfigKey(CONFIG_KEY)
            .orElse(new SiteConfig(CONFIG_KEY, ""));
        try {
            entity.setConfigValue(objectMapper.writeValueAsString(normalize(config)));
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException("背景配置保存失败");
        }
        siteConfigRepository.save(entity);
    }

    private String normalizeText(String value) {
        return value == null ? "" : value.trim();
    }
}
