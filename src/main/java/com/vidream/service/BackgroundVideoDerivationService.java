package com.vidream.service;

import com.vidream.dto.BackgroundAssetInfo;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.TimeUnit;

@Service
public class BackgroundVideoDerivationService {

    private final OssStorageService ossStorageService;

    public BackgroundVideoDerivationService(OssStorageService ossStorageService) {
        this.ossStorageService = ossStorageService;
    }

    public DerivedBackgroundVideos deriveWholeVideoAssets(BackgroundAssetInfo wholeVideo) {
        if (wholeVideo == null || wholeVideo.getObjectKey() == null || wholeVideo.getObjectKey().trim().isEmpty()) {
            throw new IllegalArgumentException("wholeVideo 无效");
        }
        Path input = null;
        Path wholeRev = null;
        Path seg1 = null;
        Path seg2 = null;
        Path seg3 = null;
        Path seg1Rev = null;
        Path seg2Rev = null;
        Path seg3Rev = null;
        try {
            input = ossStorageService.downloadObjectToTempFile(wholeVideo.getObjectKey(), ".mp4");
            double duration = probeDurationSeconds(input);
            if (!(duration > 0.1)) {
                throw new IllegalStateException("无法读取视频时长");
            }
            double t1 = duration / 3.0;
            double t2 = t1 * 2.0;

            seg1 = Files.createTempFile("vidream-seg1-", ".mp4");
            seg2 = Files.createTempFile("vidream-seg2-", ".mp4");
            seg3 = Files.createTempFile("vidream-seg3-", ".mp4");
            wholeRev = Files.createTempFile("vidream-whole-rev-", ".mp4");
            seg1Rev = Files.createTempFile("vidream-seg1-rev-", ".mp4");
            seg2Rev = Files.createTempFile("vidream-seg2-rev-", ".mp4");
            seg3Rev = Files.createTempFile("vidream-seg3-rev-", ".mp4");

            renderSegment(input, 0, t1, seg1);
            renderSegment(input, t1, t2, seg2);
            renderSegment(input, t2, duration, seg3);
            renderReverse(input, wholeRev);
            renderReverse(seg1, seg1Rev);
            renderReverse(seg2, seg2Rev);
            renderReverse(seg3, seg3Rev);

            return new DerivedBackgroundVideos(
                uploadVideo(seg1, "seg1", "seg1.mp4"),
                uploadVideo(seg2, "seg2", "seg2.mp4"),
                uploadVideo(seg3, "seg3", "seg3.mp4"),
                uploadVideo(seg1Rev, "seg1-rev", "seg1_rev.mp4"),
                uploadVideo(seg2Rev, "seg2-rev", "seg2_rev.mp4"),
                uploadVideo(seg3Rev, "seg3-rev", "seg3_rev.mp4"),
                uploadVideo(wholeRev, "whole-rev", "whole_rev.mp4")
            );
        } catch (IOException e) {
            throw new IllegalStateException("视频处理失败");
        } finally {
            safeDelete(input);
            safeDelete(wholeRev);
            safeDelete(seg1);
            safeDelete(seg2);
            safeDelete(seg3);
            safeDelete(seg1Rev);
            safeDelete(seg2Rev);
            safeDelete(seg3Rev);
        }
    }

    private BackgroundAssetInfo uploadVideo(Path file, String slot, String originalName) {
        String objectKey = ossStorageService.createObjectKey(slot, originalName);
        return ossStorageService.uploadLocalFile(file, objectKey, originalName, "video/mp4");
    }

    private double probeDurationSeconds(Path input) {
        List<String> cmd = new ArrayList<>();
        cmd.add("ffprobe");
        cmd.add("-v");
        cmd.add("error");
        cmd.add("-show_entries");
        cmd.add("format=duration");
        cmd.add("-of");
        cmd.add("default=noprint_wrappers=1:nokey=1");
        cmd.add(input.toAbsolutePath().toString());
        String out = run(cmd, Duration.ofSeconds(10));
        String normalized = out.trim();
        try {
            return Double.parseDouble(normalized);
        } catch (Exception ignored) {
            try {
                return Double.parseDouble(normalized.replace(",", "."));
            } catch (Exception ignored2) {
                return 0;
            }
        }
    }

    private void renderSegment(Path input, double startSec, double endSec, Path out) {
        List<String> cmd = new ArrayList<>();
        cmd.add("ffmpeg");
        cmd.add("-y");
        cmd.add("-ss");
        cmd.add(formatSeconds(startSec));
        cmd.add("-to");
        cmd.add(formatSeconds(endSec));
        cmd.add("-i");
        cmd.add(input.toAbsolutePath().toString());
        cmd.add("-an");
        cmd.add("-c:v");
        cmd.add("libx264");
        cmd.add("-pix_fmt");
        cmd.add("yuv420p");
        cmd.add("-preset");
        cmd.add("veryfast");
        cmd.add("-crf");
        cmd.add("20");
        cmd.add("-g");
        cmd.add("30");
        cmd.add("-keyint_min");
        cmd.add("30");
        cmd.add("-sc_threshold");
        cmd.add("0");
        cmd.add("-movflags");
        cmd.add("+faststart");
        cmd.add(out.toAbsolutePath().toString());
        run(cmd, Duration.ofSeconds(40));
    }

