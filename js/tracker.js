/**
 * ScreenGap — On-Device Face Distance Tracker (MediaPipe FaceLandmarker)
 * Runs 100% locally in WebAssembly/WebGL on iPad Safari. No video leaves the device.
 */

const MEDIAPIPE_ESM_URLS = [
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/vision_bundle.mjs",
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/vision_bundle.mjs",
];
const MEDIAPIPE_WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm";
const MODEL_ASSET_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

// Child-calibrated anatomical constants (cm)
const CHILD_IPD_CM = 5.65; // Inter-iris distance (landmarks 468 <-> 473)
const HUMAN_IRIS_CM = 1.17; // Horizontal iris diameter (invariant from age ~4+)
const HYSTERESIS_SAFE_BUFFER_CM = 3; // Extra cm required to clear warning smoothly
const DETECTION_INTERVAL_MS = 85; // ~12 FPS for cool, battery-friendly iPad operation

export class DistanceTracker {
  constructor({ videoEl, canvasEl, onUpdate, onStatusChange }) {
    this.videoEl = videoEl;
    this.canvasEl = canvasEl;
    this.ctx = canvasEl ? canvasEl.getContext("2d") : null;
    this.onUpdate = onUpdate;
    this.onStatusChange = onStatusChange;

    this.landmarker = null;
    this.stream = null;
    this.running = false;
    this.simulating = false;
    this.simulatedCm = 45;

    this.rawDistanceCm = null;
    this.smoothedDistanceCm = null;
    this.faceDetected = false;

    // Settings synced from storage
    this.thresholdCm = 35;
    this.graceSeconds = 1.2;
    this.calibrationFactor = 1.0;
    this.blockWhenNoFace = false;

    // State machine timers
    this.isBlocked = false;
    this.blockReason = null; // "too_close" | "no_face" | null
    this.tooCloseSince = null;
    this.safeSince = null;
    this.noFaceSince = null;

    this._rafId = null;
    this._lastDetectTime = 0;
    this._lastVideoTime = -1;
  }

  configure(settings) {
    this.thresholdCm = Number(settings.thresholdCm) || 35;
    this.graceSeconds = Number(settings.graceSeconds) || 1.2;
    this.calibrationFactor = Number(settings.calibrationFactor) || 1.0;
    this.blockWhenNoFace = Boolean(settings.blockWhenNoFace);
  }

  async initModel() {
    if (this.landmarker) return;
    this._emitStatus("loading_model", "Đang tải mô hình AI nhận diện khuôn mặt...");

    let mpModule = null;
    let lastErr = null;
    for (const url of MEDIAPIPE_ESM_URLS) {
      try {
        mpModule = await import(url);
        break;
      } catch (err) {
        lastErr = err;
      }
    }
    if (!mpModule) {
      throw lastErr || new Error("Không thể tải thư viện MediaPipe Vision.");
    }

    const { FilesetResolver, FaceLandmarker } = mpModule;
    const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_URL);

