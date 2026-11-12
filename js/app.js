/**
 * ScreenGap — Main Application Controller
 */

import {
  loadSettings,
  saveSettings,
  loadVideos,
  saveVideos,
  loadDailyStats,
  saveDailyStats,
  STARTER_VIDEOS,
} from "./storage.js";
import { AudioFeedback } from "./audio.js";
import { DistanceTracker } from "./tracker.js";
import {
  YouTubeController,
  parseYouTubeInput,
  fetchYouTubeMetadata,
} from "./youtube.js";

const settings = loadSettings();
let videos = loadVideos();
let stats = loadDailyStats();
let activeVideoId = videos[0]?.id || STARTER_VIDEOS[0].id;

// Support opening directly with ?v=VIDEO_ID
const urlParamV = new URLSearchParams(window.location.search).get("v");
if (urlParamV) {
  const parsedParam = parseYouTubeInput(urlParamV);
  if (parsedParam?.videoId) activeVideoId = parsedParam.videoId;
}

const audio = new AudioFeedback();

// DOM Elements
const els = {
  telemetryBar: document.getElementById("telemetry-bar"),
  distanceReadout: document.getElementById("distance-readout"),
  distanceMeterFill: document.getElementById("distance-meter-fill"),
  telemetryLabel: document.getElementById("telemetry-label"),

  btnCinema: document.getElementById("btn-cinema"),
  btnGuide: document.getElementById("btn-guide"),
  btnSettings: document.getElementById("btn-settings"),

  cameraBanner: document.getElementById("camera-start-banner"),
  bannerStatusText: document.getElementById("banner-status-text"),
  btnStartCamera: document.getElementById("btn-start-camera"),
  btnStartSim: document.getElementById("btn-start-sim"),

  camPip: document.getElementById("cam-pip"),
  camVideo: document.getElementById("cam-video"),
  camCanvas: document.getElementById("cam-canvas"),
  camPipBadge: document.getElementById("cam-pip-badge"),

  distanceShield: document.getElementById("distance-shield"),
  shieldTitle: document.getElementById("shield-title"),
  shieldMessage: document.getElementById("shield-message"),
  shieldCurrentCm: document.getElementById("shield-current-cm"),
  shieldTargetCm: document.getElementById("shield-target-cm"),
  shieldProgressFill: document.getElementById("shield-progress-fill"),

  simStrip: document.getElementById("sim-strip"),
  simRange: document.getElementById("sim-range"),
  simValue: document.getElementById("sim-value"),
  btnExitSim: document.getElementById("btn-exit-sim"),

  urlForm: document.getElementById("url-form"),
  urlInput: document.getElementById("url-input"),
  btnPasteUrl: document.getElementById("btn-paste-url"),

  videoList: document.getElementById("video-list"),
  videoCount: document.getElementById("video-count"),

  // Parent Math Gate Modal
  gateModal: document.getElementById("gate-modal"),
  mathPrompt: document.getElementById("math-prompt"),
  gateForm: document.getElementById("gate-form"),
  gateInput: document.getElementById("gate-input"),
  gateError: document.getElementById("gate-error"),
  btnCloseGate: document.getElementById("btn-close-gate"),

  // Parent Settings Modal
  settingsModal: document.getElementById("settings-modal"),
  btnCloseSettings: document.getElementById("btn-close-settings"),
  inputThreshold: document.getElementById("input-threshold"),
  badgeThreshold: document.getElementById("badge-threshold"),
  inputGrace: document.getElementById("input-grace"),
  badgeGrace: document.getElementById("badge-grace"),
  toggleNoFace: document.getElementById("toggle-no-face"),
  toggleVoice: document.getElementById("toggle-voice"),
  toggleSound: document.getElementById("toggle-sound"),
  togglePip: document.getElementById("toggle-pip"),
  btnCalibrate40: document.getElementById("btn-calibrate-40"),
  btnResetCalib: document.getElementById("btn-reset-calib"),
  calibStatus: document.getElementById("calib-status"),
  btnToggleCamInSettings: document.getElementById("btn-toggle-cam-settings"),
  btnOpenSimInSettings: document.getElementById("btn-open-sim-settings"),
  btnResetVideos: document.getElementById("btn-reset-videos"),

  statWatchTime: document.getElementById("stat-watch-time"),
  statAlerts: document.getElementById("stat-alerts"),
  statAvgDist: document.getElementById("stat-avg-dist"),

  // iPad Setup Guide Modal
  guideModal: document.getElementById("guide-modal"),
  btnCloseGuide: document.getElementById("btn-close-guide"),
  btnDoneGuide: document.getElementById("btn-done-guide"),
};

