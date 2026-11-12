/**
 * ScreenGap — Web Audio Chimes & Vietnamese Voice Reminder (iPad Safari compatible)
 */

export class AudioFeedback {
  constructor() {
    this.ctx = null;
    this.unlocked = false;
    this.lastVoiceAt = 0;
  }

  /**
   * Must be called inside a user tap/click handler on iPadOS to unlock AudioContext & SpeechSynthesis
   */
  unlock() {
    if (this.unlocked) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx && !this.ctx) {
        this.ctx = new AudioCtx();
      }
      if (this.ctx && this.ctx.state === "suspended") {
        this.ctx.resume();
      }
      if ("speechSynthesis" in window) {
        const silent = new SpeechSynthesisUtterance("");
        silent.volume = 0;
        window.speechSynthesis.speak(silent);
      }
      this.unlocked = true;
    } catch {
      // Non-fatal if browser blocks audio before interaction
    }
  }

  playAlertChime() {
    this._playNotes([
      { freq: 587.33, start: 0, dur: 0.14 },   // D5
      { freq: 440.0, start: 0.15, dur: 0.22 }, // A4
    ]);
  }

  playSafeResumeChime() {
    this._playNotes([
      { freq: 523.25, start: 0, dur: 0.11 },   // C5
      { freq: 659.25, start: 0.11, dur: 0.18 }, // E5
    ]);
  }

  _playNotes(notes) {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      if (!this.ctx) this.ctx = new AudioCtx();
      if (this.ctx.state === "suspended") {
        this.ctx.resume();
      }

      const now = this.ctx.currentTime;
      for (const n of notes) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(n.freq, now + n.start);

        gain.gain.setValueAtTime(0.001, now + n.start);
        gain.gain.exponentialRampToValueAtTime(0.18, now + n.start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + n.start + n.dur);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now + n.start);
        osc.stop(now + n.start + n.dur + 0.02);
      }
    } catch {
      // Ignore audio errors
    }
  }

  speakVietnameseReminder(reason = "too_close") {
    if (!("speechSynthesis" in window)) return;
    const now = Date.now();
    // Cooldown of 6 seconds so voice does not repeat annoyingly
    if (now - this.lastVoiceAt < 6000) return;
    this.lastVoiceAt = now;

    try {
      window.speechSynthesis.cancel();
      const text =
        reason === "no_face"
          ? "Con đừng che camera nhé, hãy ngồi ngay ngắn trước màn hình nào."
          : "Ôi gần quá rồi! Con ngồi lùi ra xa màn hình một chút để bảo vệ mắt nhé.";

      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = "vi-VN";
      utter.rate = 0.98;
      utter.pitch = 1.05;

      const voices = window.speechSynthesis.getVoices();
      const viVoice = voices.find((v) => v.lang && v.lang.toLowerCase().startsWith("vi"));
      if (viVoice) utter.voice = viVoice;

      window.speechSynthesis.speak(utter);
    } catch {
      // Ignore speech synthesis errors
    }
  }
}