    private void renderReverse(Path input, Path out) {
        List<String> cmd = new ArrayList<>();
        cmd.add("ffmpeg");
        cmd.add("-y");
        cmd.add("-i");
        cmd.add(input.toAbsolutePath().toString());
        cmd.add("-an");
        cmd.add("-vf");
        cmd.add("reverse");
        cmd.add("-c:v");
        cmd.add("libx264");
        cmd.add("-pix_fmt");
        cmd.add("yuv420p");
        cmd.add("-preset");
        cmd.add("veryfast");
        cmd.add("-crf");
        cmd.add("20");
        cmd.add("-g");
        cmd.add("30");
        cmd.add("-keyint_min");
        cmd.add("30");
        cmd.add("-sc_threshold");
        cmd.add("0");
        cmd.add("-movflags");
        cmd.add("+faststart");
        cmd.add(out.toAbsolutePath().toString());
        run(cmd, Duration.ofSeconds(60));
    }

    private String run(List<String> cmd, Duration timeout) {
        ProcessBuilder pb = new ProcessBuilder(cmd);
        pb.redirectErrorStream(true);
        Process p;
        try {
            p = pb.start();
        } catch (IOException e) {
            throw new IllegalStateException("未检测到 ffmpeg/ffprobe，请先安装并加入 PATH");
        }
        ByteArrayOutputStream buf = new ByteArrayOutputStream();
        try (InputStream in = p.getInputStream()) {
            byte[] tmp = new byte[4096];
            int n;
            while ((n = in.read(tmp)) >= 0) {
                buf.write(tmp, 0, n);
            }
        } catch (IOException ignored) {
        }
        boolean finished;
        try {
            finished = p.waitFor(Math.max(1, timeout.toSeconds()), TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            finished = false;
        }
        if (!finished) {
            p.destroyForcibly();
            throw new IllegalStateException("视频处理超时");
        }
        int code = p.exitValue();
        String out = buf.toString(StandardCharsets.UTF_8);
        if (code != 0) {
            throw new IllegalStateException("视频处理失败: " + clip(out));
        }
        return out;
    }

    private String formatSeconds(double sec) {
        double safe = Math.max(0, sec);
        return String.format(Locale.ROOT, "%.3f", safe);
    }

    private String clip(String out) {
        String raw = out == null ? "" : out.trim();
        if (raw.length() <= 800) {
            return raw;
        }
        return raw.substring(raw.length() - 800);
    }

    private void safeDelete(Path p) {
        if (p == null) return;
        try {
            Files.deleteIfExists(p);
        } catch (IOException ignored) {
        }
    }

    public static class DerivedBackgroundVideos {
        private final BackgroundAssetInfo seg1;
        private final BackgroundAssetInfo seg2;
        private final BackgroundAssetInfo seg3;
        private final BackgroundAssetInfo seg1Rev;
        private final BackgroundAssetInfo seg2Rev;
        private final BackgroundAssetInfo seg3Rev;
        private final BackgroundAssetInfo wholeRev;

        public DerivedBackgroundVideos(BackgroundAssetInfo seg1,
                                       BackgroundAssetInfo seg2,
                                       BackgroundAssetInfo seg3,
                                       BackgroundAssetInfo seg1Rev,
                                       BackgroundAssetInfo seg2Rev,
                                       BackgroundAssetInfo seg3Rev,
                                       BackgroundAssetInfo wholeRev) {
            this.seg1 = seg1;
            this.seg2 = seg2;
            this.seg3 = seg3;
            this.seg1Rev = seg1Rev;
            this.seg2Rev = seg2Rev;
            this.seg3Rev = seg3Rev;
            this.wholeRev = wholeRev;
        }

        public BackgroundAssetInfo getSeg1() {
            return seg1;
        }

        public BackgroundAssetInfo getSeg2() {
            return seg2;
        }

        public BackgroundAssetInfo getSeg3() {
            return seg3;
        }

        public BackgroundAssetInfo getSeg1Rev() {
            return seg1Rev;
        }

        public BackgroundAssetInfo getSeg2Rev() {
            return seg2Rev;
        }

        public BackgroundAssetInfo getSeg3Rev() {
            return seg3Rev;
        }

        public BackgroundAssetInfo getWholeRev() {
            return wholeRev;
        }
    }
}