// Unlock iOS Web Audio & Vietnamese TTS on first touch anywhere
document.addEventListener("pointerdown", () => audio.unlock(), { once: true });

// Initialize YouTube Controller
const yt = new YouTubeController({
  mountId: "yt-player",
  initialVideoId: activeVideoId,
  onPlayStateChange: () => {},
});
yt.init();

// Initialize AI Distance Tracker
const tracker = new DistanceTracker({
  videoEl: els.camVideo,
  canvasEl: els.camCanvas,
  onUpdate: handleTrackerUpdate,
  onStatusChange: handleTrackerStatus,
});
tracker.configure(settings);

/* ==========================================================================
   Tracker Telemetry & Automatic YouTube Pause/Resume
   ========================================================================== */

function handleTrackerStatus({ code, message }) {
  els.telemetryLabel.textContent = message;

  if (code === "loading_model" || code === "requesting_camera") {
    els.btnStartCamera.disabled = true;
    els.bannerStatusText.textContent = message;
  } else if (code === "active") {
    els.btnStartCamera.disabled = false;
    els.cameraBanner.hidden = true;
    els.simStrip.hidden = true;
    updatePipVisibility();
    els.btnToggleCamInSettings.textContent = "Tắt Camera";
  } else if (code === "simulating") {
    els.btnStartCamera.disabled = false;
    els.cameraBanner.hidden = true;
    els.simStrip.hidden = false;
    els.camPip.hidden = true;
    els.btnToggleCamInSettings.textContent = "Bật Camera thật";
  } else if (code === "stopped") {
    els.btnStartCamera.disabled = false;
    els.cameraBanner.hidden = false;
    els.camPip.hidden = true;
    els.distanceReadout.textContent = "-- cm";
    els.distanceMeterFill.style.width = "0%";
    els.telemetryBar.dataset.state = "idle";
    els.btnToggleCamInSettings.textContent = "Bật Camera";
    setShieldVisible(false);
    yt.enforceGuard(false);
  }
}

function handleTrackerUpdate(snapshot) {
  const {
    distanceCm,
    faceDetected,
    isBlocked,
    blockReason,
    thresholdCm,
    safeResumeCm,
    zone,
    stateChanged,
  } = snapshot;

  els.telemetryBar.dataset.state = zone;
  els.camPip.dataset.state = zone;

  if (!faceDetected) {
    els.distanceReadout.textContent = "K.thấy";
    els.camPipBadge.textContent = "Không thấy mặt";
    els.telemetryLabel.textContent = isBlocked
      ? "Đã tạm dừng (Che camera)"
      : "Chưa thấy khuôn mặt";
    els.distanceMeterFill.style.width = "15%";
    els.distanceMeterFill.style.backgroundColor = "var(--warn-fill)";
  } else if (distanceCm !== null) {
    els.distanceReadout.textContent = `${distanceCm} cm`;
    els.camPipBadge.textContent = `${distanceCm} cm`;

    const pct = Math.max(8, Math.min(100, ((distanceCm - 15) / 55) * 100));
    els.distanceMeterFill.style.width = `${pct}%`;
    els.distanceMeterFill.style.backgroundColor =
      zone === "danger"
        ? "var(--danger-fill)"
        : zone === "warn"
        ? "var(--warn-fill)"
        : "var(--safe-fill)";

    els.telemetryLabel.textContent = isBlocked
      ? `Quá gần (< ${thresholdCm} cm)`
      : zone === "warn"
      ? "Hơi gần màn hình"
      : "Khoảng cách an toàn";

    // Accumulate posture distance sample while watching
    if (yt.isPlaying()) {
      stats.distanceSum += distanceCm;
      stats.distanceCount += 1;
    }
  }

  // Enforce YouTube Pause / Resume & Shield UI
  if (isBlocked) {
    yt.enforceGuard(true);
    updateShieldContent({ distanceCm, blockReason, thresholdCm, safeResumeCm });
    setShieldVisible(true);

    if (stateChanged) {
      stats.tooCloseCount += 1;
      saveDailyStats(stats);
      if (settings.soundEnabled) audio.playAlertChime();
      if (settings.voiceEnabled) audio.speakVietnameseReminder(blockReason);
    } else if (settings.voiceEnabled && blockReason === "too_close") {
      // Gentle periodic reminder if child stays too close for >6s
      audio.speakVietnameseReminder(blockReason);
    }
  } else {
    setShieldVisible(false);
    if (stateChanged) {
      if (settings.soundEnabled) audio.playSafeResumeChime();
    }
    yt.enforceGuard(false);
  }
}

