package com.vidream.dto;

import java.util.ArrayList;
import java.util.List;

public class BackgroundMediaConfig {

    public static final String MOBILE_PLAYBACK_STRATEGY_WECHAT_CONSERVATIVE = "wechat-conservative";
    public static final String MOBILE_PLAYBACK_STRATEGY_BROWSER_ENHANCED = "browser-enhanced";
    public static final String MOBILE_PLAYBACK_STRATEGY_UNIFIED_VISUAL = "unified-visual";

    private BackgroundAssetInfo mainVideo;
    private BackgroundAssetInfo firstVideo;
    private BackgroundAssetInfo secondVideo;
    private BackgroundAssetInfo thirdVideo;
    private BackgroundAssetInfo lastVideo;
    private BackgroundAssetInfo wholeVideo;
    private BackgroundAssetInfo wholeVideoRev;
    private BackgroundAssetInfo seg1;
    private BackgroundAssetInfo seg2;
    private BackgroundAssetInfo seg3;
    private BackgroundAssetInfo seg1Rev;
    private BackgroundAssetInfo seg2Rev;
    private BackgroundAssetInfo seg3Rev;
    private BackgroundAssetInfo mobileBackgroundImage;
    private BackgroundAssetInfo mobileBackgroundPoster;
    private String mobilePlaybackStrategy;
    private List<BackgroundAssetInfo> sequenceFrames = new ArrayList<>();

    public BackgroundAssetInfo getMainVideo() {
        return mainVideo;
    }

    public void setMainVideo(BackgroundAssetInfo mainVideo) {
        this.mainVideo = mainVideo;
    }

    public BackgroundAssetInfo getFirstVideo() {
        return firstVideo;
    }

    public void setFirstVideo(BackgroundAssetInfo firstVideo) {
        this.firstVideo = firstVideo;
    }

    public BackgroundAssetInfo getLastVideo() {
        return lastVideo;
    }

    public void setLastVideo(BackgroundAssetInfo lastVideo) {
        this.lastVideo = lastVideo;
    }

    public BackgroundAssetInfo getWholeVideo() {
        return wholeVideo;
    }

    public void setWholeVideo(BackgroundAssetInfo wholeVideo) {
        this.wholeVideo = wholeVideo;
    }

    public BackgroundAssetInfo getWholeVideoRev() {
        return wholeVideoRev;
    }

    public void setWholeVideoRev(BackgroundAssetInfo wholeVideoRev) {
        this.wholeVideoRev = wholeVideoRev;
    }

    public BackgroundAssetInfo getSeg1() {
        return seg1;
    }

    public void setSeg1(BackgroundAssetInfo seg1) {
        this.seg1 = seg1;
    }

    public BackgroundAssetInfo getSeg2() {
        return seg2;
    }

    public void setSeg2(BackgroundAssetInfo seg2) {
        this.seg2 = seg2;
    }

    public BackgroundAssetInfo getSeg3() {
        return seg3;
    }

    public void setSeg3(BackgroundAssetInfo seg3) {
        this.seg3 = seg3;
    }

    public BackgroundAssetInfo getSeg1Rev() {
        return seg1Rev;
    }

    public void setSeg1Rev(BackgroundAssetInfo seg1Rev) {
        this.seg1Rev = seg1Rev;
    }

    public BackgroundAssetInfo getSeg2Rev() {
        return seg2Rev;
    }

    public void setSeg2Rev(BackgroundAssetInfo seg2Rev) {
        this.seg2Rev = seg2Rev;
    }

    public BackgroundAssetInfo getSeg3Rev() {
        return seg3Rev;
    }

    public void setSeg3Rev(BackgroundAssetInfo seg3Rev) {
        this.seg3Rev = seg3Rev;
    }

    public BackgroundAssetInfo getSecondVideo() {
        return secondVideo;
    }

    public void setSecondVideo(BackgroundAssetInfo secondVideo) {
        this.secondVideo = secondVideo;
    }

    public BackgroundAssetInfo getThirdVideo() {
        return thirdVideo;
    }

    public void setThirdVideo(BackgroundAssetInfo thirdVideo) {
        this.thirdVideo = thirdVideo;
    }

    public BackgroundAssetInfo getMobileBackgroundImage() {
        return mobileBackgroundImage;
    }

    public void setMobileBackgroundImage(BackgroundAssetInfo mobileBackgroundImage) {
        this.mobileBackgroundImage = mobileBackgroundImage;
    }

    public BackgroundAssetInfo getMobileBackgroundPoster() {
        return mobileBackgroundPoster;
    }

    public void setMobileBackgroundPoster(BackgroundAssetInfo mobileBackgroundPoster) {
        this.mobileBackgroundPoster = mobileBackgroundPoster;
    }

    public String getMobilePlaybackStrategy() {
        return mobilePlaybackStrategy;
    }

    public void setMobilePlaybackStrategy(String mobilePlaybackStrategy) {
        this.mobilePlaybackStrategy = mobilePlaybackStrategy;
    }

    public List<BackgroundAssetInfo> getSequenceFrames() {
        return sequenceFrames;
    }

    public void setSequenceFrames(List<BackgroundAssetInfo> sequenceFrames) {
        this.sequenceFrames = sequenceFrames == null ? new ArrayList<>() : new ArrayList<>(sequenceFrames);
    }
}
