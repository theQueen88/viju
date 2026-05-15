(function () {
  "use strict";

  var config = {};
  var currentSection = "home";
  var videos = {};
  var videoControllers = {};
  var observer = null;
  var preloaded = {};
  var FADE_MS = 500;
  var FADE_OUT_LEAD = 0.55;
  var DEFAULT_COMPANY_LOGO = "/images/vidream.png";
  var STORAGE_PREFIX = "vidream";
  var MOBILE_VIEWPORT_MAX = 900;
  var wechatBridgeRetryBound = false;
  var mobileVideoInteractionRetryBound = false;
  var PERSIST_KEY_TONE = STORAGE_PREFIX + ":tone";
  var PERSIST_KEY_LEAD_ID = STORAGE_PREFIX + ":leadId";
  var PERSIST_KEY_INTERESTED_ORDER_IDS = STORAGE_PREFIX + ":interestedOrderIds";
  var SESSION_KEY_LEAD_ID = STORAGE_PREFIX + ":leadId";
  var SESSION_KEY_PENDING_ORDER_ID = STORAGE_PREFIX + ":pendingOrderId";
  var SESSION_KEY_INTERESTED_ORDER_IDS = STORAGE_PREFIX + ":interestedOrderIds";
  var SESSION_KEY_HOME_SCROLL_TARGET = STORAGE_PREFIX + ":homeScrollTarget";
  var DEFAULT_TONE = "deep";
  var bgState = {
    introDone: false,
    isScrolling: false,
    isSnapping: false,
    scrollTimer: 0,
    introCtrl: null,
    firstCtrl: null,
    secondCtrl: null,
    thirdCtrl: null,
    lastCtrl: null,
    transitionCtrl: null,
    transitionActive: false,
    transitionToken: 0,
    transitionToMode: "",
    transitionToSection: "",
    transitionQueue: [],
    media: null,
    ignoreScrollUntil: 0,
    mode: "",
    sequenceRevealRaf: 0,
    sequenceHoldMode: "",
    sequenceHoldToken: 0,
    sequenceSettledSection: "",
    sequenceSettledAt: 0,
    sequenceDirection: 1,
    sequenceTargetMode: "",
    sequenceVisibleAt: 0,
    canvasFadeRaf: 0,
    videoCrossfadeToken: 0,
  };
  var webpSeq = null;
  var bgEls = null;
  var modalState = {
    active: "",
    lastFocus: null,
    scrollY: null,
    scrollLocked: false,
    lockMode: "",
    prevRootOverflow: "",
    prevBodyPaddingRight: "",
    suppressSectionTransitionUntil: 0,
    restoreRaf: 0,
  };
  var viewportState = {
    mobileHome: false,
  };
  var ordersCache = null;
  var ordersFetchPromise = null;
  var leadState = {
    leadId: null,
    pendingOrderId: null,
    interestedOrderIds: [],
    interestedOrderMap: {},
    interestsLoadedLeadId: null,
    interestsFetchPromise: null,
    orderInterestSuccessText: "我们已收到你的订单意向登记。",
  };

  function loadPersistedTone() {
    var raw = null;
    try {
      raw = window.localStorage.getItem(PERSIST_KEY_TONE);
    } catch (e) { }
    if (raw !== "deep" && raw !== "shallow") return DEFAULT_TONE;
    return raw;
  }

  function isMobileHomeExperience() {
    try {
      if (window.matchMedia) return window.matchMedia("(max-width: " + MOBILE_VIEWPORT_MAX + "px)").matches;
    } catch (e) { }
    return (window.innerWidth || document.documentElement.clientWidth || 0) <= MOBILE_VIEWPORT_MAX;
  }

  function applyViewportExperienceClass() {
    var mobile = isMobileHomeExperience();
    viewportState.mobileHome = mobile;
    if (document.documentElement) {
      document.documentElement.classList.toggle("mobile-home-experience", mobile);
    }
    if (document.body) {
      document.body.classList.toggle("mobile-home-experience", mobile);
    }
    return mobile;
  }

  function isWechatBrowser() {
    var ua = "";
    try {
      ua = String((window.navigator && window.navigator.userAgent) || "");
    } catch (e) { }
    return /MicroMessenger/i.test(ua);
  }

  function getModalPagePath(name) {
    if (name === "privacy") return "/privacy";
    if (name === "orderPreview") return "/order-preview";
    if (name === "contactSuccess") return "/contact-success";
    return "";
  }

  function navigateToModalPage(name) {
    var path = getModalPagePath(name);
    if (!path) return false;
    window.location.href = path;
    return true;
  }

  function persistTone(tone) {
    try {
      window.localStorage.setItem(PERSIST_KEY_TONE, tone);
    } catch (e) { }
  }

  function readSessionNumber(key) {
    var raw = null;
    try {
      raw = window.sessionStorage.getItem(key);
    } catch (e) { }
    if (!raw) return null;
    var value = parseInt(raw, 10);
    return isFinite(value) && value > 0 ? value : null;
  }

  function readPersistedNumber(key, fallbackKey) {
    var raw = null;
    try {
      raw = window.localStorage.getItem(key);
    } catch (e) { }
    if (!raw && fallbackKey) {
      return readSessionNumber(fallbackKey);
    }
    if (!raw) return null;
    var value = parseInt(raw, 10);
    return isFinite(value) && value > 0 ? value : null;
  }

  function writeSessionNumber(key, value) {
    try {
      if (typeof value === "number" && isFinite(value) && value > 0) {
        window.sessionStorage.setItem(key, String(Math.round(value)));
      } else {
        window.sessionStorage.removeItem(key);
      }
    } catch (e) { }
  }

  function writePersistedNumber(key, value, mirrorSessionKey) {
    try {
      if (typeof value === "number" && isFinite(value) && value > 0) {
        window.localStorage.setItem(key, String(Math.round(value)));
      } else {
        window.localStorage.removeItem(key);
      }
    } catch (e) { }
    if (mirrorSessionKey) {
      writeSessionNumber(mirrorSessionKey, value);
    }
  }

  function readSessionText(key) {
    var raw = "";
    try {
      raw = window.sessionStorage.getItem(key) || "";
    } catch (e) { }
    return raw ? String(raw) : "";
  }

  function writeSessionText(key, value) {
    try {
      if (typeof value === "string" && value) {
        window.sessionStorage.setItem(key, value);
      } else {
        window.sessionStorage.removeItem(key);
      }
    } catch (e) { }
  }

  function setLeadId(leadId) {
    leadState.leadId = typeof leadId === "number" && isFinite(leadId) && leadId > 0 ? Math.round(leadId) : null;
    writePersistedNumber(PERSIST_KEY_LEAD_ID, leadState.leadId, SESSION_KEY_LEAD_ID);
  }

  function setPendingOrderId(orderId) {
    leadState.pendingOrderId = typeof orderId === "number" && isFinite(orderId) && orderId > 0 ? Math.round(orderId) : null;
    writeSessionNumber(SESSION_KEY_PENDING_ORDER_ID, leadState.pendingOrderId);
  }

  function readSessionNumberList(key) {
    var raw = null;
    try {
      raw = window.sessionStorage.getItem(key);
    } catch (e) { }
    if (!raw) return [];
    try {
      var parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map(function (item) { return parseInt(item, 10); })
        .filter(function (item) { return isFinite(item) && item > 0; });
    } catch (e2) {
      return [];
    }
  }

  function readPersistedNumberList(key, fallbackKey) {
    var raw = null;
    try {
      raw = window.localStorage.getItem(key);
    } catch (e) { }
    if (!raw && fallbackKey) {
      return readSessionNumberList(fallbackKey);
    }
    if (!raw) return [];
    try {
      var parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map(function (item) { return parseInt(item, 10); })
        .filter(function (item) { return isFinite(item) && item > 0; });
    } catch (e2) {
      return [];
    }
  }

  function writeSessionNumberList(key, values) {
    try {
      if (!values || !values.length) {
        window.sessionStorage.removeItem(key);
        return;
      }
      window.sessionStorage.setItem(key, JSON.stringify(values));
    } catch (e) { }
  }

  function writePersistedNumberList(key, values, mirrorSessionKey) {
    try {
      if (!values || !values.length) {
        window.localStorage.removeItem(key);
      } else {
        window.localStorage.setItem(key, JSON.stringify(values));
      }
    } catch (e) { }
    if (mirrorSessionKey) {
      writeSessionNumberList(mirrorSessionKey, values);
    }
  }

  function setInterestedOrderIds(orderIds) {
    var normalized = Array.isArray(orderIds)
      ? orderIds
        .map(function (item) { return parseInt(item, 10); })
        .filter(function (item) { return isFinite(item) && item > 0; })
      : [];
    var unique = [];
    var map = {};
    normalized.forEach(function (item) {
      if (map[item]) return;
      map[item] = true;
      unique.push(item);
    });
    leadState.interestedOrderIds = unique;
    leadState.interestedOrderMap = map;
    writePersistedNumberList(PERSIST_KEY_INTERESTED_ORDER_IDS, unique, SESSION_KEY_INTERESTED_ORDER_IDS);
  }

  function markOrderInterested(orderId) {
    var normalized = parseInt(orderId, 10);
    if (!isFinite(normalized) || normalized <= 0) return;
    if (leadState.interestedOrderMap[normalized]) return;
    var next = leadState.interestedOrderIds.slice();
    next.push(normalized);
    setInterestedOrderIds(next);
  }

  function isOrderInterested(orderId) {
    var normalized = parseInt(orderId, 10);
    if (!isFinite(normalized) || normalized <= 0) return false;
    return !!leadState.interestedOrderMap[normalized];
  }

  function setOrderInterestSuccessText(text) {
    leadState.orderInterestSuccessText = text || "我们已收到你的订单意向登记。";
  }

  function applyTone(tone) {
    var root = document.documentElement;
    root.setAttribute("data-tone", tone);

    var btn = document.getElementById("toneToggle");
    if (btn) {
      btn.setAttribute("aria-pressed", tone === "deep" ? "true" : "false");
    }
  }

  function setupToneToggle() {
    var tone = loadPersistedTone();
    applyTone(tone);

    var btn = document.getElementById("toneToggle");
    if (!btn) return;
    btn.addEventListener("click", function () {
      var cur = document.documentElement.getAttribute("data-tone") || DEFAULT_TONE;
      var next = cur === "deep" ? "shallow" : "deep";
      applyTone(next);
      persistTone(next);
    });
  }

  function attachFadingVideo(v, opts) {
    var rafId = null;
    var fadingOut = false;
    var isActive = false;
    var deactivateToken = 0;
    var options = opts || {};
    var nearEndTriggered = false;
    var fadeMs = typeof options.fadeMs === "number" ? options.fadeMs : FADE_MS;
    var pendingReadyFade = false;

    function cancelFade() {
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    }

    function fadeTo(targetOpacity, durationMs) {
      if (!v) return;
      cancelFade();

      var from = parseFloat(v.style.opacity || "0");
      if (isNaN(from)) from = 0;
      var start = performance.now();
      var dur = typeof durationMs === "number" ? durationMs : fadeMs;
      if (dur <= 0) {
        v.style.opacity = String(targetOpacity);
        return;
      }

      function tick(now) {
        var t = Math.min(1, (now - start) / Math.max(1, dur));
        var eased = 0.5 - 0.5 * Math.cos(t * Math.PI);
        var next = from + (targetOpacity - from) * eased;
        v.style.opacity = String(next);
        if (t < 1) {
          rafId = requestAnimationFrame(tick);
        } else {
          rafId = null;
        }
      }

      rafId = requestAnimationFrame(tick);
    }

    function safePlay() {
      if (!v) return;
      var p = v.play();
      if (p && typeof p.catch === "function") p.catch(function () { });
    }

    function restartFromBeginning() {
      if (!v || !options.restartOnActivate) return;
      try { v.pause(); } catch (e) { }
      try {
        if (Math.abs((v.currentTime || 0) - 0) > 0.001) {
          v.__bgReadyAtZero = false;
          v.currentTime = 0;
        }
      } catch (e2) { }
    }

    function maybeFadeInOnReady() {
      if (!isActive || !pendingReadyFade) return;
      pendingReadyFade = false;
      safePlay();
      fadeTo(1, fadeMs);
    }

    function setActive(nextActive) {
      isActive = !!nextActive;
      deactivateToken++;
      if (isActive) {
        fadingOut = false;
        nearEndTriggered = false;
        v.style.opacity = "0";
        var canFastReuse = !!(
          options.waitForReadyFade &&
          v.__bgReusableReady &&
          v.__bgReadyAtZero &&
          !v.__bgPrimePlayPending &&
          (!options.restartOnActivate || Math.abs((v.currentTime || 0) - 0) < 0.08)
        );
        if (canFastReuse) {
          pendingReadyFade = false;
          safePlay();
          fadeTo(1, Math.min(fadeMs, 120));
          return;
        }
        restartFromBeginning();
        safePlay();
        if (options.waitForReadyFade) {
          pendingReadyFade = true;
          if (v.readyState >= 2 && (!options.restartOnActivate || Math.abs((v.currentTime || 0) - 0) < 0.04)) {
            window.setTimeout(maybeFadeInOnReady, 24);
          }
        } else {
          pendingReadyFade = false;
          fadeTo(1, fadeMs);
        }
      } else {
        pendingReadyFade = false;
        v.__bgReadyAtZero = false;
        var token = deactivateToken;
        fadeTo(0, fadeMs);
        setTimeout(function () {
          if (!isActive && token === deactivateToken) {
            v.pause();
          }
        }, fadeMs + 60);
      }
    }

    function onLoadedData() {
      if (v.readyState >= 2) {
        v.__bgFrameReady = true;
        v.__bgReusableReady = true;
        if (Math.abs((v.currentTime || 0) - 0) < 0.08) v.__bgReadyAtZero = true;
      }
      if (!isActive) {
        v.style.opacity = "0";
        return;
      }
      if (!(parseFloat(v.style.opacity || "0") > 0.2)) {
        v.style.opacity = "0";
      }
      if (options.restartOnActivate) {
        restartFromBeginning();
      }
      maybeFadeInOnReady();
    }

    function onCanPlay() {
      if (v.readyState >= 2) {
        v.__bgFrameReady = true;
        v.__bgReusableReady = true;
        if (Math.abs((v.currentTime || 0) - 0) < 0.08) v.__bgReadyAtZero = true;
      }
      maybeFadeInOnReady();
    }

    function onSeeked() {
      if (v.readyState >= 2) {
        v.__bgFrameReady = true;
        v.__bgReusableReady = true;
        if (Math.abs((v.currentTime || 0) - 0) < 0.08) v.__bgReadyAtZero = true;
      }
      maybeFadeInOnReady();
    }

    function onTimeUpdate() {
      if (!isActive) return;
      if (Math.abs((v.currentTime || 0) - 0) >= 0.08) {
        v.__bgReadyAtZero = false;
      }
      if (fadingOut) return;
      var d = v.duration;
      if (!d || isNaN(d)) return;
      var remaining = d - v.currentTime;
      if (!nearEndTriggered && typeof options.onNearEnd === "function") {
        var nearLead = typeof options.nearEndLead === "number" ? options.nearEndLead : 0;
        if (nearLead > 0 && remaining <= nearLead && remaining > 0) {
          nearEndTriggered = true;
          var handled = false;
          try {
            handled = options.onNearEnd(v, { isActive: isActive, safePlay: safePlay, fadeTo: fadeTo, setActive: setActive });
          } catch (e) { }
          if (handled) return;
        }
      }
      if (options.disableAutoFadeOutLead) return;
      var lead = typeof options.fadeOutLead === "number" ? options.fadeOutLead : FADE_OUT_LEAD;
      if (remaining <= lead && remaining > 0) {
        fadingOut = true;
        fadeTo(0, fadeMs);
      }
    }

    function onEnded() {
      if (typeof options.onEnded === "function") {
        var handled = false;
        try {
          handled = options.onEnded(v, { isActive: isActive, safePlay: safePlay, fadeTo: fadeTo, setActive: setActive });
        } catch (e) { }
        if (handled) return;
      }
      if (!isActive) {
        v.style.opacity = "0";
        return;
      }
      v.style.opacity = "0";
      setTimeout(function () {
        if (!isActive) return;
        v.currentTime = 0;
        safePlay();
        fadingOut = false;
        fadeTo(1, fadeMs);
      }, 100);
    }

    v.loop = !!options.nativeLoop;
    v.addEventListener("loadeddata", onLoadedData);
    v.addEventListener("canplay", onCanPlay);
    v.addEventListener("seeked", onSeeked);
    v.addEventListener("timeupdate", onTimeUpdate);
    if (!options.nativeLoop) {
      v.addEventListener("ended", onEnded);
    }

    return {
      setActive: setActive,
      fadeTo: fadeTo,
      cancel: function () {
        cancelFade();
        v.removeEventListener("loadeddata", onLoadedData);
        v.removeEventListener("canplay", onCanPlay);
        v.removeEventListener("seeked", onSeeked);
        v.removeEventListener("timeupdate", onTimeUpdate);
        if (!options.nativeLoop) {
          v.removeEventListener("ended", onEnded);
        }
      },
    };
  }

  function fetchConfig() {
    return fetch("/api/config")
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (res.success) {
          config = res.data || {};
        }
        return config;
      })
      .catch(function () {
        console.warn("Failed to load config, using defaults");
      });
  }

  function getConfig(key, fallback) {
    return config[key] || fallback || "";
  }

  function resolveCompanyLogo(url, fallback) {
    var value = (url || "").trim();
    return value || fallback || DEFAULT_COMPANY_LOGO;
  }

  function parseJSON(val, fallback) {
    if (!val) return fallback || [];
    try {
      return JSON.parse(val);
    } catch (e) {
      return fallback || [];
    }
  }

  function normalizeBackgroundAssetInfo(item, fallbackUrl) {
    if (!item || typeof item !== "object") {
      return fallbackUrl ? { url: fallbackUrl, objectKey: "", originalName: "", size: 0 } : null;
    }
    var url = String(item.url || "").trim();
    var objectKey = String(item.objectKey || "").trim();
    var originalName = String(item.originalName || "").trim();
    var size = Number(item.size);
    if (!url && fallbackUrl) {
      url = fallbackUrl;
    }
    if (!url && !objectKey && !originalName && !isFinite(size)) {
      return null;
    }
    return {
      url: url,
      objectKey: objectKey,
      originalName: originalName,
      size: isFinite(size) && size > 0 ? size : 0
    };
  }

  function isVideoBackgroundAsset(asset) {
    if (!asset) return false;
    var originalName = String(asset.originalName || asset.name || "").trim().toLowerCase();
    var url = String(asset.url || "").trim().toLowerCase();
    return /\.(mp4|mov|m4v|webm|ogg)(?:$|[?#])/.test(originalName)
      || /\.(mp4|mov|m4v|webm|ogg)(?:$|[?#])/.test(url);
  }

  function buildDefaultSequenceFrameUrls() {
    var urls = [];
    for (var i = 0; i < 109; i++) {
      var index = i < 10 ? "00" + i : (i < 100 ? "0" + i : String(i));
      urls.push("/gif-split/frame_" + index + "_delay-0.1s.webp");
    }
    return urls;
  }

  function normalizeMobilePlaybackStrategy(value) {
    var raw = String(value || "").trim().toLowerCase();
    if (raw === "wechat" || raw === "wechat-conservative" || raw === "wechat_conservative") {
      return "wechat-conservative";
    }
    if (raw === "unified" || raw === "uniform" || raw === "unified-visual" || raw === "unified_visual") {
      return "unified-visual";
    }
    return "browser-enhanced";
  }

  function getBackgroundSequenceSortKey(item) {
    if (!item || typeof item !== "object") return "";
    var originalName = String(item.originalName || "").trim();
    return originalName ? originalName.toLowerCase() : "";
  }

  function compareNaturalAsc(a, b) {
    var left = String(a || "");
    var right = String(b || "");
    var leftParts = left.match(/\d+|\D+/g) || [left];
    var rightParts = right.match(/\d+|\D+/g) || [right];
    var maxLen = Math.max(leftParts.length, rightParts.length);
    for (var i = 0; i < maxLen; i++) {
      var leftPart = leftParts[i];
      var rightPart = rightParts[i];
      if (typeof leftPart === "undefined") return -1;
      if (typeof rightPart === "undefined") return 1;
      var leftIsNum = /^\d+$/.test(leftPart);
      var rightIsNum = /^\d+$/.test(rightPart);
      if (leftIsNum && rightIsNum) {
        var leftNum = parseInt(leftPart, 10);
        var rightNum = parseInt(rightPart, 10);
        if (leftNum !== rightNum) return leftNum - rightNum;
        if (leftPart.length !== rightPart.length) return leftPart.length - rightPart.length;
        continue;
      }
      if (leftPart !== rightPart) return leftPart < rightPart ? -1 : 1;
    }
    return 0;
  }

  function sortBackgroundSequenceFrames(frames) {
    return (Array.isArray(frames) ? frames.slice() : [])
      .map(function (item, index) {
        return {
          item: item,
          index: index,
          key: getBackgroundSequenceSortKey(item)
        };
      })
      .sort(function (a, b) {
        var aHasKey = !!a.key;
        var bHasKey = !!b.key;
        if (aHasKey && bHasKey) {
          var byName = compareNaturalAsc(a.key, b.key);
          if (byName !== 0) return byName;
        } else if (aHasKey !== bHasKey) {
          return aHasKey ? -1 : 1;
        }
        return a.index - b.index;
      })
      .map(function (entry) {
        return entry.item;
      });
  }

  function getBackgroundMediaConfig() {
    var parsed = parseJSON(getConfig("background_media"), {});
    if (!parsed || typeof parsed !== "object") parsed = {};
    var frames = Array.isArray(parsed.sequenceFrames) ? parsed.sequenceFrames : [];
    return {
      mainVideo: normalizeBackgroundAssetInfo(parsed.mainVideo, "/video/bgVideo.mp4"),
      firstVideo: normalizeBackgroundAssetInfo(parsed.firstVideo, "/video/first.mp4"),
      secondVideo: normalizeBackgroundAssetInfo(parsed.secondVideo, ""),
      thirdVideo: normalizeBackgroundAssetInfo(parsed.thirdVideo, ""),
      lastVideo: normalizeBackgroundAssetInfo(parsed.lastVideo, "/video/last.mp4"),
      wholeVideo: normalizeBackgroundAssetInfo(parsed.wholeVideo, ""),
      wholeVideoRev: normalizeBackgroundAssetInfo(parsed.wholeVideoRev, ""),
      seg1: normalizeBackgroundAssetInfo(parsed.seg1, ""),
      seg2: normalizeBackgroundAssetInfo(parsed.seg2, ""),
      seg3: normalizeBackgroundAssetInfo(parsed.seg3, ""),
      seg1Rev: normalizeBackgroundAssetInfo(parsed.seg1Rev, ""),
      seg2Rev: normalizeBackgroundAssetInfo(parsed.seg2Rev, ""),
      seg3Rev: normalizeBackgroundAssetInfo(parsed.seg3Rev, ""),
      mobileBackgroundImage: normalizeBackgroundAssetInfo(parsed.mobileBackgroundImage, ""),
      mobileBackgroundPoster: normalizeBackgroundAssetInfo(parsed.mobileBackgroundPoster, ""),
      mobilePlaybackStrategy: normalizeMobilePlaybackStrategy(parsed.mobilePlaybackStrategy),
      sequenceFrames: sortBackgroundSequenceFrames(frames.map(function (item) {
        return normalizeBackgroundAssetInfo(item, "");
      }).filter(function (item) {
        return !!(item && item.url);
      }))
    };
  }

  function getBackgroundVideoUrl(asset, fallbackUrl) {
    if (asset && asset.url) return asset.url;
    return fallbackUrl || "";
  }

  function getBackgroundSequenceUrls(media) {
    var sequence = media && Array.isArray(media.sequenceFrames) ? media.sequenceFrames : [];
    if (!sequence.length) return buildDefaultSequenceFrameUrls();
    return sequence.map(function (item) { return item.url; }).filter(Boolean);
  }

  function resolveMobileBackgroundFallbackUrl(media) {
    var mobileAsset = media && media.mobileBackgroundImage;
    var mobileImageUrl = String(mobileAsset && mobileAsset.url || "").trim();
    if (mobileImageUrl && !isVideoBackgroundAsset(mobileAsset)) return mobileImageUrl;
    var posterAsset = media && media.mobileBackgroundPoster;
    var posterUrl = String(posterAsset && posterAsset.url || "").trim();
    if (posterUrl) return posterUrl;
    var frameUrls = getBackgroundSequenceUrls(media);
    return String(frameUrls[0] || "").trim();
  }

  function getMobileBackgroundPlaybackDecision(media) {
    if (!viewportState.mobileHome) {
      return { enabled: false, reason: "not-mobile", strategy: normalizeMobilePlaybackStrategy(media && media.mobilePlaybackStrategy) };
    }
    var mobileAsset = media && media.mobileBackgroundImage;
    if (!mobileAsset || !mobileAsset.url || !isVideoBackgroundAsset(mobileAsset)) {
      return { enabled: false, reason: "no-mobile-video", strategy: normalizeMobilePlaybackStrategy(media && media.mobilePlaybackStrategy) };
    }
    var strategy = normalizeMobilePlaybackStrategy(media && media.mobilePlaybackStrategy);
    if (strategy === "unified-visual") {
      return { enabled: false, reason: "strategy-unified-visual", strategy: strategy };
    }
    if (strategy === "wechat-conservative" && isWechatBrowser()) {
      return { enabled: false, reason: "strategy-wechat-conservative", strategy: strategy };
    }
    return { enabled: true, reason: "ok", strategy: strategy };
  }

  function shouldActivateMobileBackgroundVideo(media) {
    return getMobileBackgroundPlaybackDecision(media).enabled;
  }

  function getMobileBackgroundDebugStore() {
    if (typeof window === "undefined") return null;
    if (!window.__vidreamMobileBgDebug || typeof window.__vidreamMobileBgDebug !== "object") {
      window.__vidreamMobileBgDebug = { events: [] };
    }
    return window.__vidreamMobileBgDebug;
  }

  function recordMobileBackgroundStatus(status, detail) {
    var store = getMobileBackgroundDebugStore();
    if (!store) return;
    var payload = detail && typeof detail === "object" ? detail : {};
    var event = {
      status: status,
      at: new Date().toISOString(),
      detail: payload
    };
    store.status = status;
    store.detail = payload;
    store.events = Array.isArray(store.events) ? store.events : [];
    store.events.push(event);
    if (store.events.length > 40) store.events.shift();
    if (document.documentElement) {
      document.documentElement.setAttribute("data-mobile-bg-status", status);
    }
    if (document.body) {
      document.body.setAttribute("data-mobile-bg-status", status);
    }
    try {
      if (window.console && typeof window.console.info === "function") {
        window.console.info("[mobile-bg]", status, payload);
      }
    } catch (e) { }
  }

  function applyMobileBackgroundPoster(videoEl, media) {
    if (!videoEl) return "";
    var posterUrl = resolveMobileBackgroundFallbackUrl(media);
    if (posterUrl) {
      videoEl.setAttribute("poster", posterUrl);
      return posterUrl;
    }
    videoEl.removeAttribute("poster");
    return "";
  }

  function applyBackgroundFallback(media) {
    var fallback = document.getElementById("bgFallback");
    if (!fallback) return;
    var mobileFallbackUrl = resolveMobileBackgroundFallbackUrl(media);
    if (viewportState.mobileHome && mobileFallbackUrl) {
      fallback.style.backgroundImage = 'url("' + mobileFallbackUrl.replace(/"/g, '\\"') + '")';
      return;
    }
    var frameUrls = getBackgroundSequenceUrls(media);
    if (!frameUrls.length) return;
    var firstUrl = String(frameUrls[0] || "").trim();
    if (!firstUrl) return;
    fallback.style.backgroundImage = 'url("' + firstUrl.replace(/"/g, '\\"') + '")';
  }

  var DEFAULT_NAVIGATION_ITEMS = [
    { slot: "home", name: "??", anchor: "home", title: "??" },
    { slot: "resources", name: "??", anchor: "resources", title: "??" },
    { slot: "cooperation", name: "??", anchor: "cooperation", title: "??" },
    { slot: "contact", name: "??", anchor: "contact", title: "??" }
  ];

  var DEFAULT_RESOURCES_CARDS = [
    { title: "???? + AI ????", content: "VIDream ?????????? AI ?????????????????????????????????" },
    { title: "??????", content: "?? 5 ?????????????????????????+??+??????" },
    { title: "???? + ????", content: "????????? 8 ? / ????? 5 ????? VIDream AI ?????????? 100%????? 30%?" }
  ];

  var DEFAULT_COOPERATION_CARDS = [
    { title: "???? + ????", content: "?????????????????????????????? VIDream ?????????????????????" },
    { title: "???? + AI ????", content: "?????????????+??+?????????? VIDream AI ????????????????AI ??????????????????" },
    { title: "???? + ????", content: "?????????????????? 3 ???????? VIDream ????????????????" }
  ];

  var DEFAULT_CONTACT_FIELDS = [
    { key: "phone", label: "???", type: "input", required: true, placeholder: "??????", options: [] },
    { key: "teamScale", label: "????", type: "radio", required: false, placeholder: "", options: ["??", "???", "??"] },
    { key: "usedVidream", label: "????? VIDream ??", type: "radio", required: false, placeholder: "", options: ["?", "?"] },
    { key: "dramaTypes", label: "???????????", type: "checkbox", required: false, placeholder: "", options: ["??", "??", "??", "??", "??", "??"] }
  ];

  function normalizeNavigationItems(items) {
    return DEFAULT_NAVIGATION_ITEMS.map(function (item, index) {
      var current = Array.isArray(items) ? (items[index] || {}) : {};
      return {
        slot: item.slot,
        name: String(current.name || item.name).trim() || item.name,
        anchor: String(current.anchor || item.anchor).trim() || item.anchor,
        title: String(current.title || current.name || item.title).trim() || item.title
      };
    });
  }

  function normalizeCards(items, fallback) {
    var list = Array.isArray(items) && items.length ? items : (fallback || []);
    return list.map(function (item) {
      return {
        title: String((item && item.title) || "").trim(),
        content: String((item && item.content) || "").trim()
      };
    }).filter(function (item) {
      return item.title || item.content;
    });
  }

  function normalizeOptions(options, fallback) {
    var list = Array.isArray(options) ? options : (fallback || []);
    return list.map(function (item) {
      return String(item || "").trim();
    }).filter(Boolean);
  }

  function normalizeContactFields(items) {
    return DEFAULT_CONTACT_FIELDS.map(function (field) {
      var current = Array.isArray(items)
        ? items.filter(function (item) { return item && item.key === field.key; })[0]
        : null;
      return {
        key: field.key,
        label: String((current && current.label) || field.label),
        type: String((current && current.type) || field.type),
        required: current && typeof current.required === "boolean" ? current.required : field.required,
        placeholder: String((current && current.placeholder) || field.placeholder || ""),
        options: normalizeOptions(current && current.options, field.options)
      };
    });
  }

  function resolveContactFields() {
    var rawFields = parseJSON(getConfig("contact_form_fields"), null);
    var normalized = normalizeContactFields(Array.isArray(rawFields) ? rawFields : []);
    if (Array.isArray(rawFields) && rawFields.length) {
      return normalized;
    }
    var legacyDramaTypes = normalizeOptions(parseJSON(getConfig("drama_types"), []), []);
    if (!legacyDramaTypes.length) {
      return normalized;
    }
    return normalized.map(function (field) {
      if (field.key !== "dramaTypes") {
        return field;
      }
      return {
        key: field.key,
        label: field.label,
        type: field.type,
        required: field.required,
        placeholder: field.placeholder,
        options: legacyDramaTypes
      };
    });
  }

  function getNavigationItems() {
    return normalizeNavigationItems(parseJSON(getConfig("navigation_items"), DEFAULT_NAVIGATION_ITEMS));
  }

  function setText(id, value, fallback) {
    var el = document.getElementById(id);
    if (!el) return;
    el.textContent = value || fallback || "";
  }

  function setHtml(id, value, fallback) {
    var el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = (value || fallback || "").replace(/\n/g, "<br>");
  }

  function syncDocumentTitle(title, fallback) {
    var nextTitle = String(title || fallback || "").trim();
    if (!nextTitle) return;
    document.title = nextTitle;
  }

  function renderNavigationLinks() {
    var items = getNavigationItems();
    items.forEach(function (item) {
      var navLink = document.querySelector('.site-navbar-links a[data-nav="' + item.slot + '"]');
      var section = document.querySelector('.section[data-section="' + item.slot + '"]');
      if (navLink) {
        navLink.textContent = item.name;
        navLink.setAttribute("href", "#" + item.anchor);
      }
      if (section) {
        section.id = item.anchor;
      }
      var brand = document.querySelector(".site-brand");
      if (brand && item.slot === "home") {
        brand.setAttribute("href", "#" + item.anchor);
      }
      document.querySelectorAll('[data-cta-slot="' + item.slot + '"]').forEach(function (cta) {
        cta.setAttribute("href", "#" + item.anchor);
      });
    });
  }

  function renderHeroHeading() {
    var heroTitle = getConfig("hero_title") || "\u77ed\u5267\u63a5\u5355\uff1a\u8ba2\u5355\u76f4\u8fde + AI\u63d0\u6548 + \u89c4\u5219\u9a8c\u6536";
    setText("heroTitle", heroTitle);
    syncDocumentTitle(heroTitle);
    setHtml("heroSubtitle", getConfig("hero_subtitle"), "\u817e\u8baf / \u7231\u5947\u827a / \u6606\u4ed1\u4e07\u7ef4 / \u8292\u679cTV / \u65e0\u754c\u6f2b\u7ef4 \u5408\u4f5c\u65b9<br>\u4f9d\u6258 VIDream AI \u52a8\u753b\u5f15\u64ce\uff0c\u4e3a\u521b\u4f5c\u8005\u4e0e\u5de5\u4f5c\u5ba4\u63d0\u4f9b\u771f\u5b9e\u5546\u5355 + \u5de5\u5177\u652f\u6301");
  }

  function renderSectionTitles() {
    setText("resourcesTitle", getConfig("resources_title"), "\u6211\u4eec\u51ed\u4ec0\u4e48\u80fd\u591f\u7ed9\u4f60\u8ba2\u5355\uff1f");
    setText("cooperationTitle", getConfig("cooperation_title"), "\u5982\u4f55\u5408\u4f5c\uff1f\u95e8\u69db\u4f4e\uff0c\u7ed3\u7b97\u5feb\uff0cAI \u5168\u7a0b\u63d0\u6548");
    setText("contactTitle", getConfig("contact_title"), "\u7acb\u5373\u83b7\u53d6\u6700\u65b0\u8ba2\u5355\u5217\u8868");
  }

  function renderSectionCards(containerId, configKey, fallbackCards, isCooperation) {
    var container = document.getElementById(containerId);
    if (!container) return;
    var cards = normalizeCards(parseJSON(getConfig(configKey), fallbackCards), fallbackCards);
    var cardCount = Math.max(1, Math.min(cards.length || 0, 3));
    container.style.setProperty("--card-columns", String(cardCount));
    container.innerHTML = cards.map(function (item, index) {
      var icon = "";
      if (isCooperation) {
        icon = '<div class="step-number"><img src="./images/icon_' + ((index % 3) + 1) + '.png" alt=""></div>';
      }
      return '<div class="resource-card glass">' + icon + '<h3>' + escapeHTML(item.title) + '</h3><p>' + escapeHTML(item.content) + '</p></div>';
    }).join("");
  }

  function getChoiceValue(fieldKey, option, index) {
    if (fieldKey === "usedVidream") {
      var normalized = String(option || "").trim();
      var lower = normalized.toLowerCase();
      if (normalized === "\u662f" || normalized === "\u5df2\u4f7f\u7528" || lower === "true" || lower === "yes" || normalized === "1") return "true";
      if (normalized === "\u5426" || normalized === "\u672a\u4f7f\u7528" || lower === "false" || lower === "no" || normalized === "0") return "false";
      if (index === 0) return "true";
      if (index === 1) return "false";
    }
    return String(option || index || "");
  }

  function renderContactFields() {
    var container = document.getElementById("contactFieldsContainer");
    if (!container) return;
    var fields = resolveContactFields();
    container.innerHTML = fields.map(function (field) {
      var requiredMark = field.required ? '<span class="required">*</span>' : '';
      if (field.type === "radio") {
        return '<div class="form-group">' +
          '<label>' + escapeHTML(field.label) + requiredMark + '</label>' +
          '<div class="radio-group" id="' + escapeHTML(field.key) + 'Group">' +
          field.options.map(function (option, index) {
            var value = getChoiceValue(field.key, option, index);
            return '<label class="radio-item" data-value="' + escapeHTML(value) + '">' +
              '<input type="radio" name="' + escapeHTML(field.key) + '" value="' + escapeHTML(value) + '"> ' + escapeHTML(option) +
              '</label>';
          }).join('') +
          '</div>' +
          '</div>';
      }
      if (field.type === "checkbox") {
        return '<div class="form-group">' +
          '<label>' + escapeHTML(field.label) + requiredMark + '</label>' +
          '<div class="checkbox-group" id="' + escapeHTML(field.key) + 'Group">' +
          field.options.map(function (option) {
            return '<label class="checkbox-item" data-value="' + escapeHTML(option) + '">' +
              '<input type="checkbox" name="' + escapeHTML(field.key) + '" value="' + escapeHTML(option) + '"> ' + escapeHTML(option) +
              '</label>';
          }).join('') +
          '</div>' +
          '</div>';
      }
      var inputType = field.key === "phone" ? "tel" : "text";
      var errorHtml = field.key === "phone" ? '<div class="form-error" id="phoneError">\u8bf7\u8f93\u5165\u6b63\u786e\u768411\u4f4d\u624b\u673a\u53f7</div>' : '';
      return '<div class="form-group">' +
        '<label>' + escapeHTML(field.label) + requiredMark + '</label>' +
        '<input type="' + inputType + '" class="form-input form-check" id="' + escapeHTML(field.key) + '" name="' + escapeHTML(field.key) + '" placeholder="' + escapeHTML(field.placeholder || '') + '"' + (field.key === "phone" ? ' maxlength="11"' : '') + (field.required ? ' required' : '') + '>' +
        errorHtml +
        '</div>';
    }).join('');
  }

  function renderHeroBadges() {
    var badges = parseJSON(getConfig("hero_badges"), ["订单资源", "闭环变现", "AI提效交付"]);
    var container = document.getElementById("heroBadges");
    if (!container) return;
    container.innerHTML = badges
      .map(function (b) { return '<span class="hero-badge glass-sm">' + escapeHTML(b) + "</span>"; })
      .join("");
  }

  function renderHeroStats() {
    var el = document.getElementById("heroStats");
    if (!el) return;
    el.textContent = getConfig("hero_stats", "需求持续更新｜支持代工/定制/版权合作｜提供验收口径与结算路径说明");
  }

  function renderCaseStats() {
    var el = document.getElementById("caseStats");
    if (!el) return;
    var tx = getConfig("case_tx_count", "8");
    var iqy = getConfig("case_iqy_count", "5");
    el.textContent =
      "已交付腾讯定制短剧 " +
      tx +
      " 部 / 爱奇艺项目 " +
      iqy +
      " 部，均通过 VIDream AI 工具高效交付，合格率 100%，周期缩短 30%。";
  }

  function isUsablePartnerLogoUrl(url) {
    return typeof url === "string" && !!url && (url.indexOf("/") === 0 || url.indexOf("http://") === 0 || url.indexOf("https://") === 0);
  }

  function setupPartnerListDragScroll(container) {
    if (!container || container.__dragScrollBound) return;
    container.__dragScrollBound = true;

    var isDragging = false;
    var startX = 0;
    var startScrollLeft = 0;

    function isDesktopViewport() {
      return !(window.matchMedia && window.matchMedia("(max-width: 900px)").matches);
    }

    function stopDragging() {
      if (!isDragging) return;
      isDragging = false;
      container.classList.remove("is-dragging");
    }

    container.addEventListener("mousedown", function (e) {
      if (!isDesktopViewport() || e.button !== 0) return;
      isDragging = true;
      startX = e.clientX;
      startScrollLeft = container.scrollLeft;
      container.classList.add("is-dragging");
      e.preventDefault();
    });

    container.addEventListener("mousemove", function (e) {
      if (!isDragging) return;
      container.scrollLeft = startScrollLeft - (e.clientX - startX);
    });

    container.addEventListener("mouseleave", stopDragging);
    window.addEventListener("mouseup", stopDragging);
  }

  function renderPartnerLogos() {
    var section = document.getElementById("partnerLogos");
    if (!section) return;
    var container = section.querySelector(".partner-list");
    if (!container) return;
    section.hidden = true;
    container.innerHTML = "";

    var raw = getConfig("partner_logos", "");
    if (!raw) return;
    var list = parseJSON(raw, null);
    if (!Array.isArray(list) || list.length === 0) return;

    var hasUsable = false;
    for (var i = 0; i < list.length; i++) {
      var u = (list[i] && (list[i].image_url || list[i].url || list[i].imageUrl)) || "";
      if (isUsablePartnerLogoUrl(u)) {
        hasUsable = true;
        break;
      }
    }
    if (!hasUsable) return;

    var html = list
      .map(function (item) {
        var name = (item && (item.name || item.title)) ? String(item.name || item.title) : "";
        var url = (item && (item.image_url || item.url || item.imageUrl)) ? String(item.image_url || item.url || item.imageUrl) : "";
        if (!isUsablePartnerLogoUrl(url)) {
          return "";
        }
        var w = item && item.width ? String(item.width) : "";
        var h = item && item.height ? String(item.height) : "";
        if (/昆仑/.test(name) || /kunlun/i.test(url)) {
          w = "45";
        } else if (/无界/.test(name) || /wujie/i.test(url)) {
          w = "40";
        } else if (/海外市场/.test(name) || /overseas/i.test(url)) {
          w = "40";
        }
        var style = 'style="' + (w ? ("width:" + escapeHTML(w) + "px;") : "") + (h ? ("height:" + escapeHTML(h) + "px;") : "") + '"';
        return (
          '<div class="partner-item">' +
          '<img class="partner-logo" src="' +
          escapeHTML(url) +
          '" alt="" ' +
          style +
          ' loading="lazy" decoding="async">' +
          '<span class="partner-name">' +
          escapeHTML(name) +
          "</span>" +
          "</div>"
        );
      })
      .filter(Boolean)
      .join("");
    if (!html) return;
    container.innerHTML = html;
    Array.prototype.forEach.call(container.querySelectorAll(".partner-item"), function (itemEl) {
      var nameEl = itemEl.querySelector(".partner-name");
      var logoEl = itemEl.querySelector(".partner-logo");
      var displayName = nameEl ? String(nameEl.textContent || "").trim() : "";
      if (logoEl && /昆仑/.test(displayName)) {
        logoEl.style.width = "45px";
      } else if (logoEl && /无界|海外市场/.test(displayName)) {
        logoEl.style.width = "40px";
      }
    });
    setupPartnerListDragScroll(container);
    section.hidden = false;
  }

  function renderCompanyLogo() {
    var img = document.getElementById("companyLogo");
    if (!img) return;
    img.src = resolveCompanyLogo(getConfig("company_logo"), img.getAttribute("src"));
  }

  function renderResourceDataBar() {
    var el = document.getElementById("resourceDataBar");
    if (!el) return;
    el.textContent = getConfig("resource_data_bar", "引流私域化｜生态规模化｜多元变现持续｜产业协同增信");
  }

  function renderSettlementText() {
    var el = document.getElementById("settlementText");
    if (!el) return;
    var days = getConfig("settlement_days", "3");
    el.textContent =
      "按成片验收（验收标准提前告知），最快 " +
      days +
      " 天结算。全程使用 VIDream 云端协作功能同步进度、对接修改。";
  }

  function renderCooperationNote() {
    var el = document.getElementById("cooperationNote");
    if (!el) return;
    el.textContent = getConfig(
      "cooperation_note",
      "无需预付任何费用，拒绝押金，无隐形条款。平台服务费5%-8%，创作者拿大头。验收不合格可借助AI工具快速修改，降低返工成本。"
    );
  }

  function renderCooperationCase() {
    var el = document.getElementById("cooperationCase");
    if (!el) return;
    el.textContent = getConfig(
      "cooperation_case",
      "某工作室通过我们承接爱奇艺《XX短剧》，借助VIDream AI分镜、正版素材功能，单集制作费5万，15天完成交付，较传统节省10天工期。"
    );
  }

  function renderDramaTypes() {
    renderContactFields();
  }

  function renderPrivacyNotice() {
    var el = document.getElementById("privacyNotice");
    if (!el) return;
    el.textContent = getConfig(
      "privacy_notice",
      "领取即同意《隐私政策》，信息仅用于订单沟通与匹配、资料核验及平台服务通知。我们将严格保护信息安全，不泄露、不滥用，可随时申请删除。"
    );
  }

  function renderWechatQR() {
    var img = document.getElementById("wechatQr");
    if (!img) return;
    var url = getConfig("wechat_qr_url", "/images/wechat-qr.png");
    img.src = url;
  }

  function setupWechatConsult() {
    var trigger = document.querySelector(".wechat-hover");
    var qr = document.getElementById("wechatQr");
    if (!trigger || !qr) return;

    function useTapToggleMode() {
      if (document.body && document.body.classList.contains("mobile-home-experience")) {
        return true;
      }
      return typeof isMobileHomeExperience === "function" && isMobileHomeExperience();
    }

    function show() {
      qr.classList.add("visible");
      trigger.classList.add("is-active");
    }

    function hide() {
      qr.classList.remove("visible");
      trigger.classList.remove("is-active");
    }

    trigger.addEventListener("mouseenter", function () {
      if (!useTapToggleMode()) show();
    });
    trigger.addEventListener("mouseleave", function () {
      if (!useTapToggleMode()) hide();
    });
    trigger.addEventListener("focus", function () {
      if (!useTapToggleMode()) show();
    });
    trigger.addEventListener("blur", function () {
      if (!useTapToggleMode()) hide();
    });

    trigger.addEventListener("click", function (e) {
      try {
        if (useTapToggleMode()) {
          e.preventDefault();
          var isVisible = qr.classList.contains("visible");
          if (isVisible) {
            hide();
            // Remove focus so touch devices do not keep it visible through focus styles.
            trigger.blur();
          } else {
            show();
          }
        }
      } catch (err) { }
    });

    document.addEventListener("click", function (e) {
      if (!trigger.contains(e.target)) hide();
    });
  }

  function renderFooter() {
    var company = getConfig("company_name", "郑州微爱剧科技有限公司");
    var email = getConfig("contact_email", "lihuan@viju.cn");
    var bizEmail = getConfig("vidream_business_email", "cailiang@chongho.net");
    var icp = getConfig("icp_no", "豫ICP备XXXXXX号");
    var psn = getConfig("public_security_no", "410XXXXXXXXXX号");

    var line1 = document.getElementById("footerLine1");
    var line2 = document.getElementById("footerLine2");
    var line3 = document.getElementById("footerLine3");
    var line4 = document.getElementById("footerLine4");
    var mobile = viewportState.mobileHome;
    var privacyAction = mobile
      ? '<a class="site-footer-link" href="/privacy">隐私政策</a>'
      : '<button type="button" class="site-footer-link" data-modal-trigger="privacy">隐私政策</button>';
    var orderPreviewAction = mobile
      ? '<a class="site-footer-link" href="/order-preview">订单预览</a>'
      : '<button type="button" class="site-footer-link" data-modal-trigger="orderPreview">订单预览</button>';
    if (mobile) {
      if (line1) {
        line1.innerHTML =
          '<span class="footer-item footer-brand">' + escapeHTML(company) + '</span>' +
          '<span class="footer-item footer-action">' + privacyAction + '</span>' +
          '<span class="footer-item footer-action">' + orderPreviewAction + '</span>';
      }
      if (line2) {
        line2.innerHTML =
          '<span class="footer-item"><span class="footer-label">联系邮箱</span><a href="mailto:' + escapeHTML(email) + '">' + escapeHTML(email) + '</a></span>' +
          '<span class="footer-item"><span class="footer-label">商务邮箱</span><a href="mailto:' + escapeHTML(bizEmail) + '">' + escapeHTML(bizEmail) + '</a></span>' +
          '';
      }
      if (line3) {
        line3.innerHTML =
          '<span class="footer-item"><span class="footer-label">ICP备案</span><span>' + escapeHTML(icp) + '</span></span>' +
          '<span class="footer-item"><span class="footer-label">公安备案</span><span>' + escapeHTML(psn) + '</span></span>';
      }
      if (line4) line4.innerHTML = "";
      return;
    }
    if (line1) {
      line1.innerHTML =
        '<span class="footer-item footer-brand">' + escapeHTML(company) + '</span>' +
        '<span class="footer-item"><span class="footer-label">联系邮箱</span><a href="mailto:' + escapeHTML(email) + '">' + escapeHTML(email) + '</a></span>' +
        '<span class="footer-item"><span class="footer-label">商务邮箱</span><a href="mailto:' + escapeHTML(bizEmail) + '">' + escapeHTML(bizEmail) + '</a></span>' +
        '<span class="footer-item"><span class="footer-label">微信</span><span>扫码联系</span></span>' +
        '<span class="footer-item footer-action">' + privacyAction + '</span>' +
        '<span class="footer-item footer-action">' + orderPreviewAction + '</span>';
    }

    if (line2) {
      line2.innerHTML =
        '<span class="footer-item"><span class="footer-label">ICP备案</span><span>' + escapeHTML(icp) + '</span></span>' +
        '<span class="footer-item"><span class="footer-label">公安备案</span><span>' + escapeHTML(psn) + '</span></span>';
    }
    if (line3) line3.innerHTML = "";
    if (line4) line4.innerHTML = "";
  }

  function preloadVideo(sectionName) {
    if (videos["intro"]) return;
    if (preloaded[sectionName]) return;
    var v = videos[sectionName];
    if (!v || !v.src) return;
    preloaded[sectionName] = true;
    v.load();
  }

  function getScrollMetrics() {
    var doc = document.documentElement;
    var scrollTop = window.pageYOffset || doc.scrollTop || 0;
    var rawMax = (doc.scrollHeight || 0) - window.innerHeight;
    var maxScroll = Math.max(0, rawMax);
    var progress = maxScroll > 0 ? Math.max(0, Math.min(1, scrollTop / maxScroll)) : 0;
    var canScroll = maxScroll > 8;
    var atTop = progress <= 0.001 || !canScroll;
    var atBottom = canScroll && progress >= 0.999;
    return { scrollTop: scrollTop, maxScroll: maxScroll, progress: progress, atTop: atTop, atBottom: atBottom };
  }

  function setBgSequenceDirection(dir) {
    var next = Number(dir) || 0;
    if (!next) return bgState.sequenceDirection || 1;
    bgState.sequenceDirection = next > 0 ? 1 : -1;
    return bgState.sequenceDirection;
  }

  function getBgSequenceDirection() {
    return bgState.sequenceDirection > 0 ? 1 : -1;
  }

  function updateBgSequenceDirectionFromProgress(metrics) {
    if (!metrics) return getBgSequenceDirection();
    var progress = Math.max(0, Math.min(1, Number(metrics.progress) || 0));
    var prev = typeof bgState.lastSequenceProgress === "number" ? bgState.lastSequenceProgress : progress;
    var delta = progress - prev;
    if (delta > 0.0008) setBgSequenceDirection(1);
    else if (delta < -0.0008) setBgSequenceDirection(-1);
    bgState.lastSequenceProgress = progress;
    return getBgSequenceDirection();
  }

  function getDesktopSequenceProgressMetrics() {
    var fallback = getScrollMetrics();
    var sectionOrder = ["home", "resources", "cooperation", "contact"];
    var segmentCount = Math.max(1, sectionOrder.length - 1);
    if (viewportState.mobileHome) {
      return {
        progress: fallback.progress,
        segmentIndex: Math.min(segmentCount - 1, Math.floor(fallback.progress * segmentCount)),
        localProgress: 0,
        atTop: fallback.atTop,
        atBottom: fallback.atBottom,
      };
    }

    var nav = document.querySelector(".site-navbar");
    var footer = document.getElementById("siteFooter") || document.querySelector(".site-footer");
    var navH = nav ? nav.offsetHeight || 0 : 0;
    var footerH = footer ? footer.offsetHeight || 0 : 64;
    var vh = window.innerHeight || document.documentElement.clientHeight || 0;
    var avail = Math.max(0, vh - navH - footerH);
    var visualCenter = navH + avail / 2;
    var maxScroll = fallback.maxScroll;
    var targets = [];

    for (var i = 0; i < sectionOrder.length; i++) {
      var sectionEl = document.getElementById(sectionOrder[i]);
      if (!sectionEl) {
        return {
          progress: fallback.progress,
          segmentIndex: Math.min(segmentCount - 1, Math.floor(fallback.progress * segmentCount)),
          localProgress: 0,
          atTop: fallback.atTop,
          atBottom: fallback.atBottom,
        };
      }
      if (i === 0) {
        targets.push(0);
        continue;
      }
      var top = sectionEl.offsetTop || 0;
      var h = sectionEl.offsetHeight || vh;
      var y = top + h / 2 - visualCenter;
      targets.push(Math.max(0, Math.min(maxScroll, y)));
    }

    var scrollTop = fallback.scrollTop;
    if (scrollTop <= targets[0] + 1) {
      return { progress: 0, segmentIndex: 0, localProgress: 0, atTop: true, atBottom: false };
    }
    if (scrollTop >= targets[targets.length - 1] - 1) {
      return { progress: 1, segmentIndex: segmentCount - 1, localProgress: 1, atTop: false, atBottom: true };
    }

    for (var ti = 0; ti < targets.length - 1; ti++) {
      var start = targets[ti];
      var end = targets[ti + 1];
      if (scrollTop <= end || ti === targets.length - 2) {
        var span = Math.max(1, end - start);
        var local = Math.max(0, Math.min(1, (scrollTop - start) / span));
        return {
          progress: Math.max(0, Math.min(1, (ti + local) / segmentCount)),
          segmentIndex: Math.min(segmentCount - 1, ti),
          localProgress: local,
          atTop: false,
          atBottom: false,
        };
      }
    }

    return {
      progress: fallback.progress,
      segmentIndex: Math.min(segmentCount - 1, Math.floor(fallback.progress * segmentCount)),
      localProgress: 0,
      atTop: fallback.atTop,
      atBottom: fallback.atBottom,
    };
  }

  function ensureBgEls() {
    if (bgEls) return bgEls;
    bgEls = {
      fallback: document.getElementById("bgFallback"),
      canvas: document.getElementById("bgWebpCanvas"),
      mobile: document.getElementById("mobileBgVideo"),
      intro: document.getElementById("globalBgVideo"),
      transition: document.getElementById("transitionBgVideo"),
      first: document.getElementById("globalBgVideoLoop"),
      second: document.getElementById("secondLoopVideo"),
      third: document.getElementById("thirdLoopVideo"),
      last: document.getElementById("bottomLoopVideo"),
    };
    return bgEls;
  }

  function setCanvasVisible(visible) {
    var els = ensureBgEls();
    if (!els.canvas) return;
    if (bgState.canvasFadeRaf) {
      cancelAnimationFrame(bgState.canvasFadeRaf);
      bgState.canvasFadeRaf = 0;
    }
    if (visible && bgState.mode === "sequence" && !bgState.sequenceVisibleAt) {
      bgState.sequenceVisibleAt = performance.now();
    }
    els.canvas.style.opacity = visible ? "1" : "0";
  }

  function fadeCanvasTo(targetOpacity, durationMs) {
    var els = ensureBgEls();
    if (!els.canvas) return;
    if (bgState.canvasFadeRaf) {
      cancelAnimationFrame(bgState.canvasFadeRaf);
      bgState.canvasFadeRaf = 0;
    }
    var from = parseFloat(els.canvas.style.opacity || "0");
    if (isNaN(from)) from = 0;
    var to = Math.max(0, Math.min(1, Number(targetOpacity) || 0));
    var dur = Math.max(0, Number(durationMs) || 0);
    if (to > 0.001 && bgState.mode === "sequence" && !bgState.sequenceVisibleAt) {
      bgState.sequenceVisibleAt = performance.now();
    }
    if (dur <= 0 || Math.abs(from - to) < 0.001) {
      els.canvas.style.opacity = String(to);
      return;
    }
    var start = performance.now();
    function tick(now) {
      var t = Math.min(1, (now - start) / dur);
      var eased = 0.5 - 0.5 * Math.cos(t * Math.PI);
      var next = from + (to - from) * eased;
      els.canvas.style.opacity = String(next);
      if (t < 1) {
        bgState.canvasFadeRaf = requestAnimationFrame(tick);
      } else {
        bgState.canvasFadeRaf = 0;
      }
    }
    bgState.canvasFadeRaf = requestAnimationFrame(tick);
  }

  function setFallbackVisible(visible) {
    var els = ensureBgEls();
    if (!els.fallback) return;
    els.fallback.style.opacity = visible ? "1" : "0";
  }

  function deactivateBgVideo(el, ctrl, immediate) {
    if (ctrl) {
      ctrl.setActive(false);
      if (immediate && el) el.style.opacity = "0";
      return;
    }
    if (el) el.style.opacity = "0";
  }

  function hideAllBgVideos() {
    var els = ensureBgEls();
    if (els.mobile) {
      els.mobile.style.opacity = "0";
      els.mobile.classList.remove("is-active");
      try { els.mobile.pause(); } catch (e) { }
    }
    if (els.intro) els.intro.style.opacity = "0";
    if (els.transition) els.transition.style.opacity = "0";
    if (els.first) els.first.style.opacity = "0";
    if (els.second) els.second.style.opacity = "0";
    if (els.third) els.third.style.opacity = "0";
    if (els.last) els.last.style.opacity = "0";
    if (bgState.introCtrl) bgState.introCtrl.setActive(false);
    if (bgState.transitionCtrl) bgState.transitionCtrl.setActive(false);
    if (bgState.firstCtrl) bgState.firstCtrl.setActive(false);
    if (bgState.secondCtrl) bgState.secondCtrl.setActive(false);
    if (bgState.thirdCtrl) bgState.thirdCtrl.setActive(false);
    if (bgState.lastCtrl) bgState.lastCtrl.setActive(false);
  }

  function resetMobileBackgroundVideo() {
    var els = ensureBgEls();
    if (!els.mobile) return;
    els.mobile.oncanplay = null;
    els.mobile.onloadedmetadata = null;
    els.mobile.onerror = null;
    els.mobile.style.opacity = "0";
    els.mobile.classList.remove("is-active");
    try { els.mobile.pause(); } catch (e) { }
    els.mobile.removeAttribute("src");
    els.mobile.load();
  }

  function tryPlayMobileBackgroundVideo(videoEl) {
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
    recordMobileBackgroundStatus("play-request", {
      currentSrc: String(videoEl.currentSrc || videoEl.src || "").trim()
    });
    if (playPromise && typeof playPromise.then === "function") {
      playPromise.then(function () {
        recordMobileBackgroundStatus("play-resolved", {
          currentSrc: String(videoEl.currentSrc || videoEl.src || "").trim()
        });
      }).catch(function (err) {
        recordMobileBackgroundStatus("play-rejected", {
          currentSrc: String(videoEl.currentSrc || videoEl.src || "").trim(),
          message: err && err.message ? err.message : ""
        });
      });
    }
  }

  function bindWechatBridgeRetry(videoEl) {
    if (wechatBridgeRetryBound || !videoEl || !document || !document.addEventListener) return;
    wechatBridgeRetryBound = true;
    document.addEventListener("WeixinJSBridgeReady", function () {
      recordMobileBackgroundStatus("wechat-bridge-retry", {
        isWechat: isWechatBrowser()
      });
      tryPlayMobileBackgroundVideo(videoEl);
    }, false);
  }

  function bindMobileInteractionRetry(videoEl) {
    if (mobileVideoInteractionRetryBound || !videoEl || !document || !document.addEventListener) return;
    mobileVideoInteractionRetryBound = true;
    var retried = false;
    function retry() {
      if (retried) return;
      retried = true;
      recordMobileBackgroundStatus("interaction-retry", {
        currentSrc: String(videoEl.currentSrc || videoEl.src || "").trim()
      });
      tryPlayMobileBackgroundVideo(videoEl);
      document.removeEventListener("touchstart", retry, true);
      document.removeEventListener("click", retry, true);
    }
    document.addEventListener("touchstart", retry, true);
    document.addEventListener("click", retry, true);
  }

  function activateMobileBackgroundVideo(media) {
    var els = ensureBgEls();
    var asset = media && media.mobileBackgroundImage;
    var decision = getMobileBackgroundPlaybackDecision(media);
    if (!els.mobile || !asset || !asset.url || !isVideoBackgroundAsset(asset)) {
      applyMobileBackgroundPoster(els.mobile, media);
      recordMobileBackgroundStatus("skipped", {
        reason: "no-mobile-video"
      });
      resetMobileBackgroundVideo();
      return false;
    }
    if (!decision.enabled) {
      applyMobileBackgroundPoster(els.mobile, media);
      recordMobileBackgroundStatus("skipped", decision);
      resetMobileBackgroundVideo();
      return false;
    }
    var mobileVideo = els.mobile;
    var posterUrl = applyMobileBackgroundPoster(mobileVideo, media);
    mobileVideo.onloadedmetadata = function () {
      recordMobileBackgroundStatus("loadedmetadata", {
        currentSrc: String(mobileVideo.currentSrc || mobileVideo.src || "").trim(),
        poster: posterUrl,
        strategy: decision.strategy
      });
    };
    mobileVideo.oncanplay = function () {
      mobileVideo.style.opacity = "1";
      recordMobileBackgroundStatus("canplay", {
        currentSrc: String(mobileVideo.currentSrc || mobileVideo.src || "").trim(),
        poster: posterUrl,
        strategy: decision.strategy
      });
    };
    mobileVideo.onerror = function () {
      mobileVideo.style.opacity = "0";
      mobileVideo.classList.remove("is-active");
      recordMobileBackgroundStatus("error", {
        currentSrc: String(mobileVideo.currentSrc || mobileVideo.src || "").trim(),
        poster: posterUrl,
        strategy: decision.strategy,
        mediaErrorCode: mobileVideo.error ? mobileVideo.error.code : 0
      });
    };
    mobileVideo.classList.add("is-active");
    mobileVideo.style.opacity = "0";
    mobileVideo.src = asset.url;
    mobileVideo.load();
    tryPlayMobileBackgroundVideo(mobileVideo);
    bindWechatBridgeRetry(mobileVideo);
    bindMobileInteractionRetry(mobileVideo);
    return true;
  }

  function isSequenceReadyNow() {
    if (!webpSeq) return false;
    if (!bgState.introDone) return false;
    var m = getDesktopSequenceProgressMetrics();
    if (webpSeq.isReadyForProgress) return webpSeq.isReadyForProgress(m.progress);
    if (webpSeq.isReady) return webpSeq.isReady();
    return false;
  }

  function scheduleSequenceReveal() {
    if (bgState.sequenceRevealRaf) return;
    bgState.sequenceRevealRaf = requestAnimationFrame(function tick() {
      bgState.sequenceRevealRaf = 0;
      if (bgState.mode !== "sequence") return;
      if (!isSequenceReadyNow()) {
        bgState.sequenceRevealRaf = requestAnimationFrame(tick);
        return;
      }
      var els = ensureBgEls();
      fadeCanvasTo(1, 140);
      deactivateBgVideo(els.intro, bgState.introCtrl, false);
      deactivateBgVideo(els.first, bgState.firstCtrl, false);
      deactivateBgVideo(els.second, bgState.secondCtrl, false);
      deactivateBgVideo(els.third, bgState.thirdCtrl, false);
      deactivateBgVideo(els.last, bgState.lastCtrl, false);
    });
  }

  function clearSequenceVideoHold() {
    bgState.sequenceHoldToken++;
    bgState.sequenceHoldMode = "";
  }

  function resetSequenceSectionHold() {
    bgState.sequenceSettledSection = "";
    bgState.sequenceSettledAt = 0;
  }

  function getSequenceToVideoOverlapMs(mode) {
    if (mode === "last") return 240;
    if (mode === "third") return 190;
    if (mode === "second") return 170;
    return 150;
  }

  function getMinimumSequenceVisibleMsForSection(sectionName) {
    var dir = getBgSequenceDirection();
    if (sectionName === "home") return dir < 0 ? 180 : 120;
    if (sectionName === "contact") return dir > 0 ? 220 : 160;
    return dir < 0 ? 240 : 190;
  }

  function getSequenceHoldMsForSection(sectionName) {
    var dir = getBgSequenceDirection();
    if (sectionName === "home") return dir < 0 ? 140 : 90;
    if (sectionName === "contact") return dir > 0 ? 170 : 120;
    return dir < 0 ? 180 : 130;
  }

  function hasSequenceShownLongEnoughForSection(sectionName) {
    var minMs = getMinimumSequenceVisibleMsForSection(sectionName);
    if (minMs <= 0) return true;
    if (!bgState.sequenceVisibleAt) return false;
    return performance.now() - bgState.sequenceVisibleAt >= minMs;
  }

  function releaseSequenceAfterVideoReady(mode, token) {
    window.setTimeout(function () {
      if (token !== bgState.sequenceHoldToken) return;
      if (bgState.mode !== mode) return;
      bgState.sequenceHoldMode = "";
      fadeCanvasTo(0, mode === "last" ? 260 : (mode === "third" ? 220 : 180));
    }, getSequenceToVideoOverlapMs(mode));
  }

  function activateBgVideoFromSequence(mode, el, ctrl) {
    if (!ctrl) {
      clearSequenceVideoHold();
      setCanvasVisible(false);
      return false;
    }
    ctrl.setActive(true);
    clearSequenceVideoHold();
    var token = bgState.sequenceHoldToken;
    bgState.sequenceHoldMode = mode;
    setCanvasVisible(true);
    var released = false;
    function onReady() {
      if (released) return;
      released = true;
      releaseSequenceAfterVideoReady(mode, token);
    }
    if (!el) {
      onReady();
      return true;
    }
    if (isBgVideoReusableReady(el)) {
      window.setTimeout(onReady, 8);
      return true;
    }
    el.addEventListener("loadeddata", onReady, { once: true });
    el.addEventListener("canplay", onReady, { once: true });
    el.addEventListener("seeked", onReady, { once: true });
    if (el.readyState >= 2) {
      window.setTimeout(onReady, 40);
    }
    return true;
  }

  function getVideoCrossfadeMs(nextMode, prevMode) {
    if (prevMode === "intro" && nextMode === "first") return 90;
    if (nextMode === "last") return 220;
    if (nextMode === "third") return 170;
    return 150;
  }

  function activateBgVideoFromVideo(nextMode, prevMode, toEl, toCtrl, fromCtrl) {
    if (!toCtrl) {
      if (fromCtrl) fromCtrl.setActive(false);
      return false;
    }
    bgState.videoCrossfadeToken++;
    var token = bgState.videoCrossfadeToken;
    toCtrl.setActive(true);

    function finish() {
      if (token !== bgState.videoCrossfadeToken) return;
      if (bgState.mode !== nextMode) return;
      window.setTimeout(function () {
        if (token !== bgState.videoCrossfadeToken) return;
        if (bgState.mode !== nextMode) return;
        if (fromCtrl) fromCtrl.setActive(false);
      }, getVideoCrossfadeMs(nextMode, prevMode));
    }

    if (!toEl) {
      finish();
      return true;
    }
    toEl.addEventListener("loadeddata", finish, { once: true });
    toEl.addEventListener("canplay", finish, { once: true });
    toEl.addEventListener("seeked", finish, { once: true });
    if (toEl.readyState >= 2) {
      window.setTimeout(finish, 24);
    }
    return true;
  }

  function getCanonicalBgModeForSection(sectionName) {
    if (sectionName === "home") return "first";
    if (sectionName === "resources") return "second";
    if (sectionName === "cooperation") return "third";
    if (sectionName === "contact") return "last";
    return "sequence";
  }

  function getSectionNameForBgMode(mode) {
    if (mode === "first") return "home";
    if (mode === "second") return "resources";
    if (mode === "third") return "cooperation";
    if (mode === "last") return "contact";
    return "";
  }

  function cancelBgTransition() {
    if (!bgState.transitionActive) return;
    bgState.transitionActive = false;
    bgState.transitionToMode = "";
    bgState.transitionToSection = "";
    bgState.transitionQueue = [];
    bgState.transitionToken++;
    if (bgState.transitionCtrl) bgState.transitionCtrl.setActive(false);
  }

  function getBgTransitionSegUrlByStep(stepIndex, reverse) {
    var media = bgState.media;
    if (!media) return "";
    if (reverse) {
      if (stepIndex === 1) return getBackgroundVideoUrl(media.seg1Rev, "");
      if (stepIndex === 2) return getBackgroundVideoUrl(media.seg2Rev, "");
      if (stepIndex === 3) return getBackgroundVideoUrl(media.seg3Rev, "");
      return "";
    }
    if (stepIndex === 1) return getBackgroundVideoUrl(media.seg1, "");
    if (stepIndex === 2) return getBackgroundVideoUrl(media.seg2, "");
    if (stepIndex === 3) return getBackgroundVideoUrl(media.seg3, "");
    return "";
  }

  function resolveBgTransitionPlan(fromSection, toSection) {
    var order = ["home", "resources", "cooperation", "contact"];
    var fromIdx = order.indexOf(fromSection);
    var toIdx = order.indexOf(toSection);
    if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return null;
    var media = bgState.media;
    if (!media) return null;
    var delta = toIdx - fromIdx;
    var queue = [];
    if (Math.abs(delta) >= 2) {
      if (delta < 0) {
        for (var step = fromIdx; step > toIdx; step--) {
          var reverseSeg = getBgTransitionSegUrlByStep(step, true);
          if (reverseSeg) queue.push(reverseSeg);
        }
      } else {
        for (var nextStep = fromIdx + 1; nextStep <= toIdx; nextStep++) {
          var forwardSeg = getBgTransitionSegUrlByStep(nextStep, false);
          if (forwardSeg) queue.push(forwardSeg);
        }
      }
      return queue.length ? queue : null;
    }
    if (delta === 1) {
      var forwardSeg = getBgTransitionSegUrlByStep(fromIdx + 1, false);
      return forwardSeg ? [forwardSeg] : null;
    }
    if (delta === -1) {
      var backwardSeg = getBgTransitionSegUrlByStep(fromIdx, true);
      return backwardSeg ? [backwardSeg] : null;
    }
    return null;
  }

  function applyBgTransitionRate(transitionEl, token) {
    if (!transitionEl || !bgState.transitionActive) return;
    if (token !== bgState.transitionToken) return;
    var d = Number(transitionEl.duration) || 0;
    if (!(d > 0.2)) return;
    var targetSec = 0.7;
    var rate = d / targetSec;
    rate = Math.max(1.0, Math.min(8.0, rate));
    try { transitionEl.playbackRate = rate; } catch (e) { }
  }

  function loadBgTransitionClip(transitionEl, src, token) {
    if (!transitionEl || !src) return false;
    transitionEl.__bgTransitionToken = token;
    if (transitionEl.src !== src) {
      transitionEl.src = src;
    }
    try {
      transitionEl.playbackRate = 1;
      transitionEl.addEventListener("loadedmetadata", function () {
        applyBgTransitionRate(transitionEl, token);
      }, { once: true });
      applyBgTransitionRate(transitionEl, token);
    } catch (e) { }
    try { transitionEl.load(); } catch (e2) { }
    return true;
  }

  function playBgTransition(fromSection, toSection) {
    if (!bgState.introDone) return false;
    if (bgState.mode === "intro") return false;
    if (bgState.transitionActive) return false;
    if (!fromSection || !toSection || fromSection === toSection) return false;
    var plan = resolveBgTransitionPlan(fromSection, toSection);
    if (!plan || !plan.length) return false;
    var nextMode = getCanonicalBgModeForSection(toSection);
    if (!nextMode || nextMode === "sequence") return false;
    var els = ensureBgEls();
    if (!els.transition) return false;
    bgState.transitionActive = true;
    bgState.transitionToMode = nextMode;
    bgState.transitionToSection = toSection;
    bgState.transitionToken++;
    bgState.transitionQueue = plan.slice(1);
    try {
      els.transition.loop = false;
      els.transition.preload = "auto";
      els.transition.muted = true;
      els.transition.setAttribute("muted", "");
      els.transition.setAttribute("playsinline", "");
    } catch (e) { }
    if (!loadBgTransitionClip(els.transition, plan[0], bgState.transitionToken)) return false;
    ensureBgVideoPrimedForMode(nextMode);
    setBgMode("transition");
    return true;
  }

  function getResolvedSectionNameFromSequenceMetrics(sequenceMetrics) {
    var order = ["home", "resources", "cooperation", "contact"];
    if (!sequenceMetrics) return currentSection || "home";
    var progress = Math.max(0, Math.min(1, Number(sequenceMetrics.progress) || 0));
    if (progress <= 0.001) return "home";
    if (progress >= 0.999) return "contact";
    var segmentCount = Math.max(1, order.length - 1);
    var seg = Math.max(0, Math.min(segmentCount - 1, Number(sequenceMetrics.segmentIndex) || 0));
    var local = Math.max(0, Math.min(1, Number(sequenceMetrics.localProgress) || 0));
    return local >= 0.5
      ? order[Math.min(order.length - 1, seg + 1)]
      : order[seg];
  }

  function getIdleBgModeForSection(sectionName) {
    var canonicalMode = getCanonicalBgModeForSection(sectionName);
    if (canonicalMode === "second") return bgState.secondCtrl ? "second" : "sequence";
    if (canonicalMode === "third") return bgState.thirdCtrl ? "third" : "sequence";
    if (canonicalMode === "last") return bgState.lastCtrl ? "last" : "sequence";
    return canonicalMode;
  }

  function getDesktopIdleBgMode(sequenceMetrics) {
    return getIdleBgModeForSection(getResolvedSectionNameFromSequenceMetrics(sequenceMetrics));
  }

  function primeLikelyBgVideos(sequenceMetrics, resolvedSection, directionalMode) {
    if (directionalMode && directionalMode !== "sequence") {
      ensureBgVideoPrimedForMode(directionalMode);
    }
    if (!sequenceMetrics) return;
    var local = Math.max(0, Math.min(1, Number(sequenceMetrics.localProgress) || 0));
    if (local < 0.3) return;
    var resolvedMode = getIdleBgModeForSection(resolvedSection);
    if (!resolvedMode || resolvedMode === "sequence" || resolvedMode === directionalMode) return;
    ensureBgVideoPrimedForMode(resolvedMode);
  }

  function getDirectionalSequenceTargetMode(sequenceMetrics) {
    var order = ["home", "resources", "cooperation", "contact"];
    if (!sequenceMetrics) return getCanonicalBgModeForSection(currentSection);
    var segmentCount = Math.max(1, order.length - 1);
    var seg = Math.max(0, Math.min(segmentCount - 1, Number(sequenceMetrics.segmentIndex) || 0));
    var dir = getBgSequenceDirection();
    var targetSection = dir > 0 ? order[Math.min(order.length - 1, seg + 1)] : order[Math.max(0, seg)];
    return getCanonicalBgModeForSection(targetSection);
  }

  function getBgVideoElForMode(mode) {
    var els = ensureBgEls();
    if (mode === "intro") return els.intro;
    if (mode === "transition") return els.transition;
    if (mode === "first") return els.first;
    if (mode === "second") return els.second;
    if (mode === "third") return els.third;
    if (mode === "last") return els.last;
    return null;
  }

  function isBgVideoFrameReady(el) {
    if (!el) return false;
    if (el.__bgFrameReady) return true;
    if (el.readyState >= 2) {
      el.__bgFrameReady = true;
      return true;
    }
    return false;
  }

  function isBgVideoReusableReady(el) {
    return !!(
      el &&
      el.__bgReusableReady &&
      el.__bgReadyAtZero &&
      !el.__bgPrimePlayPending &&
      el.readyState >= 2
    );
  }

  function requestBgVideoFramePrime(el) {
    if (!el) return false;
    if (isBgVideoReusableReady(el)) return true;
    if (isBgVideoFrameReady(el) && Math.abs((el.currentTime || 0) - 0) < 0.08) {
      el.__bgReusableReady = true;
      el.__bgReadyAtZero = true;
      return true;
    }
    try {
      el.preload = "auto";
    } catch (e) { }
    if (!el.__bgPrimeRequested) {
      el.__bgPrimeRequested = true;
      try {
        if (!el.src && !el.currentSrc) return false;
        el.load();
      } catch (e2) { }
    }
    if (el.readyState >= 1 && !el.__bgPrimePlayPending) {
      el.__bgPrimePlayPending = true;
      try {
        el.muted = true;
        el.setAttribute("muted", "");
        el.setAttribute("playsinline", "");
      } catch (e3) { }
      try {
        var playPromise = el.play();
        if (playPromise && typeof playPromise.then === "function") {
          playPromise.then(function () {
            window.setTimeout(function () {
              try { el.pause(); } catch (e4) { }
              try { el.currentTime = 0; } catch (e5) { }
              if (el.readyState >= 2) {
                el.__bgFrameReady = true;
                el.__bgReusableReady = true;
                el.__bgReadyAtZero = true;
              }
              el.__bgPrimePlayPending = false;
            }, 80);
          }).catch(function () {
            el.__bgPrimePlayPending = false;
          });
        } else {
          window.setTimeout(function () {
            try { el.pause(); } catch (e6) { }
            try { el.currentTime = 0; } catch (e7) { }
            if (el.readyState >= 2) {
              el.__bgFrameReady = true;
              el.__bgReusableReady = true;
              el.__bgReadyAtZero = true;
            }
            el.__bgPrimePlayPending = false;
          }, 80);
        }
      } catch (e8) {
        el.__bgPrimePlayPending = false;
      }
    }
    return isBgVideoFrameReady(el);
  }

  function ensureBgVideoPrimedForMode(mode) {
    if (!mode || mode === "sequence") return false;
    var el = getBgVideoElForMode(mode);
    if (!el) return false;
    return requestBgVideoFramePrime(el);
  }

  function shouldHoldSequenceForSection(sectionName) {
    if (!sectionName) return false;
    if (!webpSeq || !webpSeq.isSettledToSection) return false;
    var idleMode = getIdleBgModeForSection(sectionName);
    bgState.sequenceTargetMode = idleMode;
    if (idleMode !== "sequence" && !ensureBgVideoPrimedForMode(idleMode)) {
      return true;
    }
    if (!hasSequenceShownLongEnoughForSection(sectionName)) {
      resetSequenceSectionHold();
      return true;
    }
    if (!webpSeq.isSettledToSection(sectionName)) {
      resetSequenceSectionHold();
      return true;
    }
    var holdMs = getSequenceHoldMsForSection(sectionName);
    if (holdMs <= 0) return false;
    if (bgState.sequenceSettledSection !== sectionName) {
      bgState.sequenceSettledSection = sectionName;
      bgState.sequenceSettledAt = performance.now();
      return true;
    }
    return performance.now() - (bgState.sequenceSettledAt || 0) < holdMs;
  }

  function setBgMode(nextMode) {
    if (!nextMode) return;
    var prevMode = bgState.mode;
    if (prevMode === nextMode) {
      if (nextMode === "sequence") {
        clearSequenceVideoHold();
        if (isSequenceReadyNow()) {
          setCanvasVisible(true);
        } else {
          setCanvasVisible(false);
          scheduleSequenceReveal();
        }
        return;
      }
      if (bgState.sequenceHoldMode === nextMode) {
        setCanvasVisible(true);
        if (webpSeq && webpSeq.stopIdleLoop) webpSeq.stopIdleLoop();
        if (webpSeq && webpSeq.clearIdlePlan) webpSeq.clearIdlePlan();
        return;
      }
      setCanvasVisible(false);
      if (webpSeq && webpSeq.stopIdleLoop) webpSeq.stopIdleLoop();
      if (webpSeq && webpSeq.clearIdlePlan) webpSeq.clearIdlePlan();
      return;
    }
    bgState.mode = nextMode;
    if (nextMode !== "sequence") {
      bgState.sequenceVisibleAt = 0;
    }

    var els = ensureBgEls();
    function forceHideVideo(el, ctrl) {
      deactivateBgVideo(el, ctrl, false);
    }

    if (nextMode === "sequence") {
      if (prevMode !== "sequence") {
        bgState.sequenceVisibleAt = 0;
      }
      clearSequenceVideoHold();
      if (isSequenceReadyNow()) {
        if (prevMode === "sequence") setCanvasVisible(true);
        else fadeCanvasTo(1, 140);
        forceHideVideo(els.intro, bgState.introCtrl);
        forceHideVideo(els.first, bgState.firstCtrl);
        forceHideVideo(els.second, bgState.secondCtrl);
        forceHideVideo(els.third, bgState.thirdCtrl);
        forceHideVideo(els.last, bgState.lastCtrl);
      } else {
        setCanvasVisible(false);
        scheduleSequenceReveal();
      }
      return;
    }

    var holdSequence = prevMode === "sequence" && nextMode !== "intro";
    if (webpSeq && webpSeq.stopIdleLoop) webpSeq.stopIdleLoop();
    if (webpSeq && webpSeq.clearIdlePlan) webpSeq.clearIdlePlan();
    if (nextMode === "intro") {
      clearSequenceVideoHold();
      setCanvasVisible(false);
      if (bgState.introCtrl) bgState.introCtrl.setActive(true);
      forceHideVideo(els.transition, bgState.transitionCtrl);
      forceHideVideo(els.first, bgState.firstCtrl);
      forceHideVideo(els.second, bgState.secondCtrl);
      forceHideVideo(els.third, bgState.thirdCtrl);
      forceHideVideo(els.last, bgState.lastCtrl);
      return;
    }
    if (nextMode === "transition") {
      resetSequenceSectionHold();
      clearSequenceVideoHold();
      setCanvasVisible(false);
      if (bgState.transitionCtrl) bgState.transitionCtrl.setActive(true);
      forceHideVideo(els.intro, bgState.introCtrl);
      forceHideVideo(els.first, bgState.firstCtrl);
      forceHideVideo(els.second, bgState.secondCtrl);
      forceHideVideo(els.third, bgState.thirdCtrl);
      forceHideVideo(els.last, bgState.lastCtrl);
      return;
    }
    if (nextMode === "first") {
      resetSequenceSectionHold();
      if (prevMode === "intro") {
        activateBgVideoFromVideo("first", "intro", els.first, bgState.firstCtrl, bgState.introCtrl);
      } else if (prevMode === "transition") {
        activateBgVideoFromVideo("first", "transition", els.first, bgState.firstCtrl, bgState.transitionCtrl);
      } else if (holdSequence) {
        activateBgVideoFromSequence("first", els.first, bgState.firstCtrl);
      } else {
        clearSequenceVideoHold();
        setCanvasVisible(false);
        if (bgState.firstCtrl) bgState.firstCtrl.setActive(true);
      }
      if (prevMode !== "intro") {
        forceHideVideo(els.intro, bgState.introCtrl);
      }
      if (prevMode !== "transition") forceHideVideo(els.transition, bgState.transitionCtrl);
      forceHideVideo(els.second, bgState.secondCtrl);
      forceHideVideo(els.third, bgState.thirdCtrl);
      forceHideVideo(els.last, bgState.lastCtrl);
      return;
    }
    if (nextMode === "second") {
      resetSequenceSectionHold();
      if (prevMode === "transition") {
        activateBgVideoFromVideo("second", "transition", els.second, bgState.secondCtrl, bgState.transitionCtrl);
      } else if (holdSequence) {
        activateBgVideoFromSequence("second", els.second, bgState.secondCtrl);
      } else {
        clearSequenceVideoHold();
        setCanvasVisible(false);
        if (bgState.secondCtrl) bgState.secondCtrl.setActive(true);
      }
      forceHideVideo(els.intro, bgState.introCtrl);
      forceHideVideo(els.first, bgState.firstCtrl);
      if (prevMode !== "transition") forceHideVideo(els.transition, bgState.transitionCtrl);
      forceHideVideo(els.third, bgState.thirdCtrl);
      forceHideVideo(els.last, bgState.lastCtrl);
      return;
    }
    if (nextMode === "third") {
      resetSequenceSectionHold();
      if (prevMode === "transition") {
        activateBgVideoFromVideo("third", "transition", els.third, bgState.thirdCtrl, bgState.transitionCtrl);
      } else if (holdSequence) {
        activateBgVideoFromSequence("third", els.third, bgState.thirdCtrl);
      } else {
        clearSequenceVideoHold();
        setCanvasVisible(false);
        if (bgState.thirdCtrl) bgState.thirdCtrl.setActive(true);
      }
      forceHideVideo(els.intro, bgState.introCtrl);
      forceHideVideo(els.first, bgState.firstCtrl);
      forceHideVideo(els.second, bgState.secondCtrl);
      if (prevMode !== "transition") forceHideVideo(els.transition, bgState.transitionCtrl);
      forceHideVideo(els.last, bgState.lastCtrl);
      return;
    }
    if (nextMode === "last") {
      resetSequenceSectionHold();
      if (prevMode === "transition") {
        activateBgVideoFromVideo("last", "transition", els.last, bgState.lastCtrl, bgState.transitionCtrl);
      } else if (holdSequence) {
        activateBgVideoFromSequence("last", els.last, bgState.lastCtrl);
      } else {
        clearSequenceVideoHold();
        setCanvasVisible(false);
        if (bgState.lastCtrl) bgState.lastCtrl.setActive(true);
      }
      forceHideVideo(els.intro, bgState.introCtrl);
      forceHideVideo(els.first, bgState.firstCtrl);
      forceHideVideo(els.second, bgState.secondCtrl);
      forceHideVideo(els.third, bgState.thirdCtrl);
      if (prevMode !== "transition") forceHideVideo(els.transition, bgState.transitionCtrl);
      return;
    }
  }

  function syncBackgroundToScroll() {
    if (!bgState.introDone) return;
    if (document.body && document.body.classList.contains("modal-open")) return;
    if (bgState.transitionActive) return;
    if (bgState.isScrolling || bgState.isSnapping) return;
    var settled = currentSection || "home";
    var idleMode = getIdleBgModeForSection(settled);
    if (idleMode && idleMode !== "sequence") {
      setBgMode(idleMode);
    } else {
      setBgMode(getCanonicalBgModeForSection(settled));
    }
  }

  function setupWebpSequence(canvas, frameSources) {
    var sequenceSources = Array.isArray(frameSources) ? frameSources.filter(Boolean) : [];
    var FRAME_COUNT = sequenceSources.length || 109;
    var FRAME_SUFFIX = "_delay-0.1s.webp";
    var CACHE_WINDOW = Math.max(24, Math.min(54, Math.round(FRAME_COUNT / 6)));
    var CACHE_KEEP = Math.max(240, Math.min(420, CACHE_WINDOW * 7));
    var DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    var IDLE_LOOP_FPS = 0.9;
    var IDLE_PAIR_PERIOD_MS = 3600;
    var IDLE_MOTION_PX_X = 6;
    var IDLE_MOTION_PX_Y = 3.6;
    var IDLE_MOTION_BREATHE = 0.012;
    var IDLE_MOTION_FREQ_X = 0.95;
    var IDLE_MOTION_FREQ_Y = 0.82;
    var IDLE_MOTION_FREQ_BREATHE = 1.08;
    var SECTION_ORDER = ["home", "resources", "cooperation", "contact"];
    var SEGMENT_COUNT = Math.max(1, SECTION_ORDER.length - 1);
    var SEGMENT_FRAME_SPAN = Math.max(1, (FRAME_COUNT - 1) / SEGMENT_COUNT);

    var ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
    var bufCanvas = document.createElement("canvas");
    var bufCtx = bufCanvas.getContext("2d", { alpha: false, desynchronized: true });
    var MIX_W = 480;
    var MIX_H = 270;
    var mixCanvas = document.createElement("canvas");
    mixCanvas.width = MIX_W;
    mixCanvas.height = MIX_H;
    var mixCtx = mixCanvas.getContext("2d", { alpha: false, desynchronized: true, willReadFrequently: true });
    var cache = new Map();
    var loading = new Map();
    var rafId = 0;
    var current = 0;
    var target = 0;
    var running = false;
    var lastRenderIdx = -1;
    var lastRenderFrame = -1;
    var snapBoost = false;
    var preloadAllStarted = false;
    var motionLastTs = 0;
    var baseIW = 0;
    var baseIH = 0;
    var mixCache = new Map();
    var mixLoading = new Set();
    var mixImgData = mixCtx ? mixCtx.createImageData(MIX_W, MIX_H) : null;
    var srgbToLin = new Float32Array(256);
    var linToSrgb = new Uint8ClampedArray(4096);
    var idleLoop = {
      active: false,
      min: 0,
      max: 0,
      idx: 0,
      dir: 1,
      lastTs: 0,
      acc: 0,
      fromIdx: 0,
      toIdx: 0,
      blendStart: 0,
      aIdx: 0,
      bIdx: 0,
      pairStart: 0,
    };
    var idlePlan = { active: false, endIdx: 0, aIdx: 0, bIdx: 0, lastTs: 0 };

    for (var li = 0; li < 256; li++) {
      srgbToLin[li] = Math.pow(li / 255, 2.2);
    }
    for (var lj = 0; lj < 4096; lj++) {
      linToSrgb[lj] = Math.max(0, Math.min(255, Math.round(Math.pow(lj / 4095, 1 / 2.2) * 255)));
    }

    if (ctx) {
      ctx.imageSmoothingEnabled = true;
      try { ctx.imageSmoothingQuality = "high"; } catch (e) { }
    }
    if (bufCtx) {
      bufCtx.imageSmoothingEnabled = true;
      try { bufCtx.imageSmoothingQuality = "high"; } catch (e) { }
    }
    if (mixCtx) {
      mixCtx.imageSmoothingEnabled = true;
      try { mixCtx.imageSmoothingQuality = "high"; } catch (e) { }
    }

    function scheduleMixData(idx, img) {
      if (!mixCtx || !img) return;
      if (mixCache.has(idx)) return;
      if (mixLoading.has(idx)) return;
      mixLoading.add(idx);
      var run = function () {
        try {
          mixCtx.clearRect(0, 0, MIX_W, MIX_H);
          mixCtx.globalAlpha = 1;
          mixCtx.drawImage(img, 0, 0, MIX_W, MIX_H);
          var data = mixCtx.getImageData(0, 0, MIX_W, MIX_H).data;
          mixCache.set(idx, new Uint8ClampedArray(data));
        } catch (e) { }
        mixLoading.delete(idx);
      };
      if (typeof requestIdleCallback === "function") requestIdleCallback(run, { timeout: 800 });
      else window.setTimeout(run, 0);
    }

    function pad3(n) {
      if (n < 10) return "00" + n;
      if (n < 100) return "0" + n;
      return String(n);
    }

    function clampIndex(i) {
      if (i < 0) return 0;
      if (i >= FRAME_COUNT) return FRAME_COUNT - 1;
      return i;
    }

    function frameUrl(i) {
      if (sequenceSources.length) {
        return sequenceSources[clampIndex(i)] || "";
      }
      return "/gif-split/frame_" + pad3(i) + FRAME_SUFFIX;
    }

    function ensureFrame(i) {
      var idx = clampIndex(i);
      if (cache.has(idx)) {
        var cachedImg = cache.get(idx);
        scheduleMixData(idx, cachedImg);
        return Promise.resolve(cachedImg);
      }
      var existing = loading.get(idx);
      if (existing && existing.p) return existing.p;
      var img = new Image();
      img.decoding = "async";
      img.loading = "eager";
      var src = frameUrl(idx);
      if (!src) return Promise.resolve(null);
      img.src = src;
      var p =
        typeof img.decode === "function"
          ? img.decode()
          : new Promise(function (resolve, reject) {
            img.onload = function () { return resolve(); };
            img.onerror = function () { return reject(); };
          });
      var entry = { img: img, p: p };
      loading.set(idx, entry);
      return p
        .then(function () {
          cache.set(idx, img);
          scheduleMixData(idx, img);
          loading.delete(idx);
          if (bgState.mode === "sequence") {
            if (!running) {
              running = true;
              rafId = requestAnimationFrame(tick);
            } else {
              draw(true);
            }
          }
          return img;
        })
        .catch(function () {
          loading.delete(idx);
          return null;
        });
    }

    function computeSectionEndIndex(sectionName) {
      var secIdx = SECTION_ORDER.indexOf(sectionName);
      if (secIdx < 0) secIdx = 0;
      if (secIdx <= 0) return 0;
      return clampIndex(Math.round(getSegmentEnd(secIdx - 1)));
    }

    function getSegmentStart(segmentIdx) {
      var safeSegment = Math.max(0, Math.min(SEGMENT_COUNT - 1, segmentIdx));
      return (safeSegment / SEGMENT_COUNT) * (FRAME_COUNT - 1);
    }

    function getSegmentEnd(segmentIdx) {
      var safeSegment = Math.max(0, Math.min(SEGMENT_COUNT - 1, segmentIdx));
      return ((safeSegment + 1) / SEGMENT_COUNT) * (FRAME_COUNT - 1);
    }

    function mapProgressToTargetIndex(progress) {
      var clamped = Math.max(0, Math.min(1, Number(progress) || 0));
      var scaled = clamped * SEGMENT_COUNT;
      var segment = Math.min(SEGMENT_COUNT - 1, Math.floor(scaled));
      var local = scaled - segment;
      var easedLocal = local;
      if (segment === 0) {
        easedLocal = Math.pow(local, 1.18);
      } else if (segment === 1) {
        easedLocal = Math.pow(local, 1.08);
      } else {
        easedLocal = Math.pow(local, 0.96);
      }
      var segmentStart = getSegmentStart(segment);
      var segmentEnd = getSegmentEnd(segment);
      return Math.max(0, Math.min(FRAME_COUNT - 1, segmentStart + (segmentEnd - segmentStart) * easedLocal));
    }

    function isSettledToSection(sectionName) {
      if (!sectionName) return false;
      var endIdx = computeSectionEndIndex(sectionName);
      return Math.abs(endIdx - current) < 1.25;
    }

    function settleToSection(sectionName) {
      if (!sectionName) return;
      var endIdx = computeSectionEndIndex(sectionName);
      setTargetIndex(endIdx);
      ensureFrame(endIdx);
    }

    function computeIdlePair(sectionName, endIdx) {
      return { a: endIdx, b: endIdx };
    }

    function clearIdlePlan() {
      idlePlan.active = false;
    }

    function setTargetIndex(index) {
      target = clampIndex(index);
      preloadAround(Math.round(target));
      if (!running) {
        running = true;
        rafId = requestAnimationFrame(tick);
      }
    }

    function planIdleForSection(sectionName) {
      if (!sectionName) return;
      var endIdx = computeSectionEndIndex(sectionName);
      var pair = computeIdlePair(sectionName, endIdx);
      idlePlan.active = true;
      idlePlan.endIdx = endIdx;
      idlePlan.aIdx = pair.a;
      idlePlan.bIdx = pair.b;
      idlePlan.lastTs = performance.now();
      if (idleLoop.active) stopIdleLoop();
      setTargetIndex(endIdx);
      ensureFrame(pair.a);
      ensureFrame(pair.b);
      ensureFrame(endIdx);
    }

    function preloadAround(i) {
      var center = clampIndex(i);
      for (var k = center - CACHE_WINDOW; k <= center + CACHE_WINDOW; k++) {
        ensureFrame(k);
      }
      cache.forEach(function (_, key) {
        if (Math.abs(key - center) > CACHE_KEEP) {
          cache.delete(key);
          mixCache.delete(key);
        }
      });
    }

    function preloadForMotion(fromIndex, targetIndex) {
      var center = clampIndex(Math.round(targetIndex));
      var direction = targetIndex >= fromIndex ? 1 : -1;
      var ahead = Math.max(CACHE_WINDOW + 6, Math.round(SEGMENT_FRAME_SPAN * 0.9));
      var behind = Math.max(12, Math.round(CACHE_WINDOW * 0.55));
      if (direction < 0) {
        var temp = ahead;
        ahead = behind;
        behind = temp;
      }
      for (var k = center - behind; k <= center + ahead; k++) {
        ensureFrame(k);
      }
      var span = Math.max(1, SEGMENT_FRAME_SPAN);
      var directionalSegmentEdge = direction >= 0
        ? clampIndex(Math.round(Math.ceil(center / span) * span))
        : clampIndex(Math.round(Math.floor(center / span) * span));
      ensureFrame(directionalSegmentEdge);
    }

    function preloadAll() {
      if (preloadAllStarted) return;
      preloadAllStarted = true;
      for (var i = 0; i < FRAME_COUNT; i++) {
        ensureFrame(i);
      }
    }

    var preloadAllAsyncStarted = false;
    var preloadAllAsyncCursor = 0;
    var preloadAllAsyncInFlight = 0;
    var preloadAllAsyncPending = 0;
    var PRELOAD_ALL_ASYNC_MAX = 8;

    function preloadAllAsync() {
      if (preloadAllAsyncStarted) return;
      preloadAllAsyncStarted = true;
      preloadAllAsyncCursor = 0;
      preloadAllAsyncInFlight = 0;
      schedulePreloadAllAsync(0);
    }

    function schedulePreloadAllAsync(delay) {
      if (!preloadAllAsyncStarted) return;
      if (preloadAllAsyncPending) return;
      var d = typeof delay === "number" ? delay : 0;
      if (typeof requestIdleCallback === "function" && d <= 0) {
        preloadAllAsyncPending = 1;
        requestIdleCallback(
          function () {
            preloadAllAsyncPending = 0;
            pumpPreloadAllAsync();
          },
          { timeout: 700 }
        );
        return;
      }
      preloadAllAsyncPending = window.setTimeout(function () {
        preloadAllAsyncPending = 0;
        pumpPreloadAllAsync();
      }, Math.max(0, d));
    }

    function pumpPreloadAllAsync() {
      if (!preloadAllAsyncStarted) return;
      if (document.hidden) {
        schedulePreloadAllAsync(900);
        return;
      }
      while (preloadAllAsyncInFlight < PRELOAD_ALL_ASYNC_MAX && preloadAllAsyncCursor < FRAME_COUNT) {
        (function (i) {
          preloadAllAsyncInFlight++;
          var pr = ensureFrame(i);
          if (pr && typeof pr.finally === "function") {
            pr.finally(function () {
              preloadAllAsyncInFlight--;
              if (preloadAllAsyncCursor < FRAME_COUNT) schedulePreloadAllAsync(40);
            });
          } else {
            preloadAllAsyncInFlight--;
          }
        })(preloadAllAsyncCursor);
        preloadAllAsyncCursor++;
      }
      if (preloadAllAsyncCursor < FRAME_COUNT) schedulePreloadAllAsync(80);
    }

    function isReady() {
      return cache.size > 0;
    }

    function isReadyForProgress(progress) {
      var idx = clampIndex(Math.round(mapProgressToTargetIndex(progress)));
      if (cache.has(idx)) return true;
      if (cache.size >= 20) return true;
      for (var s = 1; s <= 3; s++) {
        if (cache.has(clampIndex(idx - s)) || cache.has(clampIndex(idx + s))) return true;
      }
      return false;
    }

    function resize() {
      DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
      canvas.width = Math.floor(window.innerWidth * DPR);
      canvas.height = Math.floor(window.innerHeight * DPR);
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      bufCanvas.width = canvas.width;
      bufCanvas.height = canvas.height;
      if (bufCtx) bufCtx.setTransform(DPR, 0, 0, DPR, 0, 0);
      lastRenderIdx = -1;
      lastRenderFrame = -1;
      draw(true);
    }

    function draw(force) {
      var idx = clampIndex(Math.round(current));
      var now = performance.now();
      var idleAnimating = idleLoop.active && !bgState.isScrolling && bgState.mode === "sequence";
      var pairBlending = idleAnimating && idleLoop.aIdx !== idleLoop.bIdx;
      if (!force && !pairBlending && !idleAnimating && idx === lastRenderIdx && Math.abs(current - lastRenderFrame) < 0.02) return;
      preloadAround(idx);
      preloadAround(Math.round(target));
      var w = window.innerWidth;
      var h = window.innerHeight;

      function resolveExactImg(i) {
        return cache.get(clampIndex(i)) || null;
      }

      function resolveImg(i) {
        var src = cache.get(i);
        if (src) return src;
        for (var s = 1; s <= CACHE_WINDOW + 6; s++) {
          src = cache.get(clampIndex(i - s)) || cache.get(clampIndex(i + s));
          if (src) break;
        }
        return src || null;
      }

      var exactImg = resolveExactImg(idx);
      var img = exactImg || resolveImg(idx);
      if (!img) return;
      var iw = img.naturalWidth || img.width || 0;
      var ih = img.naturalHeight || img.height || 0;
      if (!iw || !ih) return;
      if (!baseIW || !baseIH) {
        baseIW = iw;
        baseIH = ih;
      }
      var drawIW = baseIW || iw;
      var drawIH = baseIH || ih;
      if (!bufCtx) return;
      bufCtx.globalAlpha = 1;
      bufCtx.fillStyle = "#000";
      bufCtx.fillRect(0, 0, w, h);
      var progress = current / Math.max(1, FRAME_COUNT - 1);
      var scale = 1.05;
      var offsetY = (progress - 0.5) * 26;
      var useIdleMotion = idleLoop.active && !bgState.isScrolling && bgState.mode === "sequence";
      var tt = now * 0.001;
      var driftX = useIdleMotion ? Math.sin(tt * IDLE_MOTION_FREQ_X) * IDLE_MOTION_PX_X : 0;
      var driftY = useIdleMotion ? Math.cos(tt * IDLE_MOTION_FREQ_Y) * IDLE_MOTION_PX_Y : 0;
      var breathe = useIdleMotion ? 1 + Math.sin(tt * IDLE_MOTION_FREQ_BREATHE) * IDLE_MOTION_BREATHE : 1;
      var r = Math.max(w / drawIW, h / drawIH) * scale * breathe;
      var dw = drawIW * r;
      var dh = drawIH * r;
      var dx = (w - dw) / 2 + driftX;
      var dy = (h - dh) / 2 + offsetY + driftY;
      if (useIdleMotion) {
        var snap = 1 / Math.max(1, DPR);
        dx = Math.round(dx / snap) * snap;
        dy = Math.round(dy / snap) * snap;
      }

      function safeDrawImage(imageEl, alpha) {
        if (!imageEl) return false;
        try {
          bufCtx.globalAlpha = typeof alpha === "number" ? alpha : 1;
          bufCtx.drawImage(imageEl, dx, dy, dw, dh);
          return true;
        } catch (e) {
          return false;
        }
      }

      if (pairBlending) {
        var aImg = resolveImg(idleLoop.aIdx);
        var bImg = resolveImg(idleLoop.bIdx);
        if (!aImg || !bImg) {
          if (!safeDrawImage(aImg || bImg || img, 1)) return;
        } else {
          var period = Math.max(800, IDLE_PAIR_PERIOD_MS || 0);
          var p = ((now - (idleLoop.pairStart || now)) % period) / period;
          var t = 0.5 - 0.5 * Math.cos(p * Math.PI * 2);
          var aMix = mixCache.get(idleLoop.aIdx);
          var bMix = mixCache.get(idleLoop.bIdx);
          if (!mixCtx || !mixImgData || !aMix || !bMix) {
            if (!safeDrawImage(aImg, 1)) return;
            safeDrawImage(bImg, t);
          } else {
            var out = mixImgData.data;
            var inv = 1 - t;
            for (var mi = 0; mi < out.length; mi += 4) {
              var rLin = srgbToLin[aMix[mi]] * inv + srgbToLin[bMix[mi]] * t;
              var gLin = srgbToLin[aMix[mi + 1]] * inv + srgbToLin[bMix[mi + 1]] * t;
              var bLin = srgbToLin[aMix[mi + 2]] * inv + srgbToLin[bMix[mi + 2]] * t;
              var rIdx = rLin <= 0 ? 0 : rLin >= 1 ? 4095 : (rLin * 4095 + 0.5) | 0;
              var gIdx = gLin <= 0 ? 0 : gLin >= 1 ? 4095 : (gLin * 4095 + 0.5) | 0;
              var bIdx = bLin <= 0 ? 0 : bLin >= 1 ? 4095 : (bLin * 4095 + 0.5) | 0;
              out[mi] = linToSrgb[rIdx];
              out[mi + 1] = linToSrgb[gIdx];
              out[mi + 2] = linToSrgb[bIdx];
              out[mi + 3] = 255;
            }
            mixCtx.putImageData(mixImgData, 0, 0);
            bufCtx.globalAlpha = 1;
            try {
              bufCtx.drawImage(mixCanvas, dx, dy, dw, dh);
            } catch (e) {
              if (!safeDrawImage(aImg || bImg || img, 1)) return;
            }
          }
        }
      } else {
        if (!safeDrawImage(img, 1)) return;
      }
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "copy";
      ctx.drawImage(bufCanvas, 0, 0);
      ctx.restore();
      lastRenderIdx = idx;
      lastRenderFrame = current;
    }

    function startIdleLoop() {
      planIdleForSection(currentSection);
    }

    function stopIdleLoop() {
      if (!idleLoop.active) return;
      idleLoop.active = false;
      idleLoop.lastTs = 0;
      idleLoop.acc = 0;
      idleLoop.blendStart = 0;
    }

    function getSequenceRangeFlags(fromIndex, toIndex) {
      var low = Math.min(fromIndex, toIndex);
      var high = Math.max(fromIndex, toIndex);
      var firstTransitionEnd = computeSectionEndIndex("resources");
      var cooperationTransitionEnd = computeSectionEndIndex("cooperation");
      return {
        inFirstTransition: high <= firstTransitionEnd + 0.5,
        inResourcesToCooperation: low >= firstTransitionEnd - 0.5
          && high <= cooperationTransitionEnd + 0.5,
        inCooperationToContact: low >= cooperationTransitionEnd - 0.5,
      };
    }

    function getSequenceMotionSpeed(fromIndex, toIndex, isScrollMotion) {
      var flags = getSequenceRangeFlags(fromIndex, toIndex);
      var baseSpeed = isScrollMotion
        ? Math.max(15, Math.min(40, SEGMENT_FRAME_SPAN * 0.52))
        : Math.max(12, Math.min(30, SEGMENT_FRAME_SPAN * 0.4));
      if (flags.inFirstTransition) {
        baseSpeed *= isScrollMotion ? 0.58 : 0.74;
      } else if (flags.inResourcesToCooperation) {
        baseSpeed *= isScrollMotion ? 0.62 : 0.82;
      } else if (flags.inCooperationToContact) {
        baseSpeed *= isScrollMotion ? 0.68 : 0.86;
      }
      return baseSpeed;
    }

    function getSequenceSettleFps(fromIndex, toIndex) {
      var flags = getSequenceRangeFlags(fromIndex, toIndex);
      if (flags.inFirstTransition) {
        return Math.max(13.5, Math.min(24, SEGMENT_FRAME_SPAN * 0.28));
      }
      if (flags.inResourcesToCooperation) {
        return Math.max(12.2, Math.min(22, SEGMENT_FRAME_SPAN * 0.235));
      }
      if (flags.inCooperationToContact) {
        return Math.max(12, Math.min(22, SEGMENT_FRAME_SPAN * 0.24));
      }
      return Math.max(13, Math.min(25, SEGMENT_FRAME_SPAN * 0.31));
    }

    function tick() {
      if (!running) return;
      var nowTick = performance.now();
      var dtTick = motionLastTs ? Math.max(8, Math.min(34, nowTick - motionLastTs)) : 16.7;
      motionLastTs = nowTick;
      if (bgState.mode !== "sequence") {
        running = false;
        rafId = 0;
        motionLastTs = 0;
        return;
      }
      if (bgState.isScrolling) clearIdlePlan();
      if (idleLoop.active && (bgState.isScrolling || bgState.mode !== "sequence")) stopIdleLoop();
      if (idleLoop.active && !bgState.isScrolling && bgState.mode === "sequence") {
        current = idleLoop.idx;
        target = idleLoop.idx;
        ensureFrame(idleLoop.aIdx);
        ensureFrame(idleLoop.bIdx);
        draw(false);
        rafId = requestAnimationFrame(tick);
        return;
      }
      if (idlePlan.active && !bgState.isScrolling && bgState.mode === "sequence") {
        target = idlePlan.endIdx;
        var nowP = performance.now();
        var dtP = Math.max(0, nowP - (idlePlan.lastTs || nowP));
        idlePlan.lastTs = nowP;
        var diff2 = target - current;
        var speedFps = getSequenceSettleFps(current, target);
        var tailRange2 = Math.max(1.2, SEGMENT_FRAME_SPAN * 0.085);
        var absDiff2 = Math.abs(diff2);
        if (absDiff2 < tailRange2) {
          var tailBoost2 = 1 - absDiff2 / tailRange2;
          speedFps *= 1.18 + tailBoost2 * 0.46;
        }
        var maxMove = (speedFps * dtP) / 1000;
        if (maxMove < 0.04) maxMove = 0.04;
        if (diff2 > maxMove) diff2 = maxMove;
        else if (diff2 < -maxMove) diff2 = -maxMove;
        current = current + diff2;
        if (Math.abs(target - current) < 0.02) current = target;
        draw(false);
        if (Math.abs(target - current) < 0.02) {
          idleLoop.active = true;
          idleLoop.idx = idlePlan.endIdx;
          idleLoop.aIdx = idlePlan.aIdx;
          idleLoop.bIdx = idlePlan.bIdx;
          var now2 = performance.now();
          var period2 = Math.max(800, IDLE_PAIR_PERIOD_MS || 0);
          var wantT12 = idleLoop.idx === idleLoop.bIdx;
          idleLoop.pairStart = wantT12 ? now2 - period2 * 0.5 : now2;
          clearIdlePlan();
        }
        rafId = requestAnimationFrame(tick);
        return;
      }
      var diff = target - current;
      var absDiff = Math.abs(diff);
      var baseSpeed = getSequenceMotionSpeed(current, target, bgState.isScrolling);
      var proportionalMove = absDiff * (bgState.isScrolling ? 0.095 : 0.055);
      if (!bgState.isScrolling) {
        var tailRange = Math.max(1.2, SEGMENT_FRAME_SPAN * 0.085);
        if (absDiff < tailRange) {
          var tailBoost = 1 - absDiff / tailRange;
          baseSpeed *= 1.16 + tailBoost * 0.5;
          proportionalMove = Math.max(proportionalMove, absDiff * (0.11 + tailBoost * 0.06));
        }
      }
      var maxStep = (baseSpeed * dtTick) / 1000;
      var minStep = bgState.isScrolling ? 0.05 : 0.03;
      var move = Math.min(absDiff, Math.max(minStep, maxStep, proportionalMove));
      current = current + (diff < 0 ? -move : move);
      if (Math.abs(diff) < 0.02) current = target;
      draw(false);
      if (Math.abs(target - current) < 0.02 && !bgState.isScrolling && !snapBoost) {
        running = false;
        rafId = 0;
        motionLastTs = 0;
        requestAnimationFrame(function () {
          if (bgState.mode !== "sequence") return;
          if (bgState.isScrolling || bgState.isSnapping) return;
          syncBackgroundToScroll();
        });
        return;
      }
      rafId = requestAnimationFrame(tick);
    }

    function setTargetByProgress(progress) {
      target = mapProgressToTargetIndex(progress);
      preloadAround(Math.round(current));
      preloadForMotion(current, target);
      if (!running) {
        running = true;
        rafId = requestAnimationFrame(tick);
      }
    }

    ensureFrame(0);
    resize();

    window.addEventListener("resize", resize);

    return {
      setTargetByProgress: setTargetByProgress,
      setTargetIndex: setTargetIndex,
      planIdleForSection: planIdleForSection,
      clearIdlePlan: clearIdlePlan,
      preloadAll: preloadAll,
      preloadAllAsync: preloadAllAsync,
      isReady: isReady,
      isReadyForProgress: isReadyForProgress,
      isSettledToSection: isSettledToSection,
      settleToSection: settleToSection,
      startIdleLoop: startIdleLoop,
      stopIdleLoop: stopIdleLoop,
      setSnapBoost: function (active) {
        snapBoost = !!active;
        if (snapBoost && !running) {
          running = true;
          rafId = requestAnimationFrame(tick);
        }
      },
      destroy: function () {
        window.removeEventListener("resize", resize);
        if (rafId) cancelAnimationFrame(rafId);
        cache.clear();
        loading.clear();
        mixCache.clear();
      },
    };
  }

  function initVideos() {
    var globalVideo = document.getElementById("globalBgVideo");
    if (globalVideo) {
      var els = ensureBgEls();
      var backgroundMedia = getBackgroundMediaConfig();
      var sequenceUrls = getBackgroundSequenceUrls(backgroundMedia);

      applyBackgroundFallback(backgroundMedia);

      setCanvasVisible(false);
      hideAllBgVideos();
      setFallbackVisible(true);
      if (viewportState.mobileHome) {
        var mobileDecision = getMobileBackgroundPlaybackDecision(backgroundMedia);
        if (mobileDecision.enabled) {
          activateMobileBackgroundVideo(backgroundMedia);
        } else {
          resetMobileBackgroundVideo();
          applyMobileBackgroundPoster(els.mobile, backgroundMedia);
          recordMobileBackgroundStatus("skipped", mobileDecision);
        }
        bgState.mode = "fallback";
        bgState.introDone = false;
        return;
      }
      resetMobileBackgroundVideo();
      bgState.media = backgroundMedia;

      if (els.transition && !bgState.transitionCtrl) {
        els.transition.loop = false;
        els.transition.preload = "auto";
        els.transition.muted = true;
        els.transition.playsInline = true;
        els.transition.style.opacity = "0";
        bgState.transitionCtrl = attachFadingVideo(els.transition, {
          nativeLoop: false,
          disableAutoFadeOutLead: true,
          fadeMs: 220,
          restartOnActivate: true,
          waitForReadyFade: true,
          onEnded: function (v, api) {
            var token = v.__bgTransitionToken || 0;
            if (token !== bgState.transitionToken) return true;
            if (bgState.transitionQueue && bgState.transitionQueue.length) {
              var nextSrc = bgState.transitionQueue.shift();
              if (loadBgTransitionClip(v, nextSrc, token)) {
                if (bgState.transitionCtrl) bgState.transitionCtrl.setActive(true);
                return true;
              }
            }
            var nextMode = bgState.transitionToMode;
            var nextSection = bgState.transitionToSection;
            bgState.transitionActive = false;
            bgState.transitionToMode = "";
            bgState.transitionToSection = "";
            bgState.transitionQueue = [];
            if (nextMode) {
              if (nextSection) {
                currentSection = nextSection;
                updateTopNav(nextSection);
                updateNavDots(nextSection);
              }
              setBgMode(nextMode);
              setTimeout(syncBackgroundToScroll, 140);
            } else {
              cancelBgTransition();
            }
            return true;
          }
        });
      }

      function warmLoopVideo(loopEl, src, key) {
        if (!loopEl) return null;
        loopEl.loop = true;
        loopEl.preload = "auto";
        loopEl.__bgFrameReady = false;
        loopEl.__bgReusableReady = false;
        loopEl.__bgReadyAtZero = false;
        loopEl.__bgPrimeRequested = false;
        loopEl.__bgPrimePlayPending = false;
        loopEl.src = src;
        loopEl.load();
        loopEl.addEventListener("loadeddata", function () {
          loopEl.__bgFrameReady = true;
          loopEl.__bgReusableReady = true;
          if (Math.abs((loopEl.currentTime || 0) - 0) < 0.08) loopEl.__bgReadyAtZero = true;
        });
        loopEl.addEventListener("canplay", function () {
          loopEl.__bgFrameReady = true;
          loopEl.__bgReusableReady = true;
          if (Math.abs((loopEl.currentTime || 0) - 0) < 0.08) loopEl.__bgReadyAtZero = true;
        });
        loopEl.addEventListener("seeked", function () {
          if (loopEl.readyState >= 2) {
            loopEl.__bgFrameReady = true;
            loopEl.__bgReusableReady = true;
            if (Math.abs((loopEl.currentTime || 0) - 0) < 0.08) loopEl.__bgReadyAtZero = true;
          }
        });
        loopEl.style.opacity = "0";
        videos[key] = loopEl;
        var fadeMs = 320;
        if (key === "firstLoop") fadeMs = 220;
        if (key === "thirdLoop") fadeMs = 360;
        if (key === "lastLoop") fadeMs = 380;
        var ctrl = attachFadingVideo(loopEl, {
          nativeLoop: true,
          disableAutoFadeOutLead: true,
          fadeMs: fadeMs,
          restartOnActivate: true,
          waitForReadyFade: true
        });
        videoControllers[key] = ctrl;
        return ctrl;
      }

      var warmupStarted = false;
      function startWarmup() {
        if (warmupStarted) return;
        warmupStarted = true;

        window.setTimeout(function () {
          bgState.firstCtrl = warmLoopVideo(els.first, getBackgroundVideoUrl(backgroundMedia.firstVideo, "/video/first.mp4"), "firstLoop");
        }, 0);
        window.setTimeout(function () {
          var secondSrc = getBackgroundVideoUrl(backgroundMedia.secondVideo, "");
          if (secondSrc) {
            bgState.secondCtrl = warmLoopVideo(els.second, secondSrc, "secondLoop");
          }
        }, 40);
        window.setTimeout(function () {
          var thirdSrc = getBackgroundVideoUrl(backgroundMedia.thirdVideo, "");
          if (thirdSrc) {
            bgState.thirdCtrl = warmLoopVideo(els.third, thirdSrc, "thirdLoop");
          }
        }, 120);
        window.setTimeout(function () {
          bgState.lastCtrl = warmLoopVideo(els.last, getBackgroundVideoUrl(backgroundMedia.lastVideo, "/video/last.mp4"), "lastLoop");
        }, 200);
      }

      function finishIntro() {
        if (bgState.introDone) return true;
        bgState.introDone = true;
        var introMetrics = getScrollMetrics();
        var shouldGoFirstDirectly = !!(
          bgState.firstCtrl &&
          !bgState.isScrolling &&
          !bgState.isSnapping &&
          (introMetrics.atTop || currentSection === "home")
        );
        if (shouldGoFirstDirectly) {
          bgState.sequenceTargetMode = "first";
          ensureBgVideoPrimedForMode("first");
          setBgMode("first");
          return true;
        }
        syncBackgroundToScroll();
        setTimeout(syncBackgroundToScroll, 120);
        setTimeout(syncBackgroundToScroll, 420);
        return true;
      }

      function onScroll() {
        if (!bgState.introDone) return;
        if (document.body && document.body.classList.contains("modal-open")) return;

        bgState.isScrolling = true;
        if (bgState.scrollTimer) clearTimeout(bgState.scrollTimer);
        if (webpSeq && webpSeq.stopIdleLoop) webpSeq.stopIdleLoop();
        if (webpSeq && webpSeq.clearIdlePlan) webpSeq.clearIdlePlan();
        syncBackgroundToScroll();

        bgState.scrollTimer = setTimeout(function () {
          bgState.isScrolling = false;
          syncBackgroundToScroll();
        }, 110);
      }

      window.addEventListener("scroll", onScroll, { passive: true });

      globalVideo.loop = false;
      globalVideo.src = getBackgroundVideoUrl(backgroundMedia.mainVideo, "/video/bgVideo.mp4");
      globalVideo.load();
      videos["intro"] = globalVideo;
      bgState.introCtrl = attachFadingVideo(globalVideo, {
        disableAutoFadeOutLead: true,
        nearEndLead: 0.22,
        fadeMs: 360,
        onNearEnd: function (v, api) {
          ensureBgVideoPrimedForMode("first");
          return false;
        },
        onEnded: function (v, api) {
          return finishIntro();
        },
      });
      videoControllers["intro"] = bgState.introCtrl;

      var introActivated = false;
      var introLoadRetries = 0;
      var introRetryTimer = 0;
      function activateIntro() {
        if (introActivated) return;
        introActivated = true;
        setFallbackVisible(false);
        startWarmup();
        setBgMode("intro");
      }
      function scheduleIntroRetry() {
        if (introActivated) return;
        if (introLoadRetries >= 3) return;
        if (introRetryTimer) return;
        introLoadRetries++;
        introRetryTimer = window.setTimeout(function () {
          introRetryTimer = 0;
          try {
            globalVideo.load();
          } catch (e) { }
        }, 1200 * introLoadRetries);
      }

      globalVideo.addEventListener(
        "canplay",
        function () {
          activateIntro();
        },
        { once: true }
      );
      globalVideo.addEventListener(
        "loadeddata",
        function () {
          activateIntro();
        },
        { once: true }
      );
      globalVideo.addEventListener(
        "error",
        function () {
          setFallbackVisible(true);
          scheduleIntroRetry();
        }
      );

      return;
    }

    var videoEls = document.querySelectorAll(".bg-video");
    var bgVideos = parseJSON(getConfig("background_videos"), {
      home: "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260418_080021_d598092b-c4c2-4e53-8e46-94cf9064cd50.mp4",
      resources: "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260418_094631_d30ab262-45ee-4b7d-99f3-5d5848c8ef13.mp4",
      cooperation: "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260418_094631_d30ab262-45ee-4b7d-99f3-5d5848c8ef13.mp4",
      contact: "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260418_094631_d30ab262-45ee-4b7d-99f3-5d5848c8ef13.mp4",
    });

    videoEls.forEach(function (v) {
      var section = v.getAttribute("data-video");
      var src = bgVideos[section];
      if (src) {
        v.src = src;
        v.load();
      }
      videos[section] = v;
      videoControllers[section] = attachFadingVideo(v);
    });

    var homeVideo = videos["home"];
    if (homeVideo) {
      homeVideo.classList.add("active");
      if (videoControllers["home"]) {
        videoControllers["home"].setActive(true);
      } else {
        homeVideo.play().catch(function () { });
      }
    }
  }

  function setupIntersectionObserver() {
    var sections = document.querySelectorAll(".section[data-section]");

    observer = new IntersectionObserver(
      function (entries) {
        var suppress =
          modalState &&
          modalState.suppressSectionTransitionUntil &&
          performance.now() < modalState.suppressSectionTransitionUntil;
        entries.forEach(function (entry) {
          var content = entry.target.querySelector(".section-content");

          if (entry.isIntersecting) {
            if (content) {
              if (suppress) content.style.transition = "none";
              content.classList.add("visible");
              if (suppress) {
                requestAnimationFrame(function () {
                  content.style.transition = "";
                });
              }
            }
          } else {
            if (content) {
              if (suppress) content.style.transition = "none";
              content.classList.remove("visible");
              if (suppress) {
                requestAnimationFrame(function () {
                  content.style.transition = "";
                });
              }
            }
          }
        });
      },
      { threshold: 0.25 }
    );

    sections.forEach(function (s) {
      observer.observe(s);
    });
  }

  function pauseIntersectionObserver() {
    if (!observer) return;
    if (pauseIntersectionObserver.__paused) return;
    pauseIntersectionObserver.__paused = true;
    try {
      observer.disconnect();
    } catch (e) { }
  }

  function resumeIntersectionObserver() {
    if (!observer) return;
    if (!pauseIntersectionObserver.__paused) return;
    pauseIntersectionObserver.__paused = false;
    try {
      document.querySelectorAll(".section[data-section]").forEach(function (s) {
        observer.observe(s);
      });
    } catch (e) { }
  }

  function updateTopNav(activeName) {
    var container = document.querySelector(".site-navbar-links");
    if (!container) return;
    container.querySelectorAll("a[data-nav]").forEach(function (a) {
      var isActive = a.getAttribute("data-nav") === activeName;
      a.classList.toggle("active", isActive);
      if (isActive) {
        a.setAttribute("aria-current", "page");
      } else {
        a.removeAttribute("aria-current");
      }
    });
  }

  function setupScrollSpy() {
    var sections = Array.prototype.slice.call(document.querySelectorAll(".section[data-section]"));
    if (!sections.length) return;

    var raf = 0;
    var lastActive = "";

    function getNavHeight() {
      var nav = document.querySelector(".site-navbar");
      return nav ? nav.offsetHeight || 0 : 0;
    }

    function computeActiveName() {
      var navH = getNavHeight();
      var y =
        modalState && modalState.scrollLocked && typeof modalState.scrollY === "number"
          ? modalState.scrollY
          : getPageScrollY();
      var pos = y + navH + 2;
      var bestName = sections[0].getAttribute("data-section") || "home";
      var bestTop = -Infinity;
      for (var i = 0; i < sections.length; i++) {
        var s = sections[i];
        var top = s.offsetTop || 0;
        if (top <= pos && top >= bestTop) {
          bestTop = top;
          bestName = s.getAttribute("data-section") || bestName;
        }
      }
      return bestName;
    }

    function applyActive(name) {
      if (!name) return;
      if (name !== lastActive) {
        lastActive = name;
        currentSection = name;
      }
      updateTopNav(name);
      updateNavDots(name);
    }

    function update() {
      raf = 0;
      applyActive(computeActiveName());
    }

    window.addEventListener(
      "scroll",
      function () {
        if (document.body && document.body.classList.contains("modal-open")) return;
        if (raf) return;
        raf = requestAnimationFrame(update);
      },
      { passive: true }
    );
    window.addEventListener("resize", function () {
      if (document.body && document.body.classList.contains("modal-open")) return;
      update();
    });
    update();
  }

  function setupSectionSnap() {
    var sections = Array.prototype.slice.call(document.querySelectorAll(".section[data-section]"));
    if (!sections.length) return;

    var idleTimer = 0;
    var watchRaf = 0;
    var isProgrammatic = false;
    var targetY = 0;
    var animRaf = 0;
    var animToken = 0;
    var restoreScrollBehavior = null;
    var lastScrollY = 0;
    var lastScrollT = 0;
    var lastVel = 0;
    var lastDir = 0;
    var wheelAcc = 0;
    var wheelTimer = 0;
    var lastWheelSnapAt = 0;
    var touchStartY = 0;
    var touchLastY = 0;
    var touchStartX = 0;
    var touchLastX = 0;
    var touchStartScrollY = 0;
    var touchStartSectionIdx = -1;
    var touchTracking = false;
    var touchIgnoreSnap = false;
    var touchEndTimer = 0;
    var mobileSnapTimer = 0;
    var pendingMobileSnapDir = 0;
    var pendingMobileSnapBaseIdx = -1;
    var mobileSnapViewportH = 0;
    var mobileSnapViewportW = 0;

    function triggerTransition(fromIdx, toIdx) {
      if (viewportState.mobileHome) return;
      if (!bgState.introDone || bgState.mode === "intro") return;
      if (bgState.transitionActive) return;
      if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return;
      var fromEl = sections[fromIdx];
      var toEl = sections[toIdx];
      if (!fromEl || !toEl) return;
      var fromName = fromEl.getAttribute("data-section") || "";
      var toName = toEl.getAttribute("data-section") || "";
      if (!fromName || !toName || fromName === toName) return;
      playBgTransition(fromName, toName);
    }

    function getNavHeight() {
      var nav = document.querySelector(".site-navbar");
      return nav ? nav.offsetHeight || 0 : 0;
    }

    function getScrollY() {
      return window.scrollY || document.documentElement.scrollTop || 0;
    }

    function getViewportWidth() {
      return window.innerWidth || document.documentElement.clientWidth || 0;
    }

    function getRuntimeViewportHeight() {
      return window.innerHeight || document.documentElement.clientHeight || 0;
    }

    function getViewportHeight() {
      if (isMobileSnapMode() && mobileSnapViewportH > 0) return mobileSnapViewportH;
      return getRuntimeViewportHeight();
    }

    function refreshMobileSnapViewport(force) {
      var nextW = getViewportWidth();
      var nextH = getRuntimeViewportHeight();
      if (!nextW || !nextH) return;
      if (!isMobileSnapMode()) {
        mobileSnapViewportW = nextW;
        mobileSnapViewportH = nextH;
        return;
      }
      if (
        force ||
        !mobileSnapViewportH ||
        !mobileSnapViewportW ||
        Math.abs(nextW - mobileSnapViewportW) > 2 ||
        Math.abs(nextH - mobileSnapViewportH) > 120
      ) {
        mobileSnapViewportW = nextW;
        mobileSnapViewportH = nextH;
      }
    }

    function getFooterHeight() {
      if (isMobileSnapMode()) return 0;
      var footer = document.getElementById("siteFooter") || document.querySelector(".site-footer");
      var h = footer ? footer.offsetHeight || 0 : 0;
      return h || 64;
    }

    function getMaxScroll() {
      var doc = document.documentElement;
      var scrollH = Math.max(doc.scrollHeight || 0, document.body ? document.body.scrollHeight || 0 : 0);
      var vh = getRuntimeViewportHeight() || doc.clientHeight || 0;
      return Math.max(0, scrollH - vh);
    }

    function isMobileSnapMode() {
      return !!(document.body && document.body.classList.contains("mobile-home-experience"));
    }

    function isTouchSnapIgnoredTarget(target) {
      if (!target || !target.closest) return false;
      return !!target.closest(".resource-data-bar, .site-modal, .wechat-consult");
    }

    function getElementAbsoluteTop(el) {
      var top = 0;
      while (el) {
        top += el.offsetTop || 0;
        el = el.offsetParent;
      }
      return top;
    }

    function getTargetYForSection(sectionEl) {
      var maxScroll = getMaxScroll();
      var sectionName = sectionEl.getAttribute ? sectionEl.getAttribute("data-section") : "";
      if (sectionName === "home" || sectionEl.id === "home") return 0;
      var navH = getNavHeight();
      var footerH = isMobileSnapMode() ? 0 : getFooterHeight();
      var vh = getViewportHeight() || document.documentElement.clientHeight || 0;
      var avail = Math.max(0, vh - navH - footerH);
      var top = sectionEl.offsetTop || 0;
      var h = sectionEl.offsetHeight || vh;
      if (isMobileSnapMode()) {
        var mobileIdx = sections.indexOf(sectionEl);
        var contentEl = sectionEl.querySelector(".section-content") || sectionEl;
        var contentTop = getElementAbsoluteTop(contentEl);
        var contentH = contentEl.offsetHeight || h;
        var useCenterAlign = mobileIdx === 0 || mobileIdx === 2;
        if (!useCenterAlign) {
          var mobileTopInset = navH + 12;
          var mobileTopY = contentTop - mobileTopInset;
          return Math.max(0, Math.min(maxScroll, mobileTopY));
        }
        var mobileVisualCenter = vh / 2;
        var mobileY = contentTop + contentH / 2 - mobileVisualCenter;
        return Math.max(0, Math.min(maxScroll, mobileY));
      }
      var visualCenter = navH + avail / 2;
      var y = top + h / 2 - visualCenter;
      return Math.max(0, Math.min(maxScroll, y));
    }

    function findBestIndexByDistance(y) {
      var bestIdx = 0;
      var bestDist = Infinity;
      for (var i = 0; i < sections.length; i++) {
        var ty = getTargetYForSection(sections[i]);
        var d = Math.abs(y - ty);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      }
      return bestIdx;
    }

    function findMobileActiveIndex(y) {
      return findBestIndexByDistance(y);
    }

    function shouldSkipSnap() {
      if (document.body && document.body.classList.contains("modal-open")) return true;
      if (bgState.ignoreScrollUntil && performance.now() < bgState.ignoreScrollUntil) return true;
      if (isProgrammatic) return true;
      var el = document.activeElement;
      if (el && el.tagName && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return true;
      return false;
    }

    function clearPendingMobileSnap() {
      if (mobileSnapTimer) clearTimeout(mobileSnapTimer);
      mobileSnapTimer = 0;
      pendingMobileSnapDir = 0;
      pendingMobileSnapBaseIdx = -1;
    }

    function triggerMobileStepSnap(baseIdx, dir) {
      if (baseIdx < 0 || !dir) return;
      var nextIdx = Math.max(0, Math.min(sections.length - 1, baseIdx + dir));
      if (nextIdx === baseIdx) return;
      var nextY = getTargetYForSection(sections[nextIdx]);
      if (Math.abs(nextY - getScrollY()) < 2) return;
      beginProgrammaticWatch(nextY);
      bgState.ignoreScrollUntil = performance.now() + 320;
      animateToY(nextY);
    }

    function runPendingMobileSnap() {
      mobileSnapTimer = 0;
      if (!pendingMobileSnapDir) return;
      if (shouldSkipSnap()) {
        clearPendingMobileSnap();
        return;
      }
      var dir = pendingMobileSnapDir;
      var baseIdx = pendingMobileSnapBaseIdx;
      clearPendingMobileSnap();
      triggerMobileStepSnap(baseIdx, dir);
    }

    function schedulePendingMobileSnap(delay) {
      if (!pendingMobileSnapDir) return;
      if (mobileSnapTimer) clearTimeout(mobileSnapTimer);
      mobileSnapTimer = setTimeout(runPendingMobileSnap, typeof delay === "number" ? delay : 120);
    }

    function stopWatch() {
      if (watchRaf) cancelAnimationFrame(watchRaf);
      watchRaf = 0;
      isProgrammatic = false;
      bgState.isSnapping = false;
      if (webpSeq && webpSeq.setSnapBoost) webpSeq.setSnapBoost(false);
    }

    function cancelAnim() {
      animToken++;
      if (animRaf) cancelAnimationFrame(animRaf);
      animRaf = 0;
      if (restoreScrollBehavior) restoreScrollBehavior();
    }

    function animateToY(destY) {
      cancelAnim();
      var token = ++animToken;
      var root = document.documentElement;
      var prevBehavior = root.style.scrollBehavior;
      root.style.scrollBehavior = "auto";
      restoreScrollBehavior = function () {
        if (!restoreScrollBehavior) return;
        root.style.scrollBehavior = prevBehavior;
        restoreScrollBehavior = null;
      };
      var startY = getScrollY();
      var dist = destY - startY;
      var abs = Math.abs(dist);
      if (abs < 1) {
        window.scrollTo(0, destY);
        if (restoreScrollBehavior) restoreScrollBehavior();
        return;
      }
      var dur = abs < 60 ? 240 : 520;
      var start = performance.now();

      function easeInOutCubic(t) {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      }

      animRaf = requestAnimationFrame(function tick(now) {
        if (token !== animToken) return;
        var t = Math.min(1, (now - start) / Math.max(1, dur));
        var eased = easeInOutCubic(t);
        var nextY = startY + dist * eased;
        window.scrollTo(0, nextY);
        syncBackgroundToScroll();
        if (t < 1) {
          animRaf = requestAnimationFrame(tick);
        } else {
          animRaf = 0;
          window.scrollTo(0, destY);
          if (restoreScrollBehavior) restoreScrollBehavior();
        }
      });
    }

    function startWatch() {
      var stable = 0;
      var lastY = getScrollY();
      watchRaf = requestAnimationFrame(function tick() {
        var y = getScrollY();
        syncBackgroundToScroll();
        if (Math.abs(y - targetY) <= 1) stable++;
        else if (Math.abs(y - lastY) < 0.3) stable++;
        else stable = 0;
        lastY = y;
        if (stable >= 2) {
          stopWatch();
          syncBackgroundToScroll();
          return;
        }
        watchRaf = requestAnimationFrame(tick);
      });
    }

    function beginProgrammaticWatch(nextTargetY) {
      setBgSequenceDirection(nextTargetY >= getScrollY() ? 1 : -1);
      targetY = nextTargetY;
      isProgrammatic = true;
      bgState.isSnapping = true;
      if (webpSeq && webpSeq.setSnapBoost) webpSeq.setSnapBoost(false);
      if (watchRaf) cancelAnimationFrame(watchRaf);
      startWatch();
    }

    function snapNow() {
      if (shouldSkipSnap()) return;
      var y = getScrollY();
      var idx = findBestIndexByDistance(y);
      var baseY = getTargetYForSection(sections[idx]);
      var vh = getViewportHeight() || document.documentElement.clientHeight || 0;
      var moveGate = isMobileSnapMode() ? Math.max(28, vh * 0.08) : Math.max(44, vh * 0.12);
      var nextIdx = idx;
      if (lastDir > 0 && y > baseY + moveGate && idx < sections.length - 1) nextIdx = idx + 1;
      if (lastDir < 0 && y < baseY - moveGate && idx > 0) nextIdx = idx - 1;
      targetY = getTargetYForSection(sections[nextIdx]);
      var dist = Math.abs(y - targetY);
      if (dist < 2) return;
      var m = getScrollMetrics();
      if (m.atBottom && nextIdx === sections.length - 1) return;
      triggerTransition(idx, nextIdx);
      beginProgrammaticWatch(targetY);
      bgState.ignoreScrollUntil = performance.now() + 340;
      animateToY(targetY);
    }

    function onWheel(e) {
      if (!e) return;
      if (isMobileSnapMode()) return;
      if (e.ctrlKey) return;
      if (bgState.transitionActive) {
        e.preventDefault();
        return;
      }
      if (shouldSkipSnap()) return;
      var dy = e.deltaY || 0;
      if (Math.abs(dy) < 2) return;
      var scrollBox = e.target && e.target.closest ? e.target.closest(".resource-data-bar") : null;
      if (scrollBox && scrollBox.scrollHeight > scrollBox.clientHeight + 1) {
        var atTop = (scrollBox.scrollTop || 0) <= 0;
        var atBottom =
          (scrollBox.scrollTop || 0) + (scrollBox.clientHeight || 0) >= (scrollBox.scrollHeight || 0) - 1;
        if ((dy > 0 && !atBottom) || (dy < 0 && !atTop)) return;
      }
      wheelAcc += dy;
      if (wheelTimer) clearTimeout(wheelTimer);
      wheelTimer = setTimeout(function () {
        wheelAcc = 0;
      }, 90);
      if (Math.abs(wheelAcc) < 34) return;
      e.preventDefault();
      var dir = wheelAcc > 0 ? 1 : -1;
      setBgSequenceDirection(dir);
      wheelAcc = 0;
      lastWheelSnapAt = performance.now();
      var y = getScrollY();
      var idx = findBestIndexByDistance(y);
      var nextIdx = Math.max(0, Math.min(sections.length - 1, idx + dir));
      if (nextIdx === idx) return;
      var nextY = getTargetYForSection(sections[nextIdx]);
      triggerTransition(idx, nextIdx);
      beginProgrammaticWatch(nextY);
      bgState.ignoreScrollUntil = performance.now() + 420;
      animateToY(nextY);
    }

    function onTouchStart(e) {
      if (!isMobileSnapMode()) return;
      if (!e || !e.touches || !e.touches.length) return;
      var touch = e.touches[0];
      touchStartY = touch.clientY;
      touchLastY = touch.clientY;
      touchStartX = touch.clientX;
      touchLastX = touch.clientX;
      touchStartScrollY = getScrollY();
      clearPendingMobileSnap();
      touchTracking = true;
      touchStartSectionIdx = findMobileActiveIndex(getScrollY());
      touchIgnoreSnap = isTouchSnapIgnoredTarget(e.target);
      if (touchEndTimer) clearTimeout(touchEndTimer);
    }

    function onTouchMove(e) {
      if (!isMobileSnapMode()) return;
      if (!touchTracking || !e || !e.touches || !e.touches.length) return;
      var touch = e.touches[0];
      touchLastY = touch.clientY;
      touchLastX = touch.clientX;
    }

    function onTouchEnd() {
      if (!isMobileSnapMode()) return;
      if (!touchTracking) return;
      touchTracking = false;
      if (touchIgnoreSnap || shouldSkipSnap()) return;
      if (touchEndTimer) clearTimeout(touchEndTimer);
      touchEndTimer = setTimeout(function () {
        if (shouldSkipSnap()) return;
        var deltaY = touchStartY - touchLastY;
        var deltaX = touchStartX - touchLastX;
        var verticalSwipe = Math.abs(deltaY) > Math.abs(deltaX) * 1.15;
        var y = getScrollY();
        var idx = findMobileActiveIndex(y);
        var nextIdx = idx;
        var vh = getViewportHeight() || document.documentElement.clientHeight || 0;
        var swipeGate = Math.max(52, vh * 0.09);
        if (!verticalSwipe || Math.abs(deltaY) < swipeGate) {
          touchStartSectionIdx = -1;
          return;
        }
        lastDir = deltaY > 0 ? 1 : -1;
        setBgSequenceDirection(lastDir);
        var baseIdx = touchStartSectionIdx >= 0 ? touchStartSectionIdx : idx;
        var scrollDelta = y - touchStartScrollY;
        var scrollGate = Math.max(18, vh * 0.03);
        var crossedGate =
          (lastDir > 0 && scrollDelta > scrollGate) ||
          (lastDir < 0 && scrollDelta < -scrollGate) ||
          Math.abs(deltaY) >= Math.max(88, vh * 0.16);
        if (!crossedGate) {
          touchStartSectionIdx = -1;
          return;
        }
        nextIdx = Math.max(0, Math.min(sections.length - 1, baseIdx + lastDir));
        if (nextIdx === baseIdx) {
          touchStartSectionIdx = -1;
          return;
        }
        pendingMobileSnapDir = lastDir;
        pendingMobileSnapBaseIdx = baseIdx;
        schedulePendingMobileSnap(24);
        touchStartSectionIdx = -1;
      }, 60);
    }

    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("touchcancel", onTouchEnd, { passive: true });
    refreshMobileSnapViewport(true);
    window.addEventListener("resize", function () {
      refreshMobileSnapViewport(false);
    });

    window.__snapAnimateToY = function (y) {
      if (typeof y !== "number") return;
      var fromIdx = findBestIndexByDistance(getScrollY());
      var toIdx = findBestIndexByDistance(y);
      triggerTransition(fromIdx, toIdx);
      beginProgrammaticWatch(y);
      bgState.ignoreScrollUntil = performance.now() + 420;
      animateToY(y);
    };

    window.__scrollToSectionTarget = function (sectionEl) {
      if (!sectionEl) return;
      window.__snapAnimateToY(getTargetYForSection(sectionEl));
    };

    window.__snapCancel = function () {
      if (idleTimer) clearTimeout(idleTimer);
      cancelAnim();
      stopWatch();
      cancelBgTransition();
      bgState.ignoreScrollUntil = performance.now() + 260;
    };

    document.addEventListener(
      "click",
      function (e) {
        if (e.defaultPrevented) return;
        if (document.body && document.body.classList.contains("modal-open")) return;
        var t = e.target;
        if (!t) return;
        var a = t.closest ? t.closest('a[href^="#"]') : null;
        if (!a) return;
        var href = a.getAttribute("href") || "";
        if (!href || href === "#") return;
        var id = href.slice(1);
        if (!id) return;
        var el = document.getElementById(id);
        if (!el) return;
        if (!el.classList || !el.classList.contains("section")) return;
        e.preventDefault();
        var nextTarget = getTargetYForSection(el);
        triggerTransition(findBestIndexByDistance(getScrollY()), findBestIndexByDistance(nextTarget));
        beginProgrammaticWatch(nextTarget);
        bgState.ignoreScrollUntil = performance.now() + 340;
        animateToY(nextTarget);
      },
      true
    );

    ["wheel", "touchstart", "keydown"].forEach(function (evt) {
      window.addEventListener(
        evt,
        function () {
          if (isProgrammatic) {
            if (bgState.transitionActive) return;
            if (evt === "wheel" && performance.now() - lastWheelSnapAt < 120) return;
            cancelAnim();
            stopWatch();
            cancelBgTransition();
            bgState.ignoreScrollUntil = performance.now() + 220;
          }
        },
        { passive: true }
      );
    });

    window.addEventListener(
      "scroll",
      function () {
        if (idleTimer) clearTimeout(idleTimer);
        var now = performance.now();
        var y = getScrollY();
        var dt = now - (lastScrollT || now);
        var dy = y - (lastScrollY || y);
        if (dy > 0.6) {
          lastDir = 1;
          setBgSequenceDirection(1);
        } else if (dy < -0.6) {
          lastDir = -1;
          setBgSequenceDirection(-1);
        }
        if (dt > 0) lastVel = Math.abs(dy) / dt;
        lastScrollY = y;
        lastScrollT = now;
        if (isMobileSnapMode()) {
          return;
        }
        idleTimer = setTimeout(snapNow, 140);
      },
      { passive: true }
    );
  }

  function setupNavbarScrollOffsets() {
    var nav = document.querySelector(".site-navbar");
    if (!nav) return;
    var sections = Array.prototype.slice.call(document.querySelectorAll(".section[id]"));

    function apply() {
      var h = nav.offsetHeight || 0;
      document.documentElement.style.scrollPaddingTop = h + "px";
      var footer = document.getElementById("siteFooter") || document.querySelector(".site-footer");
      var footerH = footer ? footer.offsetHeight || 0 : 0;
      if (!footerH) footerH = 64;
      if (document.body && document.body.classList.contains("mobile-home-experience")) {
        document.documentElement.style.scrollPaddingBottom = "0px";
        document.documentElement.style.setProperty("--footer-safe", "0px");
      } else {
        document.documentElement.style.scrollPaddingBottom = footerH + "px";
        document.documentElement.style.setProperty("--footer-safe", footerH + "px");
      }
      sections.forEach(function (s) {
        s.style.scrollMarginTop = h + "px";
      });
    }

    apply();
    window.addEventListener("resize", apply);
  }

  function setupAnchorCenterScroll() {
    function getSafeInsets() {
      var nav = document.querySelector(".site-navbar");
      var footer = document.getElementById("siteFooter") || document.querySelector(".site-footer");
      var top = nav ? nav.offsetHeight || 0 : 0;
      var bottom = 0;
      if (!(document.body && document.body.classList.contains("mobile-home-experience"))) {
        bottom = footer ? footer.offsetHeight || 0 : 0;
        if (!bottom) bottom = 64;
      }
      return { top: top, bottom: bottom };
    }

    function getMaxScroll() {
      var doc = document.documentElement;
      var scrollH = Math.max(doc.scrollHeight || 0, document.body ? document.body.scrollHeight || 0 : 0);
      var vh = window.innerHeight || doc.clientHeight || 0;
      return Math.max(0, scrollH - vh);
    }

    function getTargetYForSection(sectionEl) {
      var insets = getSafeInsets();
      var vh = window.innerHeight || document.documentElement.clientHeight || 0;
      var avail = Math.max(0, vh - insets.top - insets.bottom);
      var visualCenter = insets.top + avail / 2;
      var sectionName = sectionEl.getAttribute ? sectionEl.getAttribute("data-section") : "";
      if (sectionName === "home" || sectionEl.id === "home") return 0;
      var top = sectionEl.offsetTop || 0;
      var h = sectionEl.offsetHeight || vh;
      var y = top + h / 2 - visualCenter;
      var maxScroll = getMaxScroll();
      return Math.max(0, Math.min(maxScroll, y));
    }

    function scrollToY(y) {
      if (window.__snapAnimateToY) window.__snapAnimateToY(y);
      else window.scrollTo({ top: y, behavior: "smooth" });
    }

    document.addEventListener(
      "click",
      function (e) {
        if (document.body && document.body.classList.contains("modal-open")) return;
        var t = e.target;
        if (!t) return;
        var a = t.closest ? t.closest('a[href^="#"]') : null;
        if (!a) return;
        var href = a.getAttribute("href") || "";
        if (!href || href === "#") return;
        var id = href.slice(1);
        if (!id) return;
        var el = document.getElementById(id);
        if (!el || !el.classList || !el.classList.contains("section")) return;
        e.preventDefault();
        scrollToY(getTargetYForSection(el));
      },
      true
    );

    window.__scrollToSectionCenter = function (sectionEl) {
      if (!sectionEl) return;
      scrollToY(getTargetYForSection(sectionEl));
    };
  }

  function getNextSection(current) {
    var order = ["home", "resources", "cooperation", "contact"];
    var idx = order.indexOf(current);
    if (idx >= 0 && idx < order.length - 1) {
      return order[idx + 1];
    }
    return null;
  }

  function switchVideo(sectionName) {
    if (videos["intro"] || document.getElementById("bgWebpCanvas")) return;

    Object.keys(videos).forEach(function (key) {
      var v = videos[key];
      if (!v) return;
      if (key === sectionName) {
        v.classList.add("active");
        if (videoControllers[key]) {
          videoControllers[key].setActive(true);
        } else {
          v.play().catch(function () { });
        }
      } else {
        v.classList.remove("active");
        if (videoControllers[key]) {
          videoControllers[key].setActive(false);
        } else {
          v.pause();
        }
      }
    });
  }

  function buildNavDots() {
    var sections = document.querySelectorAll(".section[data-section]");
    var container = document.getElementById("navDots");
    if (!container) return;

    sections.forEach(function (s) {
      var name = s.getAttribute("data-section");
      var dot = document.createElement("button");
      dot.className = "nav-dot glass-sm";
      dot.setAttribute("aria-label", name);
      dot.addEventListener("click", function () {
        if (window.__scrollToSectionCenter) window.__scrollToSectionCenter(s);
        else s.scrollIntoView({ behavior: "smooth" });
      });
      container.appendChild(dot);
    });

    updateNavDots("home");
  }

  function updateNavDots(activeName) {
    var sections = document.querySelectorAll(".section[data-section]");
    var dots = document.querySelectorAll(".nav-dot");
    sections.forEach(function (s, i) {
      var name = s.getAttribute("data-section");
      if (dots[i]) {
        dots[i].classList.toggle("active", name === activeName);
      }
    });
  }

  function setupRadioGroups() {
    document.querySelectorAll(".radio-item").forEach(function (item) {
      item.addEventListener("click", function () {
        var group = item.parentElement;
        group.querySelectorAll(".radio-item").forEach(function (el) {
          el.classList.remove("selected");
          el.querySelector("input").checked = false;
        });
        item.classList.add("selected");
        item.querySelector("input").checked = true;
      });
    });
  }

  function setupCheckboxGroups() {
    document.querySelectorAll(".checkbox-item").forEach(function (item) {
      item.addEventListener("click", function (e) {
        e.preventDefault();
        var cb = item.querySelector("input");
        cb.checked = !cb.checked;
        item.classList.toggle("selected", cb.checked);
      });
    });
  }

  function setupSpotlightCards() {
    var cards = document.querySelectorAll(".resource-card, .cooperation-step");
    cards.forEach(function (card) {
      if (card.__spotlightBound) return;
      card.__spotlightBound = true;

      var color = card.getAttribute("data-spotlight-color");
      if (color) {
        card.style.setProperty("--spotlight-color", color);
      }

      function handleMouseMove(e) {
        var rect = card.getBoundingClientRect();
        var x = e.clientX - rect.left;
        var y = e.clientY - rect.top;
        card.style.setProperty("--mouse-x", x + "px");
        card.style.setProperty("--mouse-y", y + "px");
      }

      function handleMouseLeave() {
        card.style.setProperty("--mouse-x", "50%");
        card.style.setProperty("--mouse-y", "50%");
      }

      card.addEventListener("mousemove", handleMouseMove);
      card.addEventListener("mouseleave", handleMouseLeave);
    });
  }

  function getSelectedCheckboxValues(name) {
    var values = [];
    document.querySelectorAll('input[name="' + name + '"]:checked').forEach(function (cb) {
      values.push(cb.value);
    });
    return values;
  }

  function getSelectedRadioValue(name) {
    var el = document.querySelector('input[name="' + name + '"]:checked');
    return el ? el.value : null;
  }

  function showFieldError(fieldId, errorId, show) {
    var errorEl = document.getElementById(errorId);
    if (errorEl) {
      errorEl.classList.toggle("visible", show);
    }
    var inputEl = document.getElementById(fieldId);
    if (inputEl) {
      inputEl.style.borderColor = show ? "#ff6b6b" : "";
    }
  }

  function validateForm() {
    var valid = true;
    var phoneEl = document.getElementById("phone");
    var phone = phoneEl ? phoneEl.value.trim() : "";

    if (phoneEl && !/^1\d{10}$/.test(phone)) {
      showFieldError("phone", "phoneError", true);
      valid = false;
    } else {
      showFieldError("phone", "phoneError", false);
    }

    return valid;
  }

  function submitLead(formData) {
    var submitBtn = document.getElementById("submitBtn");
    submitBtn.disabled = true;
    submitBtn.textContent = "领取中...";

    return fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
    })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        submitBtn.disabled = false;
        submitBtn.textContent = "立即获取订单机会";
        return res;
      })
      .catch(function () {
        submitBtn.disabled = false;
        submitBtn.textContent = "立即获取订单机会";
        return { success: false, message: "网络错误，请稍后重试" };
      });
  }

  function resetLeadForm() {
    var form = document.getElementById("leadForm");
    if (form && typeof form.reset === "function") {
      form.reset();
    }

    document.querySelectorAll(".radio-item.selected, .checkbox-item.selected").forEach(function (item) {
      item.classList.remove("selected");
    });

    document.querySelectorAll('#leadForm input[type="radio"], #leadForm input[type="checkbox"]').forEach(function (input) {
      input.checked = false;
    });

    showFieldError("phone", "phoneError", false);
  }

  function setupForm() {
    var form = document.getElementById("leadForm");
    if (!form) return;
    if (form.__submitBound) return;
    form.__submitBound = true;

    form.addEventListener("submit", function (e) {
      e.preventDefault();

      if (!validateForm()) return;

      var usedVidreamStr = getSelectedRadioValue("usedVidream");
      var usedVidream = usedVidreamStr === "true" ? true : usedVidreamStr === "false" ? false : null;
      var phoneEl = document.getElementById("phone");
      var dramaTypes = getSelectedCheckboxValues("dramaTypes");

      var formData = {
        phone: phoneEl ? phoneEl.value.trim() : "",
        teamName: null,
        dramaTypes: dramaTypes.length > 0 ? JSON.stringify(dramaTypes) : null,
        usedVidream: usedVidream,
        teamScale: getSelectedRadioValue("teamScale"),
        deliveryDays: getSelectedRadioValue("deliveryDays")
      };

      submitLead(formData).then(function (res) {
        if (res.success) {
          var returnedLeadId = res && res.data && res.data.leadId ? parseInt(res.data.leadId, 10) : null;
          if (returnedLeadId && isFinite(returnedLeadId) && returnedLeadId > 0) {
            setLeadId(returnedLeadId);
            leadState.interestsLoadedLeadId = null;
            loadInterestedOrders(true);
          }
          resetLeadForm();
          var successEl = document.getElementById("formSuccess");
          if (successEl) {
            successEl.classList.remove("visible");
          }
          if (leadState.pendingOrderId && leadState.leadId) {
            var pendingOrderId = leadState.pendingOrderId;
            submitOrderInterest(pendingOrderId, null).then(function (interestRes) {
              if (interestRes && interestRes.success) {
                setPendingOrderId(null);
                markOrderInterested(pendingOrderId);
                syncOrderInterestButtonState(pendingOrderId);
                setOrderInterestSuccessText(interestRes.message || "我们已收到你的订单意向登记。");
              }
            });
          }
          openModal("contactSuccess");
        } else {
          setOrderInterestSuccessText(res.message || "\u63d0\u4ea4\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5");
          openModal("orderInterestSuccess");
        }
      });
    });

    var phoneInput = document.getElementById("phone");
    if (phoneInput && !phoneInput.__errorBound) {
      phoneInput.__errorBound = true;
      phoneInput.addEventListener("input", function () {
        showFieldError("phone", "phoneError", false);
      });
    }
  }

  function recordPageView() {
    fetch("/api/page-view", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({ path: window.location.pathname }),
    }).catch(function () { });
  }

  function escapeHTML(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function getPageScrollY() {
    var y = 0;
    if (typeof window.pageYOffset === "number") y = window.pageYOffset || 0;
    else if (typeof window.scrollY === "number") y = window.scrollY || 0;
    var se = document.scrollingElement || document.documentElement;
    var seY = se && typeof se.scrollTop === "number" ? se.scrollTop || 0 : 0;
    var body = document.body;
    var bodyY = body && typeof body.scrollTop === "number" ? body.scrollTop || 0 : 0;
    return Math.max(y, seY, bodyY);
  }

  function getModalElements() {
    return {
      backdrop: document.getElementById("siteModalBackdrop"),
      privacy: document.getElementById("privacyModal"),
      orderPreview: document.getElementById("orderPreviewModal"),
      contactSuccess: document.getElementById("contactSuccessModal"),
      orderInterestSuccess: document.getElementById("orderInterestSuccessModal"),
    };
  }

  function setModalVisibility(modalEl, visible) {
    if (!modalEl) return;
    if (visible) {
      modalEl.hidden = false;
      modalEl.setAttribute("aria-hidden", "false");
    } else {
      modalEl.hidden = true;
      modalEl.setAttribute("aria-hidden", "true");
    }
  }

  function focusElementNoScroll(el) {
    if (!el || typeof el.focus !== "function") return;
    if (!(el.isConnected || (document.documentElement && document.documentElement.contains(el)))) return;
    try {
      el.focus({ preventScroll: true });
    } catch (e) { }
  }

  function shouldUseFixedScrollLock() {
    return true;
  }

  function setModalOpenState(isOpen) {
    var root = document.documentElement;
    var body = document.body;
    if (!root || !body) return;
    if (isOpen) {
      modalState.suppressSectionTransitionUntil = performance.now() + 900;
      pauseIntersectionObserver();
      if (modalState.scrollLocked) {
        root.classList.add("modal-open");
        body.classList.add("modal-open");
        return;
      }
      if (typeof window.__snapCancel === "function") {
        try {
          window.__snapCancel();
        } catch (e) { }
      }
      modalState.scrollLocked = true;
      modalState.scrollY = Math.round(getPageScrollY());
      modalState.lockMode = shouldUseFixedScrollLock() ? "fixed" : "fixed";
      modalState.prevRootOverflow = root.style.overflow;
      modalState.prevBodyPaddingRight = body.style.paddingRight;
      root.classList.add("modal-open");
      body.classList.add("modal-open");
      var scrollbarW = (window.innerWidth || 0) - (root.clientWidth || 0);
      if (scrollbarW > 0) body.style.paddingRight = scrollbarW + "px";
      body.style.position = "fixed";
      body.style.top = -modalState.scrollY + "px";
      body.style.left = "0";
      body.style.right = "0";
      body.style.width = "100%";
      bgState.ignoreScrollUntil = performance.now() + 500;
      return;
    }
    if (!modalState.scrollLocked) {
      root.classList.remove("modal-open");
      body.classList.remove("modal-open");
      return;
    }
    var restoreY = typeof modalState.scrollY === "number" ? Math.round(modalState.scrollY) : 0;
    modalState.scrollLocked = false;
    if (typeof window.__snapCancel === "function") {
      try {
        window.__snapCancel();
      } catch (e) { }
    }
    bgState.ignoreScrollUntil = performance.now() + 1600;
    if (modalState.restoreRaf) cancelAnimationFrame(modalState.restoreRaf);
    modalState.restoreRaf = 0;
    root.classList.remove("modal-open");
    body.classList.remove("modal-open");
    body.style.paddingRight = modalState.prevBodyPaddingRight || "";
    body.style.position = "";
    body.style.top = "";
    body.style.left = "";
    body.style.right = "";
    body.style.width = "";
    var prevBehavior2 = root.style.scrollBehavior;
    root.style.scrollBehavior = "auto";
    try {
      window.scrollTo(0, restoreY);
    } finally {
      root.style.scrollBehavior = prevBehavior2;
    }
    modalState.suppressSectionTransitionUntil = performance.now() + 1200;
    resumeIntersectionObserver();
    modalState.scrollY = null;
    modalState.lockMode = "";
    modalState.prevRootOverflow = "";
    modalState.prevBodyPaddingRight = "";
  }

  function closeActiveModal(opts) {
    if (!modalState.active) return;
    opts = opts || {};
    if (!opts.keepFocus && modalState.lastFocus) {
      focusElementNoScroll(modalState.lastFocus);
    }
    if (!opts.keepOpenState) setModalOpenState(false);
    var els = getModalElements();
    if (els.backdrop && !opts.keepBackdrop) els.backdrop.hidden = true;
    setModalVisibility(els.privacy, false);
    setModalVisibility(els.orderPreview, false);
    setModalVisibility(els.contactSuccess, false);
    setModalVisibility(els.orderInterestSuccess, false);
    modalState.active = "";
    if (!opts.keepFocus) {
      modalState.lastFocus = null;
    }
  }


  function openModal(name, triggerEl) {
    if (!name) return;
    if (viewportState.mobileHome && navigateToModalPage(name)) return;
    var els = getModalElements();
    if (!els.backdrop) return;
    if (modalState.active) {
      closeActiveModal({ keepBackdrop: true, keepOpenState: true, keepFocus: true });
    }
    if (!modalState.lastFocus) {
      modalState.lastFocus = triggerEl || document.activeElement;
    }
    modalState.active = name;
    els.backdrop.hidden = false;
    setModalOpenState(true);
    if (name === "privacy") {
      setModalVisibility(els.privacy, true);
      setModalVisibility(els.orderPreview, false);
      setModalVisibility(els.contactSuccess, false);
      setModalVisibility(els.orderInterestSuccess, false);
      renderPrivacyModal();
    } else if (name === "orderPreview") {
      setModalVisibility(els.orderPreview, true);
      setModalVisibility(els.privacy, false);
      setModalVisibility(els.contactSuccess, false);
      setModalVisibility(els.orderInterestSuccess, false);
      ensureOrdersPreviewLoaded();
    } else if (name === "contactSuccess") {
      setModalVisibility(els.contactSuccess, true);
      setModalVisibility(els.privacy, false);
      setModalVisibility(els.orderPreview, false);
      setModalVisibility(els.orderInterestSuccess, false);
      renderContactSuccessModal();
    } else if (name === "orderInterestSuccess") {
      setModalVisibility(els.orderInterestSuccess, true);
      setModalVisibility(els.privacy, false);
      setModalVisibility(els.orderPreview, false);
      setModalVisibility(els.contactSuccess, false);
      renderOrderInterestSuccessModal();
    }
    var focusTarget = null;
    var activeEl =
      name === "privacy"
        ? els.privacy
        : name === "orderPreview"
          ? els.orderPreview
          : name === "contactSuccess"
            ? els.contactSuccess
            : els.orderInterestSuccess;
    if (activeEl) {
      focusTarget = activeEl.querySelector(".site-modal-close");
    }
    if (focusTarget && typeof focusTarget.focus === "function") {
      setTimeout(function () {
        try {
          focusTarget.focus({ preventScroll: true });
        } catch (e) {
          try {
            focusTarget.focus();
          } catch (e2) { }
        }
      }, 0);
    }
  }

  function renderPrivacyModal() {
    var retentionEl = document.getElementById("privacyRetentionDays");
    if (retentionEl) retentionEl.textContent = getConfig("data_retention_days", "365") || "365";
    var emailEl = document.getElementById("privacyContactEmail");
    if (emailEl) emailEl.textContent = getConfig("contact_email", "lihuan@viju.cn") || "lihuan@viju.cn";
    var companyEl = document.getElementById("privacyCompanyInfo");
    if (companyEl) companyEl.textContent = getConfig("company_name", "郑州微爱剧科技有限公司") || "郑州微爱剧科技有限公司";
  }

  function renderContactSuccessModal() {
    var textEl = document.getElementById("contactSuccessText");
    if (textEl) {
      textEl.textContent =
        getConfig(
          "success_page_text",
          "我们将在24小时内通过手机号与你联系，发送当前订单需求与匹配建议。你也可以先免费体验 VIDream AI 短剧工具，提前熟悉脚本生成、智能分镜、AI 配音等能力，提升接单效率。"
        ) ||
        "我们将在24小时内通过手机号与你联系，发送当前订单需求与匹配建议。你也可以先免费体验 VIDream AI 短剧工具，提前熟悉脚本生成、智能分镜、AI 配音等能力，提升接单效率。";
    }

    var trialLink = document.getElementById("contactSuccessTrialLink");
    if (trialLink) {
      trialLink.href = getConfig("vidream_trial_url", "https://www.vidream.net") || "https://www.vidream.net";
    }

    fetch("/api/page-view", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({ path: "/contact-success" }),
    }).catch(function () { });
  }

  function renderOrderInterestSuccessModal() {
    var textEl = document.getElementById("orderInterestSuccessText");
    if (textEl) {
      textEl.textContent = leadState.orderInterestSuccessText || "我们已收到你的订单意向登记。";
    }
  }

  function guideToContactForm(customTip) {
    var contactSection = document.getElementById("contact") || document.querySelector('.section[data-section="contact"]');
    if (!contactSection) return;

    var tipEl = document.getElementById("contactScrollTip");
    if (tipEl) {
      tipEl.hidden = false;
      tipEl.textContent = customTip || "请填写下列表单，获取最新订单列表。";
    }

    if (window.__scrollToSectionTarget) window.__scrollToSectionTarget(contactSection);
    else if (window.__scrollToSectionCenter) window.__scrollToSectionCenter(contactSection);
    else contactSection.scrollIntoView({ behavior: "smooth", block: "start" });

    window.setTimeout(function () {
      var phoneInput = document.getElementById("phone");
      if (!phoneInput || typeof phoneInput.focus !== "function") return;
      try {
        phoneInput.focus({ preventScroll: true });
      } catch (e) {
        phoneInput.focus();
      }
    }, 520);
  }

  function navigateToHomeContactSection(orderId) {
    if (typeof orderId === "number" && isFinite(orderId) && orderId > 0) {
      setPendingOrderId(orderId);
    }
    writeSessionText(SESSION_KEY_HOME_SCROLL_TARGET, "contact");
    window.location.href = "/";
  }

  function getInitialRestoreTarget() {
    var allowed = ["home", "resources", "cooperation", "contact"];
    var hash = (window.location.hash || "").replace("#", "");
    if (allowed.indexOf(hash) >= 0) {
      return { name: hash, fromHash: true };
    }
    var pending = readSessionText(SESSION_KEY_HOME_SCROLL_TARGET);
    if (allowed.indexOf(pending) >= 0) {
      return { name: pending, fromHash: false };
    }
    return null;
  }

  function restoreInitialHashSection() {
    var target = getInitialRestoreTarget();
    if (!target || !target.name) return;
    var sectionEl = document.getElementById(target.name) || document.querySelector('.section[data-section="' + target.name + '"]');
    if (!sectionEl) return;
    var restored = false;
    var run = function () {
      if (restored) return;
      restored = true;
      if (!target.fromHash) {
        writeSessionText(SESSION_KEY_HOME_SCROLL_TARGET, "");
      }
      if (target.name === "contact") {
        var tip = leadState.pendingOrderId
          ? "请填写下列表单，我们会把你的信息关联到这条订单。"
          : null;
        guideToContactForm(tip);
        return;
      }
      if (window.__scrollToSectionTarget) window.__scrollToSectionTarget(sectionEl);
      else if (window.__scrollToSectionCenter) window.__scrollToSectionCenter(sectionEl);
      else sectionEl.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    requestAnimationFrame(function () {
      requestAnimationFrame(run);
    });
    window.setTimeout(run, 320);
  }

  function renderOrdersInto(container, orders) {
    if (!container) return;
    if (!orders || !orders.length) {
      container.innerHTML =
        '<div class="orders-empty glass"><div class="icon">📋</div><p>暂无活跃订单，请稍后再来查看</p></div>';
      return;
    }
    container.innerHTML = orders
      .map(function (order) {
        var interested = isOrderInterested(order.id);
        var buttonHtml = interested
          ? '<button type="button" class="btn btn-primary" disabled>已登记</button>'
          : '<button type="button" class="btn btn-primary" data-order-interest-id="' + escapeHTML(String(order.id == null ? "" : order.id)) + '">对此订单感兴趣 →</button>';
        return (
          '<div class="order-card glass">' +
          '<div class="order-main">' +
          "<h3>" +
          escapeHTML(order.title) +
          "</h3>" +
          '<div class="order-meta">' +
          (order.dramaType ? '<span class="tag tag-drama">' + escapeHTML(order.dramaType) + "</span>" : "") +
          (order.budget ? '<span class="tag tag-budget">' + escapeHTML(order.budget) + "</span>" : "") +
          (order.deadline ? "<span>📅 截止：" + escapeHTML(order.deadline) + "</span>" : "") +
          "</div>" +
          (order.requirements ? '<p class="order-requirements">' + escapeHTML(order.requirements) + "</p>" : "") +
          "</div>" +
          '<div class="order-action">' +
          buttonHtml +
          "</div>" +
          "</div>"
        );
      })
      .join("");
  }

  function syncOrderInterestButtonState(orderId) {
    var selector = '[data-order-interest-id="' + String(orderId) + '"]';
    document.querySelectorAll(selector).forEach(function (btn) {
      btn.removeAttribute("data-order-interest-id");
      btn.classList.remove("btn-primary");
      btn.classList.add("btn-outline", "is-registered");
      btn.textContent = "已登记";
      btn.disabled = true;
    });
  }

  function submitOrderInterest(orderId, buttonEl) {
    var originalText = "";
    if (buttonEl) {
      originalText = buttonEl.getAttribute("data-original-text") || buttonEl.textContent || "对此订单感兴趣 →";
      buttonEl.setAttribute("data-original-text", originalText);
      buttonEl.disabled = true;
      buttonEl.textContent = "提交中...";
    }

    return fetch("/api/order-interests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        leadId: leadState.leadId,
        orderId: orderId,
      }),
    })
      .then(function (r) { return r.json(); })
      .catch(function () {
        return { success: false, message: "网络错误，请稍后重试" };
      })
      .then(function (res) {
        if (buttonEl) {
          buttonEl.disabled = false;
          buttonEl.textContent = originalText;
        }
        return res;
      });
  }

  function loadInterestedOrders(force) {
    if (!leadState.leadId) {
      setInterestedOrderIds([]);
      leadState.interestsLoadedLeadId = null;
      return Promise.resolve([]);
    }
    if (!force && leadState.interestsLoadedLeadId === leadState.leadId && leadState.interestedOrderIds.length) {
      return Promise.resolve(leadState.interestedOrderIds.slice());
    }
    if (leadState.interestsFetchPromise) return leadState.interestsFetchPromise;
    leadState.interestsFetchPromise = fetch("/api/order-interests?leadId=" + encodeURIComponent(String(leadState.leadId)))
      .then(function (r) { return r.json(); })
      .then(function (res) {
        leadState.interestsFetchPromise = null;
        var orderIds = res && res.success && res.data && Array.isArray(res.data.orderIds) ? res.data.orderIds : [];
        setInterestedOrderIds(orderIds);
        leadState.interestsLoadedLeadId = leadState.leadId;
        return leadState.interestedOrderIds.slice();
      })
      .catch(function () {
        leadState.interestsFetchPromise = null;
        return leadState.interestedOrderIds.slice();
      });
    return leadState.interestsFetchPromise;
  }

  function ensureOrdersPreviewLoaded() {
    var container = document.getElementById("ordersListModal");
    if (!container) return;
    if (ordersCache) {
      loadInterestedOrders(false).finally(function () {
        renderOrdersInto(container, ordersCache);
      });
      return;
    }
    if (ordersFetchPromise) return;
    container.innerHTML = '<div class="orders-empty glass"><div class="icon">⏳</div><p>加载中...</p></div>';
    ordersFetchPromise = Promise.all([
      fetch("/api/orders?status=active").then(function (r) { return r.json(); }),
      loadInterestedOrders(false),
    ])
      .then(function (results) {
        ordersFetchPromise = null;
        var res = results[0];
        if (res && res.success && res.data && res.data.length) {
          ordersCache = res.data;
        } else {
          ordersCache = [];
        }
        renderOrdersInto(container, ordersCache);
      })
      .catch(function () {
        ordersFetchPromise = null;
        container.innerHTML = '<div class="orders-empty glass"><div class="icon">⚠️</div><p>加载失败，请刷新页面重试</p></div>';
      });
  }

  function setupModals() {
    var els = getModalElements();
    if (!els.backdrop) return;
    if (setupModals.__bound) return;
    setupModals.__bound = true;

    document.addEventListener(
      "click",
      function (e) {
        var t = e.target;
        if (!t) return;
        var interestBtn = t.closest ? t.closest("[data-order-interest-id]") : null;
        if (interestBtn) {
          e.preventDefault();
          var rawOrderId = interestBtn.getAttribute("data-order-interest-id") || "";
          var orderId = parseInt(rawOrderId, 10);
          if (!isFinite(orderId) || orderId <= 0) {
            setOrderInterestSuccessText("未找到订单信息，请稍后重试。");
            closeActiveModal();
            openModal("orderInterestSuccess");
            return;
          }
          if (!leadState.leadId) {
            setPendingOrderId(orderId);
            closeActiveModal();
            if (viewportState.mobileHome) {
              navigateToHomeContactSection(orderId);
              return;
            }
            requestAnimationFrame(function () {
              requestAnimationFrame(function () {
                guideToContactForm("请先填写下列表单，我们会把你的信息关联到这条订单。");
              });
            });
            return;
          }
          submitOrderInterest(orderId, interestBtn).then(function (res) {
            if (res && res.success) {
              setPendingOrderId(null);
              markOrderInterested(orderId);
              syncOrderInterestButtonState(orderId);
              setOrderInterestSuccessText(res.message || "我们已收到你的订单意向登记。");
              closeActiveModal();
              openModal("orderInterestSuccess");
              return;
            }
            if (res && res.message === "线索不存在，请先提交联系方式") {
              setLeadId(null);
              setInterestedOrderIds([]);
              leadState.interestsLoadedLeadId = null;
              setPendingOrderId(orderId);
              closeActiveModal();
              if (viewportState.mobileHome) {
                navigateToHomeContactSection(orderId);
                return;
              }
              requestAnimationFrame(function () {
                requestAnimationFrame(function () {
                  guideToContactForm("请重新填写下列表单，我们会把你的信息关联到这条订单。");
                });
              });
              return;
            }
            setOrderInterestSuccessText((res && res.message) || "提交失败，请稍后重试。");
            closeActiveModal();
            openModal("orderInterestSuccess");
          });
          return;
        }
        var contactBtn = t.closest ? t.closest("[data-scroll-to-contact]") : null;
        if (contactBtn) {
          e.preventDefault();
          closeActiveModal();
          requestAnimationFrame(function () {
            requestAnimationFrame(function () {
              guideToContactForm();
            });
          });
          return;
        }
        var closeBtn = t.closest ? t.closest("[data-modal-close]") : null;
        if (closeBtn) {
          e.preventDefault();
          closeActiveModal();
          return;
        }
        var trigger = t.closest ? t.closest("[data-modal-trigger]") : null;
        if (!trigger) return;
        var name = trigger.getAttribute("data-modal-trigger") || "";
        if (name !== "privacy" && name !== "orderPreview" && name !== "contactSuccess" && name !== "orderInterestSuccess") return;
        e.preventDefault();
        openModal(name, trigger);
      },
      true
    );

    els.backdrop.addEventListener("click", function () {
      closeActiveModal();
    });

    document.addEventListener("keydown", function (e) {
      if (!modalState.active) return;
      if (!e) return;
      if (e.key === "Escape" || e.keyCode === 27) {
        e.preventDefault();
        closeActiveModal();
      }
    });
  }

  function getInitialSectionName() {
    var hash = (window.location.hash || "").replace("#", "");
    var allowed = ["home", "resources", "cooperation", "contact"];
    if (allowed.indexOf(hash) >= 0) return hash;
    return "home";
  }

  function showInitialSectionContent(sectionName) {
    var content = document.querySelector('#' + sectionName + ' .section-content') || document.querySelector('.section[data-section="' + sectionName + '"] .section-content');
    if (!content) return;
    content.classList.add("visible");
    content.style.transition = "none";
    requestAnimationFrame(function () {
      content.style.transition = "";
    });
  }

  function renderBrandMark() {
    var mark = document.querySelector(".site-brand-mark");
    if (!mark) return;
    var fallback = (mark.textContent || "").trim();
    var companyName = getConfig("company_name", fallback);
    mark.textContent = companyName;
  }

  function renderAll() {
    renderNavigationLinks();
    renderBrandMark();
    renderCompanyLogo();
    renderHeroBadges();
    renderHeroHeading();
    renderHeroStats();
    renderSectionTitles();
    renderSectionCards("resourcesCards", "resources_cards", DEFAULT_RESOURCES_CARDS, false);
    renderPartnerLogos();
    renderResourceDataBar();
    renderSectionCards("cooperationCards", "cooperation_cards", DEFAULT_COOPERATION_CARDS, true);
    renderSettlementText();
    renderCooperationNote();
    renderCooperationCase();
    renderContactFields();
    renderPrivacyNotice();
    renderWechatQR();
    renderFooter();
    renderPrivacyModal();
  }

  function init() {
    setLeadId(readPersistedNumber(PERSIST_KEY_LEAD_ID, SESSION_KEY_LEAD_ID));
    setPendingOrderId(readSessionNumber(SESSION_KEY_PENDING_ORDER_ID));
    setInterestedOrderIds(readPersistedNumberList(PERSIST_KEY_INTERESTED_ORDER_IDS, SESSION_KEY_INTERESTED_ORDER_IDS));
    setupToneToggle();
    applyViewportExperienceClass();
    window.addEventListener("resize", applyViewportExperienceClass);
    setupNavbarScrollOffsets();
    if (!viewportState.mobileHome) {
      setupAnchorCenterScroll();
    }
    try {
      if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    } catch (e) { }
    if (!window.location.hash) {
      window.scrollTo(0, 0);
    }
    currentSection = getInitialSectionName();
    showInitialSectionContent(currentSection);
    fetchConfig().then(function () {
      renderAll();
      setupModals();
      initVideos();
      setupIntersectionObserver();
      if (!viewportState.mobileHome) {
        buildNavDots();
      }
      setupScrollSpy();
      setupSectionSnap();
      setupSpotlightCards();
      setupRadioGroups();
      setupCheckboxGroups();
      setupForm();
      restoreInitialHashSection();
      setupWechatConsult();
      recordPageView();
      loadInterestedOrders(false);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