function updateShieldContent({ distanceCm, blockReason, safeResumeCm }) {
  if (blockReason === "no_face") {
    els.shieldTitle.textContent = "Camera đang bị khuất rồi!";
    els.shieldMessage.textContent =
      "Con đừng che camera trước nhé. Hãy ngồi ngay ngắn trước màn hình để video phát tiếp nào.";
    els.shieldCurrentCm.textContent = "-- cm";
    els.shieldTargetCm.textContent = `Mục tiêu: ≥ ${safeResumeCm} cm`;
    els.shieldProgressFill.style.width = "15%";
    els.shieldProgressFill.style.backgroundColor = "hsl(34, 90%, 52%)";
    return;
  }

  els.shieldTitle.textContent = "Ôi, mặt gần màn hình quá!";
  els.shieldMessage.textContent =
    "Con ngồi lùi ra xa một chút để bảo vệ đôi mắt sáng khỏe nhé. Video sẽ tự động phát lại ngay!";
  els.shieldCurrentCm.textContent =
    distanceCm !== null ? `${distanceCm} cm` : "-- cm";
  els.shieldTargetCm.textContent = `Cần lùi ra: ≥ ${safeResumeCm} cm`;

  const ratio =
    distanceCm !== null
      ? Math.max(10, Math.min(100, (distanceCm / safeResumeCm) * 100))
      : 20;
  els.shieldProgressFill.style.width = `${ratio}%`;
  els.shieldProgressFill.style.backgroundColor =
    distanceCm !== null && distanceCm >= safeResumeCm
      ? "hsl(154, 62%, 48%)"
      : "hsl(11, 82%, 58%)";
}

function setShieldVisible(visible) {
  els.distanceShield.classList.toggle("is-visible", visible);
  els.distanceShield.setAttribute("aria-hidden", String(!visible));
}

function updatePipVisibility() {
  els.camPip.hidden = !(tracker.running && settings.showCameraPip);
}

/* ==========================================================================
   Watch-Time Ticker (1s interval)
   ========================================================================== */

setInterval(() => {
  if (yt.isPlaying() && !tracker.isBlocked) {
    stats.watchSeconds += 1;
    if (stats.watchSeconds % 10 === 0) {
      saveDailyStats(stats);
    }
  }
}, 1000);

/* ==========================================================================
   Video Shelf & URL Composer
   ========================================================================== */

