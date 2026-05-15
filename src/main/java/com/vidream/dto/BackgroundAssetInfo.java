package com.vidream.dto;

public class BackgroundAssetInfo {

    private String url;
    private String objectKey;
    private String originalName;
    private Long size;

    public BackgroundAssetInfo() {
    }

    public BackgroundAssetInfo(String url, String objectKey, String originalName, Long size) {
        this.url = url;
        this.objectKey = objectKey;
        this.originalName = originalName;
        this.size = size;
    }

    public String getUrl() {
        return url;
    }

    public void setUrl(String url) {
        this.url = url;
    }

    public String getObjectKey() {
        return objectKey;
    }

    public void setObjectKey(String objectKey) {
        this.objectKey = objectKey;
    }

    public String getOriginalName() {
        return originalName;
    }

    public void setOriginalName(String originalName) {
        this.originalName = originalName;
    }

    public Long getSize() {
        return size;
    }

    public void setSize(Long size) {
        this.size = size;
    }
}
