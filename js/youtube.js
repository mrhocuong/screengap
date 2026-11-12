/**
 * ScreenGap — YouTube IFrame Player Controller (iPadOS inline-safe)
 */

export function parseYouTubeInput(rawInput) {
  if (!rawInput) return null;
  const input = rawInput.trim();

  // Bare 11-char video ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(input)) {
    return { videoId: input, listId: null };
  }

  try {
    const withProto = /^https?:\/\//i.test(input) ? input : `https://${input}`;
    const url = new URL(withProto);
    const host = url.hostname.replace(/^www\.|^m\./i, "").toLowerCase();

    if (host === "youtu.be") {
      const id = url.pathname.split("/").filter(Boolean)[0];
      const listId = url.searchParams.get("list");
      if (id && /^[a-zA-Z0-9_-]{11}$/.test(id)) {
        return { videoId: id, listId };
      }
    }

    if (host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")) {
      const v = url.searchParams.get("v");
      const listId = url.searchParams.get("list");

      if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) {
        return { videoId: v, listId };
      }

      const parts = url.pathname.split("/").filter(Boolean);
      if (
        (parts[0] === "shorts" || parts[0] === "embed" || parts[0] === "live") &&
        parts[1] &&
        /^[a-zA-Z0-9_-]{11}$/.test(parts[1])
      ) {
        return { videoId: parts[1], listId };
      }

      if (listId) {
        return { videoId: null, listId };
      }
    }
  } catch {
    // Fallback regex extraction
  }

  const match = input.match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([a-zA-Z0-9_-]{11})/);
  if (match) {
    return { videoId: match[1], listId: null };
  }

  return null;
}

export async function fetchYouTubeMetadata(videoId) {
  try {
    const endpoint = `https://noembed.com/embed?url=${encodeURIComponent(
      `https://www.youtube.com/watch?v=${videoId}`
    )}`;
    const res = await fetch(endpoint);
    if (!res.ok) throw new Error("Metadata fetch failed");
    const data = await res.json();
    return {
      title: data.title || `Video YouTube (${videoId})`,
      channel: data.author_name || "YouTube",
    };
  } catch {
    return {
      title: `Video YouTube (${videoId})`,
      channel: "Đã thêm từ liên kết",
    };
  }
}

export class YouTubeController {
  constructor({ mountId, initialVideoId, onPlayStateChange }) {
    this.mountId = mountId;
    this.currentVideoId = initialVideoId;
    this.onPlayStateChange = onPlayStateChange;

    this.player = null;
    this.ready = false;
    this.guardActive = false;
    this.pausedByGuard = false;
  }

  init() {
    if (window.YT && window.YT.Player) {
      this._createPlayer();
      return;
    }

    const prevCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof prevCallback === "function") prevCallback();
      this._createPlayer();
    };

    if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      tag.async = true;
      document.head.appendChild(tag);
    }
  }

  _createPlayer() {
    const playerVars = {
      playsinline: 1, // Essential on iPadOS: prevents native fullscreen from hiding Distance Shield
      fs: 0, // Use ScreenGap's Cinema Mode instead of iOS native fullscreen
      rel: 0, // Restrict end-screen suggestions to same channel
      enablejsapi: 1,
      modestbranding: 1,
    };

    if (window.location.protocol.startsWith("http")) {
      playerVars.origin = window.location.origin;
    }

    this.player = new window.YT.Player(this.mountId, {
      width: "100%",
      height: "100%",
      videoId: this.currentVideoId,
      playerVars,
      events: {
        onReady: () => {
          this.ready = true;
        },
        onStateChange: (event) => {
          const state = event.data;
          // If child tries to play while blocked, immediately re-pause
          if (
            this.guardActive &&
            (state === window.YT.PlayerState.PLAYING ||
              state === window.YT.PlayerState.BUFFERING)
          ) {
            this.pausedByGuard = true;
            this.player.pauseVideo();
            return;
          }

          if (this.onPlayStateChange) {
            this.onPlayStateChange(this.isPlaying());
          }
        },
      },
    });
  }

  isPlaying() {
    if (!this.ready || !this.player || typeof this.player.getPlayerState !== "function") {
      return false;
    }
    const st = this.player.getPlayerState();
    return (
      st === window.YT.PlayerState.PLAYING ||
      st === window.YT.PlayerState.BUFFERING
    );
  }

  loadVideo({ videoId, listId }) {
    if (!this.ready || !this.player) return;
    this.pausedByGuard = false;

    if (listId && !videoId) {
      this.player.loadPlaylist({ list: listId, listType: "playlist" });
      return;
    }

    if (videoId) {
      this.currentVideoId = videoId;
      if (this.guardActive) {
        this.player.cueVideoById(videoId);
      } else {
        this.player.loadVideoById(videoId);
      }
    }
  }

  enforceGuard(shouldBlock) {
    this.guardActive = shouldBlock;
    if (!this.ready || !this.player) return;

    if (shouldBlock) {
      if (this.isPlaying()) {
        this.pausedByGuard = true;
        this.player.pauseVideo();
      }
    } else if (this.pausedByGuard) {
      this.pausedByGuard = false;
      this.player.playVideo();
    }
  }
}
