/**
 * ScreenGap — Persistent Settings, Video Library & Daily Posture Stats
 */

const SETTINGS_KEY = "screengap_settings_v1";
const VIDEOS_KEY = "screengap_videos_v1";
const STATS_KEY = "screengap_stats_v1";

export const DEFAULT_SETTINGS = {
  thresholdCm: 35,
  graceSeconds: 1.2,
  calibrationFactor: 1.0,
  blockWhenNoFace: false,
  voiceEnabled: true,
  soundEnabled: true,
  showCameraPip: true,
  cinemaMode: false,
};

export const STARTER_VIDEOS = [
  {
    id: "xaQJbozY_Is",
    title: "Khủng long thực sự trông như thế nào? — Kurzgesagt",
    channel: "Khoa học • Kurzgesagt",
  },
  {
    id: "nmh5ot2F6gM",
    title: "Những loài động vật kỳ thú — Super Animals Full Episode",
    channel: "Khám phá • Nat Geo Kids",
  },
  {
    id: "LAVt0sA36sc",
    title: "Phiêu lưu trong Khu rừng Số 10 — Học đếm vui nhộn",
    channel: "Toán tư duy • Numberblocks",
  },
  {
    id: "7CghDWUJRI0",
    title: "Khám phá Vườn Quốc gia Hoa Kỳ (4K) — Động vật hoang dã",
    channel: "Thiên nhiên • Nat Geo Kids",
  },
  {
    id: "JMbRCt8MAgQ",
    title: "Bài hát Hình học 2D vui nhộn cho bé",
    channel: "Toán tư duy • Numberblocks",
  },
];

function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage quota issues in private browsing
  }
}

export function loadVideos() {
  try {
    const raw = localStorage.getItem(VIDEOS_KEY);
    if (!raw) return [...STARTER_VIDEOS];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : [...STARTER_VIDEOS];
  } catch {
    return [...STARTER_VIDEOS];
  }
}

export function saveVideos(videos) {
  try {
    localStorage.setItem(VIDEOS_KEY, JSON.stringify(videos));
  } catch {
    // Ignore storage quota issues
  }
}

export function loadDailyStats() {
  const today = todayKey();
  const empty = {
    date: today,
    watchSeconds: 0,
    tooCloseCount: 0,
    distanceSum: 0,
    distanceCount: 0,
  };
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw);
    if (parsed.date !== today) return empty;
    return { ...empty, ...parsed };
  } catch {
    return empty;
  }
}

export function saveDailyStats(stats) {
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  } catch {
    // Ignore storage quota issues
  }
}
