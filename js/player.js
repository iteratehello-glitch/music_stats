/**
 * BitChord Pulse - Built-In Audio Preview & Floating Player (Apple Music visionOS Capsule)
 * Provides 30-second audio previews (via iTunes API) with smooth progress and playback controls.
 */

export class AudioPreviewPlayer {
  constructor() {
    this.audio = new Audio();
    this.currentTrack = null;
    this.isPlaying = false;
    this.container = null;

    this.audio.addEventListener("timeupdate", () => this.onTimeUpdate());
    this.audio.addEventListener("ended", () => this.onEnded());
    this.audio.addEventListener("error", () => this.onError());
  }

  init() {
    this.container = document.getElementById("floating-player-bar");
    const playBtn = document.getElementById("player-play-btn");
    const closeBtn = document.getElementById("player-close-btn");

    if (playBtn) playBtn.onclick = () => this.togglePlay();
    if (closeBtn) closeBtn.onclick = () => this.close();
  }

  async playTrack(track, artUrl, previewUrl = null) {
    this.init();
    this.currentTrack = track;

    const titleEl = document.getElementById("player-title");
    const artistEl = document.getElementById("player-artist");
    const artEl = document.getElementById("player-art");

    if (titleEl) titleEl.textContent = track.title || "Unknown Title";
    if (artistEl) artistEl.textContent = track.artist || "Unknown Artist";
    if (artEl) artEl.src = artUrl || "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400";

    if (this.container) this.container.classList.remove("hidden");

    if (previewUrl) {
      this.audio.src = previewUrl;
      try {
        await this.audio.play();
        this.setPlayingState(true);
      } catch (e) {
        console.warn("Autoplay audio error", e);
        this.setPlayingState(false);
      }
    } else {
      // Direct YouTube fallback
      window.open(`https://www.youtube.com/watch?v=${track.id}`, "_blank");
    }
  }

  togglePlay() {
    if (this.isPlaying) {
      this.audio.pause();
      this.setPlayingState(false);
    } else {
      if (this.audio.src) {
        this.audio.play();
        this.setPlayingState(true);
      }
    }
  }

  setPlayingState(playing) {
    this.isPlaying = playing;
    const playBtn = document.getElementById("player-play-btn");
    if (playBtn) {
      playBtn.textContent = playing ? "⏸" : "▶";
    }
  }

  onTimeUpdate() {
    if (this.audio.duration) {
      const pct = (this.audio.currentTime / this.audio.duration) * 100;
      const progressEl = document.getElementById("player-progress");
      if (progressEl) progressEl.style.width = `${pct}%`;
    }
  }

  onEnded() {
    this.setPlayingState(false);
    const progressEl = document.getElementById("player-progress");
    if (progressEl) progressEl.style.width = "0%";
  }

  onError() {
    this.setPlayingState(false);
  }

  close() {
    this.audio.pause();
    this.audio.src = "";
    this.setPlayingState(false);
    if (this.container) this.container.classList.add("hidden");
  }
}

export const pulsePlayer = new AudioPreviewPlayer();