    try {
      this.landmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: MODEL_ASSET_URL,
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numFaces: 1,
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: false,
      });
    } catch {
      // Fallback to CPU delegate for older iPad WebGL contexts
      this.landmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: MODEL_ASSET_URL,
          delegate: "CPU",
        },
        runningMode: "VIDEO",
        numFaces: 1,
      });
    }
  }

  async startCamera() {
    this.stopSimulation();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error(
        "Trình duyệt chưa cấp quyền Camera (cần mở qua HTTPS hoặc localhost trên Safari)."
      );
    }

    await this.initModel();
    this._emitStatus("requesting_camera", "Đang mở camera trước...");

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: "user",
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: 15, max: 24 },
      },
    });

    this.stream = stream;
    this.videoEl.srcObject = stream;
    this.videoEl.setAttribute("playsinline", "");
    this.videoEl.muted = true;
    await this.videoEl.play();

    this.running = true;
    this._resetTimers();
    this._emitStatus("active", "Đang bảo vệ mắt");
    this._loop();
  }

  stopCamera() {
    this.running = false;
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        track.stop();
      }
      this.stream = null;
    }
    if (this.videoEl) {
      this.videoEl.srcObject = null;
    }
    this._clearCanvas();
    this.isBlocked = false;
    this.blockReason = null;
    this._emitStatus("stopped", "Đã tắt camera");
  }

  startSimulation(initialCm = 45) {
    this.stopCamera();
    this.simulating = true;
    this.simulatedCm = initialCm;
    this._resetTimers();
    this._emitStatus("simulating", "Chế độ giả lập thử nghiệm");
    this._loopSimulation();
  }

  setSimulatedDistance(cm) {
    this.simulatedCm = Number(cm);
  }

  stopSimulation() {
    this.simulating = false;
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  /**
   * Calibrates current unscaled measurement to match targetCm (default 40 cm)
   */
  calibrateAt(targetCm = 40) {
    if (!this.rawDistanceCm || this.rawDistanceCm <= 5) {
      return null;
    }
    const factor = Math.max(0.45, Math.min(2.2, targetCm / this.rawDistanceCm));
    this.calibrationFactor = Number(factor.toFixed(3));
    this.smoothedDistanceCm = targetCm;
    return this.calibrationFactor;
  }

  _resetTimers() {
    this.tooCloseSince = null;
    this.safeSince = null;
    this.noFaceSince = null;
    this.isBlocked = false;
    this.blockReason = null;
  }

  _loop() {
    if (!this.running) return;
    const now = performance.now();

    if (
      now - this._lastDetectTime >= DETECTION_INTERVAL_MS &&
      this.videoEl.readyState >= 2
    ) {
      this._lastDetectTime = now;
      this._processVideoFrame(now);
    }

    this._rafId = requestAnimationFrame(() => this._loop());
  }

  _loopSimulation() {
    if (!this.simulating) return;
    const now = performance.now();
    if (now - this._lastDetectTime >= 100) {
      this._lastDetectTime = now;
      this.faceDetected = true;
      this.rawDistanceCm = this.simulatedCm;
      this.smoothedDistanceCm = this.simulatedCm;
      this._evaluatePostureState(now);
    }
    this._rafId = requestAnimationFrame(() => this._loopSimulation());
  }

  _processVideoFrame(timestampMs) {
    if (!this.landmarker) return;
    if (this.videoEl.currentTime === this._lastVideoTime) return;
    this._lastVideoTime = this.videoEl.currentTime;

    let result;
    try {
      result = this.landmarker.detectForVideo(this.videoEl, timestampMs);
    } catch {
      return;
    }

    const vw = this.videoEl.videoWidth || 640;
    const vh = this.videoEl.videoHeight || 480;

    if (this.canvasEl && (this.canvasEl.width !== vw || this.canvasEl.height !== vh)) {
      this.canvasEl.width = vw;
      this.canvasEl.height = vh;
    }

    const faces = result && result.faceLandmarks;
    if (!faces || faces.length === 0) {
      this.faceDetected = false;
      this._clearCanvas();
      this._evaluatePostureState(timestampMs);
      return;
    }

    const lm = faces[0];
    this.faceDetected = true;

    const rawCm = this._estimateRawDistanceCm(lm, vw, vh);
    if (rawCm !== null) {
      this.rawDistanceCm = rawCm;
      const calibrated = rawCm * this.calibrationFactor;
      if (this.smoothedDistanceCm === null) {
        this.smoothedDistanceCm = calibrated;
      } else {
        // Exponential moving average for smooth, jitter-free cm display
        this.smoothedDistanceCm = this.smoothedDistanceCm * 0.72 + calibrated * 0.28;
      }
    }

    this._drawEyeOverlay(lm, vw, vh);
    this._evaluatePostureState(timestampMs);
  }

  /**
   * Computes uncalibrated distance (cm) using 3D-compensated Inter-Iris span + Iris diameter
   */
  _estimateRawDistanceCm(lm, vw, vh) {
    // Focal length in pixels along the long camera sensor axis (~60 deg FOV default)
    const longEdge = Math.max(vw, vh);
    const focalPx = longEdge * 0.866;

    // 1. Inter-iris distance (468: left iris center, 473: right iris center; fallback 33 & 263)
    const leftEye = lm[468] || lm[33];
    const rightEye = lm[473] || lm[263];
    if (!leftEye || !rightEye) return null;

    const dxPx = (leftEye.x - rightEye.x) * vw;
    const dyPx = (leftEye.y - rightEye.y) * vh;
    const dzPx = ((leftEye.z || 0) - (rightEye.z || 0)) * vw;
    const ipdPx = Math.hypot(dxPx, dyPx, dzPx * 0.65);

    if (ipdPx < 6) return null;
    const distFromIpd = (focalPx * CHILD_IPD_CM) / ipdPx;

    // 2. Horizontal iris diameter (landmarks 469-471 and 474-476) if present
    let distFromIris = null;
    if (lm[469] && lm[471] && lm[474] && lm[476]) {
      const leftIrisPx = Math.hypot(
        (lm[469].x - lm[471].x) * vw,
        (lm[469].y - lm[471].y) * vh
      );
      const rightIrisPx = Math.hypot(
        (lm[474].x - lm[476].x) * vw,
        (lm[474].y - lm[476].y) * vh
      );
      const maxIrisPx = Math.max(leftIrisPx, rightIrisPx);
      if (maxIrisPx > 3) {
        distFromIris = (focalPx * HUMAN_IRIS_CM) / maxIrisPx;
      }
    }

    const combined =
      distFromIris !== null
        ? distFromIpd * 0.72 + distFromIris * 0.28
        : distFromIpd;

    return Math.max(10, Math.min(130, combined));
  }

  _evaluatePostureState(nowMs) {
    const dist = this.smoothedDistanceCm !== null ? Math.round(this.smoothedDistanceCm) : null;
    const graceMs = this.graceSeconds * 1000;
    const safeResumeCm = this.thresholdCm + HYSTERESIS_SAFE_BUFFER_CM;

    let prevBlocked = this.isBlocked;
    let prevReason = this.blockReason;

    if (!this.faceDetected) {
      this.tooCloseSince = null;
      this.safeSince = null;

      if (this.blockWhenNoFace) {
        if (!this.noFaceSince) this.noFaceSince = nowMs;
        // Give 3.5 seconds before blocking when no face is seen
        if (nowMs - this.noFaceSince >= 3500) {
          this.isBlocked = true;
          this.blockReason = "no_face";
        }
      } else if (this.isBlocked && this.blockReason === "no_face") {
        this.isBlocked = false;
        this.blockReason = null;
      }
    } else {
      this.noFaceSince = null;

      if (this.isBlocked && this.blockReason === "no_face") {
        // Face returned — clear no_face block if distance is safe
        if (dist !== null && dist >= this.thresholdCm) {
          this.isBlocked = false;
          this.blockReason = null;
        } else {
          this.blockReason = "too_close";
        }
      }

      if (dist !== null) {
        if (!this.isBlocked) {
          if (dist < this.thresholdCm) {
            if (!this.tooCloseSince) this.tooCloseSince = nowMs;
            if (nowMs - this.tooCloseSince >= graceMs) {
              this.isBlocked = true;
              this.blockReason = "too_close";
              this.safeSince = null;
            }
          } else {
            this.tooCloseSince = null;
          }
        } else if (this.blockReason === "too_close") {
          if (dist >= safeResumeCm) {
            if (!this.safeSince) this.safeSince = nowMs;
            // Resume after holding safe posture for 0.75s
            if (nowMs - this.safeSince >= 750) {
              this.isBlocked = false;
              this.blockReason = null;
              this.tooCloseSince = null;
            }
          } else {
            this.safeSince = null;
          }
        }
      }
    }

    let zone = "idle";
    if (!this.faceDetected) {
      zone = this.isBlocked ? "danger" : "warn";
    } else if (dist !== null) {
      if (this.isBlocked || dist < this.thresholdCm) {
        zone = "danger";
      } else if (dist < this.thresholdCm + 6) {
        zone = "warn";
      } else {
        zone = "safe";
      }
    }

    const stateChanged =
      prevBlocked !== this.isBlocked || prevReason !== this.blockReason;

    if (this.onUpdate) {
      this.onUpdate({
        distanceCm: dist,
        faceDetected: this.faceDetected,
        isBlocked: this.isBlocked,
        blockReason: this.blockReason,
        thresholdCm: this.thresholdCm,
        safeResumeCm,
        zone,
        stateChanged,
        simulating: this.simulating,
      });
    }
  }

  _drawEyeOverlay(lm, vw, vh) {
    if (!this.ctx) return;
    this.ctx.clearRect(0, 0, vw, vh);

    const leftEye = lm[468] || lm[33];
    const rightEye = lm[473] || lm[263];
    if (!leftEye || !rightEye) return;

    const isClose =
      this.smoothedDistanceCm !== null && this.smoothedDistanceCm < this.thresholdCm;
    const strokeColor = isClose ? "#ff5a47" : "#2fd687";

    const lx = leftEye.x * vw;
    const ly = leftEye.y * vh;
    const rx = rightEye.x * vw;
    const ry = rightEye.y * vh;

    this.ctx.save();
    this.ctx.strokeStyle = strokeColor;
    this.ctx.lineWidth = 2.5;
    this.ctx.setLineDash([4, 4]);
    this.ctx.beginPath();
    this.ctx.moveTo(lx, ly);
    this.ctx.lineTo(rx, ry);
    this.ctx.stroke();

    this.ctx.setLineDash([]);
    this.ctx.fillStyle = strokeColor;
    for (const [x, y] of [
      [lx, ly],
      [rx, ry],
    ]) {
      this.ctx.beginPath();
      this.ctx.arc(x, y, 5, 0, Math.PI * 2);
      this.ctx.fill();
    }
    this.ctx.restore();
  }

  _clearCanvas() {
    if (this.ctx && this.canvasEl) {
      this.ctx.clearRect(0, 0, this.canvasEl.width, this.canvasEl.height);
    }
  }

  _emitStatus(code, message) {
    if (this.onStatusChange) {
      this.onStatusChange({ code, message });
    }
  }
}
