(function () {
  "use strict";

  var bridgeRetryBound = false;
  var interactionRetryBound = false;

  function isVideoAssetUrl(url) {
    return /\.(mp4|mov|m4v|webm|ogg)(?:$|[?#])/i.test(String(url || "").trim());
  }

  function isMobileViewport() {
    try {
      return window.matchMedia ? window.matchMedia("(max-width: 900px)").matches : window.innerWidth <= 900;
    } catch (e) {
      return (window.innerWidth || document.documentElement.clientWidth || 0) <= 900;
    }
  }

  function isWechatBrowser() {
    var ua = "";
    try {
      ua = String((window.navigator && window.navigator.userAgent) || "");
    } catch (e) { }
    return /MicroMessenger/i.test(ua);
  }

  function normalizePlaybackStrategy(value) {
    var raw = String(value || "").trim().toLowerCase();
    if (raw === "wechat" || raw === "wechat-conservative" || raw === "wechat_conservative") {
      return "wechat-conservative";
    }
    if (raw === "unified" || raw === "uniform" || raw === "unified-visual" || raw === "unified_visual") {
      return "unified-visual";
    }
    return "browser-enhanced";
  }

  function parseBackgroundMedia(config) {
    if (!config) return null;
    var raw = config.background_media;
    if (!raw) return null;
    try {
      var parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch (e) {
      return null;
    }
  }

  function resolvePageBackgroundUrl(config) {
    var parsed = parseBackgroundMedia(config);
    if (!parsed) return "";
    var posterImage = parsed.mobileBackgroundPoster && typeof parsed.mobileBackgroundPoster === "object"
      ? String(parsed.mobileBackgroundPoster.url || "").trim()
      : "";
    var mobileImage = parsed.mobileBackgroundImage && typeof parsed.mobileBackgroundImage === "object"
      ? String(parsed.mobileBackgroundImage.url || "").trim()
      : "";
    if (isMobileViewport() && mobileImage && !isVideoAssetUrl(mobileImage)) return mobileImage;
    if (isMobileViewport() && posterImage) return posterImage;
    var frames = Array.isArray(parsed.sequenceFrames) ? parsed.sequenceFrames : [];
    var first = frames.length ? frames[0] : null;
    var firstUrl = first && typeof first === "object" ? String(first.url || "").trim() : "";
    if (firstUrl) return firstUrl;
    return isVideoAssetUrl(mobileImage) ? "" : mobileImage;
  }

  function resolveMobileVideoUrl(config) {
    if (!isMobileViewport()) return "";
    var parsed = parseBackgroundMedia(config);
    if (!parsed) return "";
    var mobileAsset = parsed.mobileBackgroundImage;
    var mobileUrl = mobileAsset && typeof mobileAsset === "object" ? String(mobileAsset.url || "").trim() : "";
    return isVideoAssetUrl(mobileUrl) ? mobileUrl : "";
  }

  function shouldActivateVideo(config) {
    if (!isMobileViewport()) return false;
    var parsed = parseBackgroundMedia(config);
    if (!parsed) return false;
    var strategy = normalizePlaybackStrategy(parsed.mobilePlaybackStrategy);
    if (strategy === "unified-visual") return false;
    if (strategy === "wechat-conservative" && isWechatBrowser()) return false;
    return !!resolveMobileVideoUrl(config);
  }

  function tryPlayVideo(videoEl) {
    if (!videoEl) return;
    try {
      videoEl.muted = true;
      videoEl.setAttribute("muted", "");
      videoEl.setAttribute("playsinline", "");
      videoEl.setAttribute("webkit-playsinline", "true");
      videoEl.setAttribute("x5-playsinline", "true");
      videoEl.setAttribute("x5-video-player-type", "h5");
      videoEl.setAttribute("x5-video-player-fullscreen", "false");
    } catch (e) { }
    var playPromise = null;
    try {
      playPromise = videoEl.play();
    } catch (e2) { }
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(function () { });
    }
  }

  function bindWechatBridgeRetry(videoEl) {
    if (bridgeRetryBound || !videoEl || !document || !document.addEventListener) return;
    bridgeRetryBound = true;
    document.addEventListener("WeixinJSBridgeReady", function () {
      tryPlayVideo(videoEl);
    }, false);
  }

  function bindInteractionRetry(videoEl) {
    if (interactionRetryBound || !videoEl || !document || !document.addEventListener) return;
    interactionRetryBound = true;
    var retried = false;
    function retry() {
      if (retried) return;
      retried = true;
      tryPlayVideo(videoEl);
      document.removeEventListener("touchstart", retry, true);
      document.removeEventListener("click", retry, true);
    }
    document.addEventListener("touchstart", retry, true);
    document.addEventListener("click", retry, true);
  }

  function resetVideo(videoEl) {
    if (!videoEl) return;
    videoEl.oncanplay = null;
    videoEl.onerror = null;
    videoEl.classList.remove("is-active");
    videoEl.style.opacity = "0";
    try { videoEl.pause(); } catch (e) { }
    videoEl.removeAttribute("src");
    videoEl.load();
  }

  function applyVideoPoster(config, videoEl) {
    if (!videoEl) return "";
    var posterUrl = resolvePageBackgroundUrl(config);
    if (posterUrl) {
      videoEl.setAttribute("poster", posterUrl);
      return posterUrl;
    }
    videoEl.removeAttribute("poster");
    return "";
  }

  function activateVideo(config, videoEl) {
    if (!videoEl) return;
    if (!shouldActivateVideo(config)) {
      resetVideo(videoEl);
      return;
    }
    var videoUrl = resolveMobileVideoUrl(config);
    if (!videoUrl) {
      resetVideo(videoEl);
      return;
    }
    applyVideoPoster(config, videoEl);
    videoEl.oncanplay = function () {
      videoEl.style.opacity = "1";
    };
    videoEl.onerror = function () {
      videoEl.style.opacity = "0";
      videoEl.classList.remove("is-active");
    };
    videoEl.classList.add("is-active");
    videoEl.style.opacity = "0";
    videoEl.src = videoUrl;
    videoEl.load();
    tryPlayVideo(videoEl);
    bindWechatBridgeRetry(videoEl);
    bindInteractionRetry(videoEl);
  }

  function apply(options) {
    var opts = options || {};
    var config = opts.config || null;
    var pageEl = opts.pageSelector ? document.querySelector(opts.pageSelector) : null;
    var videoEl = opts.videoSelector ? document.querySelector(opts.videoSelector) : null;
    if (pageEl && config) {
      var imageUrl = resolvePageBackgroundUrl(config);
      if (imageUrl) {
        pageEl.style.setProperty("--standalone-page-bg-image", 'url("' + imageUrl.replace(/"/g, '\\"') + '")');
      }
    }
    applyVideoPoster(config, videoEl);
    activateVideo(config, videoEl);
  }

  window.StandaloneMobileBackground = {
    apply: apply
  };
})();