function renderVideoShelf() {
  els.videoList.innerHTML = "";
  els.videoCount.textContent = `${videos.length} video`;

  for (const item of videos) {
    const card = document.createElement("div");
    card.className = `video-card${item.id === activeVideoId ? " is-active" : ""}`;
    card.setAttribute("role", "button");
    card.tabIndex = 0;

    const thumb = document.createElement("img");
    thumb.className = "video-thumb";
    thumb.loading = "lazy";
    thumb.alt = item.title;
    thumb.src = `https://i.ytimg.com/vi/${item.id}/mqdefault.jpg`;

    const meta = document.createElement("div");
    meta.className = "video-meta";

    const title = document.createElement("p");
    title.className = "video-card-title";
    title.textContent = item.title;

    const tag = document.createElement("span");
    tag.className = "video-card-tag";
    tag.textContent = item.channel || "YouTube";

    meta.append(title, tag);

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "video-delete-btn";
    delBtn.title = "Xóa khỏi danh sách";
    delBtn.setAttribute("aria-label", `Xóa ${item.title}`);
    delBtn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>`;

    delBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (videos.length <= 1) return;
      videos = videos.filter((v) => v.id !== item.id);
      saveVideos(videos);
      renderVideoShelf();
    });

    const selectVideo = () => {
      audio.unlock();
      activeVideoId = item.id;
      yt.loadVideo({ videoId: item.id, listId: item.listId || null });
      renderVideoShelf();
    };

    card.addEventListener("click", selectVideo);
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        selectVideo();
      }
    });

    card.append(thumb, meta, delBtn);
    els.videoList.appendChild(card);
  }
}

els.urlForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  audio.unlock();

  const raw = els.urlInput.value.trim();
  const parsed = parseYouTubeInput(raw);
  if (!parsed || (!parsed.videoId && !parsed.listId)) {
    els.urlInput.setCustomValidity("Vui lòng dán đường dẫn YouTube hoặc mã Video hợp lệ.");
    els.urlInput.reportValidity();
    return;
  }
  els.urlInput.setCustomValidity("");

  yt.loadVideo(parsed);
  els.urlInput.value = "";

  if (parsed.videoId) {
    activeVideoId = parsed.videoId;
    const exists = videos.some((v) => v.id === parsed.videoId);
    if (!exists) {
      const meta = await fetchYouTubeMetadata(parsed.videoId);
      videos.unshift({
        id: parsed.videoId,
        listId: parsed.listId || null,
        title: meta.title,
        channel: meta.channel,
      });
      saveVideos(videos);
    }
    renderVideoShelf();
  }
});

els.urlInput.addEventListener("input", () => {
  els.urlInput.setCustomValidity("");
});

els.btnPasteUrl.addEventListener("click", async () => {
  audio.unlock();
  try {
    if (navigator.clipboard && navigator.clipboard.readText) {
      const clip = await navigator.clipboard.readText();
      if (clip) {
        els.urlInput.value = clip.trim();
        els.urlForm.requestSubmit();
      }
    } else {
      els.urlInput.focus();
    }
  } catch {
    els.urlInput.focus();
  }
});

/* ==========================================================================
   Camera & Simulation Controls
   ========================================================================== */

async function startCameraGuard() {
  audio.unlock();
  try {
    await tracker.startCamera();
  } catch (err) {
    els.btnStartCamera.disabled = false;
    els.bannerStatusText.textContent =
      err?.message || "Không thể bật camera. Hãy kiểm tra quyền Camera trong Safari.";
  }
}

els.btnStartCamera.addEventListener("click", startCameraGuard);

els.btnStartSim.addEventListener("click", () => {
  audio.unlock();
  els.simRange.value = "45";
  els.simValue.textContent = "45 cm";
  tracker.startSimulation(45);
});

els.simRange.addEventListener("input", () => {
  const val = Number(els.simRange.value);
  els.simValue.textContent = `${val} cm`;
  tracker.setSimulatedDistance(val);
});

els.btnExitSim.addEventListener("click", () => {
  tracker.stopSimulation();
  tracker.stopCamera();
});

/* ==========================================================================
   Cinema Mode & Guide Modal
   ========================================================================== */

function applyCinemaMode(enabled) {
  document.body.classList.toggle("cinema-mode", enabled);
  els.btnCinema.setAttribute("aria-pressed", String(enabled));
  els.btnCinema.querySelector("span").textContent = enabled
    ? "Thoát Rạp phim"
    : "Rạp phim";
}

applyCinemaMode(Boolean(settings.cinemaMode));

els.btnCinema.addEventListener("click", () => {
  settings.cinemaMode = !settings.cinemaMode;
  saveSettings(settings);
  applyCinemaMode(settings.cinemaMode);
});

els.btnGuide.addEventListener("click", () => {
  els.guideModal.hidden = false;
});
els.btnCloseGuide.addEventListener("click", () => {
  els.guideModal.hidden = true;
});
els.btnDoneGuide.addEventListener("click", () => {
  els.guideModal.hidden = true;
});

/* ==========================================================================
   Parent Math Gate & Settings Modal
   ========================================================================== */

let expectedMathAnswer = 0;

function openParentGate() {
  const a = Math.floor(Math.random() * 6) + 4; // 4..9
  const b = Math.floor(Math.random() * 6) + 3; // 3..8
  expectedMathAnswer = a * b;
  els.mathPrompt.textContent = `${a} × ${b} = ?`;
  els.gateInput.value = "";
  els.gateError.textContent = "";
  els.gateModal.hidden = false;
  setTimeout(() => els.gateInput.focus(), 60);
}

els.btnSettings.addEventListener("click", openParentGate);

els.btnCloseGate.addEventListener("click", () => {
  els.gateModal.hidden = true;
});

els.gateForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const ans = Number(els.gateInput.value.trim());
  if (ans === expectedMathAnswer) {
    els.gateModal.hidden = true;
    openSettingsModal();
  } else {
    els.gateError.textContent = "Chưa chính xác, bố/mẹ thử lại nhé!";
    els.gateInput.select();
  }
});

function openSettingsModal() {
  els.inputThreshold.value = String(settings.thresholdCm);
  els.badgeThreshold.textContent = `${settings.thresholdCm} cm`;

  els.inputGrace.value = String(settings.graceSeconds);
  els.badgeGrace.textContent = `${settings.graceSeconds.toFixed(1)}s`;

  els.toggleNoFace.checked = Boolean(settings.blockWhenNoFace);
  els.toggleVoice.checked = Boolean(settings.voiceEnabled);
  els.toggleSound.checked = Boolean(settings.soundEnabled);
  els.togglePip.checked = Boolean(settings.showCameraPip);

  els.calibStatus.textContent = `Hệ số hiện tại: ×${settings.calibrationFactor.toFixed(2)}`;

  // Populate daily stats
  const mins = Math.floor(stats.watchSeconds / 60);
  els.statWatchTime.textContent = mins > 0 ? `${mins} phút` : `${stats.watchSeconds}s`;
  els.statAlerts.textContent = `${stats.tooCloseCount} lần`;
  els.statAvgDist.textContent =
    stats.distanceCount > 0
      ? `${Math.round(stats.distanceSum / stats.distanceCount)} cm`
      : "-- cm";

  els.settingsModal.hidden = false;
}

els.btnCloseSettings.addEventListener("click", () => {
  els.settingsModal.hidden = true;
});

els.inputThreshold.addEventListener("input", () => {
  settings.thresholdCm = Number(els.inputThreshold.value);
  els.badgeThreshold.textContent = `${settings.thresholdCm} cm`;
  tracker.configure(settings);
  saveSettings(settings);
});

els.inputGrace.addEventListener("input", () => {
  settings.graceSeconds = Number(els.inputGrace.value);
  els.badgeGrace.textContent = `${settings.graceSeconds.toFixed(1)}s`;
  tracker.configure(settings);
  saveSettings(settings);
});

els.toggleNoFace.addEventListener("change", () => {
  settings.blockWhenNoFace = els.toggleNoFace.checked;
  tracker.configure(settings);
  saveSettings(settings);
});

els.toggleVoice.addEventListener("change", () => {
  settings.voiceEnabled = els.toggleVoice.checked;
  saveSettings(settings);
});

els.toggleSound.addEventListener("change", () => {
  settings.soundEnabled = els.toggleSound.checked;
  saveSettings(settings);
});

els.togglePip.addEventListener("change", () => {
  settings.showCameraPip = els.togglePip.checked;
  updatePipVisibility();
  saveSettings(settings);
});

els.btnCalibrate40.addEventListener("click", () => {
  if (!tracker.running || !tracker.faceDetected) {
    els.calibStatus.textContent = "Hãy bật Camera và ngồi cách màn hình ~40 cm trước!";
    return;
  }
  const factor = tracker.calibrateAt(40);
  if (factor !== null) {
    settings.calibrationFactor = factor;
    saveSettings(settings);
    els.calibStatus.textContent = `Đã chuẩn hóa ở 40 cm (×${factor.toFixed(2)})`;
  }
});

els.btnResetCalib.addEventListener("click", () => {
  settings.calibrationFactor = 1.0;
  tracker.configure(settings);
  saveSettings(settings);
  els.calibStatus.textContent = "Đã khôi phục mặc định (×1.00)";
});

els.btnToggleCamInSettings.addEventListener("click", async () => {
  if (tracker.running) {
    tracker.stopCamera();
  } else {
    els.settingsModal.hidden = true;
    await startCameraGuard();
  }
});

els.btnOpenSimInSettings.addEventListener("click", () => {
  els.settingsModal.hidden = true;
  els.simRange.value = "45";
  els.simValue.textContent = "45 cm";
  tracker.startSimulation(45);
});

els.btnResetVideos.addEventListener("click", () => {
  videos = [...STARTER_VIDEOS];
  saveVideos(videos);
  renderVideoShelf();
});

// Close modals on Escape or backdrop click
for (const backdrop of [els.gateModal, els.settingsModal, els.guideModal]) {
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) backdrop.hidden = true;
  });
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    els.gateModal.hidden = true;
    els.settingsModal.hidden = true;
    els.guideModal.hidden = true;
  }
});

// Initial Render & PWA Service Worker Registration
renderVideoShelf();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
