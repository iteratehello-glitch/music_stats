/**
 * BitChord Pulse - "BitChord Wrapped" Story Experience (Apple Music Replay Luxury Theme)
 * Full-screen, multi-slide animated visual story with Crimson & Obsidian aesthetic,
 * progress bars, audio preview, and 1080x1920 downloadable PNG share card.
 */

import { PulseAnalytics } from "./analytics.js";
import { artEngine } from "./art-engine.js";
import { pulsePlayer } from "./player.js";

export class BitChordWrapped {
  constructor() {
    this.currentSlide = 0;
    this.totalSlides = 6;
    this.timer = null;
    this.slideDuration = 7000;
    this.isOpen = false;
    this.data = null;
  }

  open(masterState, filteredState) {
    this.data = this.prepareWrappedData(masterState, filteredState);
    this.isOpen = true;
    this.currentSlide = 0;
    this.renderModal();
    this.showSlide(0);
  }

  prepareWrappedData(masterState, filteredState) {
    const kpis = PulseAnalytics.computeHeroKPIs(filteredState);
    const hourly = PulseAnalytics.computeHourlyCircadian(filteredState);
    const artists = PulseAnalytics.computeArtistLeaderboard(filteredState, "primary");
    const songs = PulseAnalytics.computeSongsAndAlbums(filteredState);
    const cultural = PulseAnalytics.computeCulturalWorldsAndGraph(filteredState);

    const topArtist = artists.podium[0] || { name: "Unknown Artist", hours: "0", plays: 0, sharePercent: 0 };
    const topSong = songs.topSongs[0] || { title: "Unknown Song", artist: "Unknown Artist", ms: 0, plays: 0 };
    const topWorld = cultural.culturalDistribution[0] || { name: "Indian Melodies", percent: 100 };

    return {
      kpis,
      hourly,
      topArtist,
      topArtistsList: artists.leaderboard.slice(0, 5),
      topSong,
      topSongsList: songs.topSongs.slice(0, 5),
      topWorld,
      artMap: masterState.artMap || {},
      portraitMap: masterState.portraitMap || {},
      searchHistory: masterState.searchHistory || []
    };
  }

  renderModal() {
    let modal = document.getElementById("wrapped-modal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "wrapped-modal";
      modal.className = "modal-overlay";
      modal.style.zIndex = "3000";
      modal.style.background = "#09090B";
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <div style="position:relative; width:100%; max-width:440px; height:88vh; max-height:840px; background:rgba(18, 18, 24, 0.95); border:1px solid rgba(255,255,255,0.12); border-radius:28px; box-shadow:0 24px 60px rgba(0,0,0,0.9); overflow:hidden; display:flex; flex-direction:column;">
        
        <!-- Progress Bars Header -->
        <div style="display:flex; gap:5px; padding:16px 20px 8px; z-index:10;">
          ${Array.from({ length: this.totalSlides })
            .map((_, i) => `<div style="flex:1; height:3px; background:rgba(255,255,255,0.2); border-radius:2px; overflow:hidden;"><div id="story-bar-${i}" style="width:0%; height:100%; background:#FA243C;"></div></div>`)
            .join("")}
        </div>

        <!-- Top Header Info -->
        <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 20px; z-index:10;">
          <div style="display:flex; align-items:center; gap:8px; font-size:13px; font-weight:700; color:#fff;">
            <span style="color:#FA243C;">⚡</span>
            <span>MuStats • Replay '26</span>
          </div>
          <button id="wrapped-close-btn" style="background:transparent; border:none; color:#fff; font-size:18px; cursor:pointer;">✕</button>
        </div>

        <!-- Slides Viewport -->
        <div style="flex:1; position:relative; overflow:hidden;">
          
          <!-- Slide 0: Welcome Velocity -->
          <div class="story-slide" id="story-slide-0" style="position:absolute; inset:0; padding:32px 24px; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center;">
            <span style="font-size:11px; font-weight:700; letter-spacing:0.1em; color:#FA243C; text-transform:uppercase; margin-bottom:12px;">YOUR SOUND YEAR</span>
            <h1 style="font-size:34px; font-weight:800; line-height:1.15; margin-bottom:16px; color:#fff;">A Year of Infinite Rhythm.</h1>
            <p style="font-size:14px; color:rgba(255,255,255,0.6); line-height:1.5; margin-bottom:28px;">Here is how your listening defined 2026.</p>
            
            <div style="display:flex; gap:12px; margin-bottom:24px;">
              <div style="background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.08); border-radius:14px; padding:14px 18px; text-align:center;">
                <span style="font-size:26px; font-weight:800; color:#fff; display:block;">${this.data.kpis.hours}</span>
                <span style="font-size:11px; color:rgba(255,255,255,0.4);">Hours Listened</span>
              </div>
              <div style="background:rgba(250,36,60,0.12); border:1px solid #FA243C; border-radius:14px; padding:14px 18px; text-align:center;">
                <span style="font-size:26px; font-weight:800; color:#FA243C; display:block;">${this.data.kpis.totalPlays.toLocaleString()}</span>
                <span style="font-size:11px; color:rgba(255,255,255,0.4);">Total Plays</span>
              </div>
            </div>

            <div style="background:rgba(255,255,255,0.08); padding:8px 18px; border-radius:999px; font-size:12.5px; font-weight:600;">
              🔥 ${this.data.kpis.longestStreak} Days Active Streak
            </div>
          </div>

          <!-- Slide 1: Circadian Chronotype -->
          <div class="story-slide" id="story-slide-1" style="position:absolute; inset:0; padding:32px 24px; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center;">
            <span style="font-size:11px; font-weight:700; letter-spacing:0.1em; color:#FA243C; text-transform:uppercase; margin-bottom:12px;">CIRCADIAN RHYTHM</span>
            <div style="font-size:48px; margin-bottom:12px;">🌙</div>
            <h2 style="font-size:28px; font-weight:800; color:#fff; margin-bottom:12px;">${this.data.hourly.chronotype}</h2>
            <p style="font-size:14px; color:rgba(255,255,255,0.6); max-width:320px; line-height:1.5;">Your listening peaks at ${this.data.hourly.peakHourFormatted}.</p>
          </div>

          <!-- Slide 2: Cultural Spectrum -->
          <div class="story-slide" id="story-slide-2" style="position:absolute; inset:0; padding:32px 24px; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center;">
            <span style="font-size:11px; font-weight:700; letter-spacing:0.1em; color:#FA243C; text-transform:uppercase; margin-bottom:12px;">SONIC HORIZONS</span>
            <h2 style="font-size:28px; font-weight:800; color:#fff; margin-bottom:20px;">Dominant Universe</h2>
            
            <div style="width:100%; max-width:320px; background:rgba(250,36,60,0.1); border:1px solid #FA243C; border-radius:18px; padding:24px; text-align:center;">
              <span style="font-size:11px; font-weight:700; color:#FA243C; text-transform:uppercase; letter-spacing:0.08em;">Top Culture</span>
              <h3 style="font-size:22px; font-weight:700; color:#fff; margin:8px 0 16px;">${this.data.topWorld.name}</h3>
              <div style="width:100%; height:6px; background:rgba(255,255,255,0.1); border-radius:3px; overflow:hidden;">
                <div style="width:${this.data.topWorld.percent}%; height:100%; background:#FA243C;"></div>
              </div>
              <span style="font-size:12px; color:rgba(255,255,255,0.6); display:block; margin-top:8px;">${this.data.topWorld.percent}% of total listening</span>
            </div>
          </div>

          <!-- Slide 3: #1 Artist -->
          <div class="story-slide" id="story-slide-3" style="position:absolute; inset:0; padding:32px 24px; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center;">
            <span style="font-size:11px; font-weight:700; letter-spacing:0.1em; color:#FA243C; text-transform:uppercase; margin-bottom:12px;">YOUR #1 ARTIST</span>
            <div style="width:160px; height:160px; border-radius:50%; padding:4px; border:2px solid #FA243C; margin-bottom:20px; box-shadow:0 12px 36px rgba(250,36,60,0.4);">
              <img id="wrapped-top-artist-img" style="width:100%; height:100%; border-radius:50%; object-fit:cover;" src="" alt="" />
            </div>
            <h2 style="font-size:26px; font-weight:800; color:#fff; margin-bottom:8px;">${this.data.topArtist.name}</h2>
            <div style="font-size:14px; color:rgba(255,255,255,0.7);">
              <strong>${this.data.topArtist.hours}</strong> hours • <strong>${this.data.topArtist.plays}</strong> plays
            </div>
          </div>

          <!-- Slide 4: #1 Song -->
          <div class="story-slide" id="story-slide-4" style="position:absolute; inset:0; padding:32px 24px; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center;">
            <span style="font-size:11px; font-weight:700; letter-spacing:0.1em; color:#FA243C; text-transform:uppercase; margin-bottom:12px;">YOUR #1 ANTHEM</span>
            <div style="width:180px; height:180px; border-radius:18px; overflow:hidden; margin-bottom:20px; box-shadow:0 14px 40px rgba(0,0,0,0.8); border:1px solid rgba(255,255,255,0.1);">
              <img id="wrapped-top-song-art" style="width:100%; height:100%; object-fit:cover;" src="" alt="" />
            </div>
            <h2 style="font-size:20px; font-weight:800; color:#fff; margin-bottom:4px; max-width:300px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
              ${this.data.topSong.title}
            </h2>
            <p style="font-size:13.5px; color:rgba(255,255,255,0.6); margin-bottom:16px;">${this.data.topSong.artist}</p>
            <div style="font-size:13px; font-weight:600; color:#FA243C;">
              ${(this.data.topSong.ms / 3600000).toFixed(1)} Hours • ${this.data.topSong.plays} Plays
            </div>
          </div>

          <!-- Slide 5: Downloadable Share Card -->
          <div class="story-slide" id="story-slide-5" style="position:absolute; inset:0; padding:24px 20px; display:flex; flex-direction:column; justify-content:space-between; align-items:center;">
            <div id="wrapped-share-card" style="width:100%; background:linear-gradient(160deg, #18121E 0%, #09090B 100%); border:1px solid rgba(250,36,60,0.3); border-radius:20px; padding:22px 18px; box-shadow:0 16px 40px rgba(0,0,0,0.8);">
              <div style="display:flex; justify-content:space-between; font-size:10px; font-weight:800; letter-spacing:0.1em; color:#FA243C; margin-bottom:16px;">
                <span>MUSTATS</span>
                <span>REPLAY '26</span>
              </div>
              <div style="text-align:center; margin-bottom:18px;">
                <span style="font-size:48px; font-weight:800; color:#FA243C; line-height:1; display:block;">${this.data.kpis.hours}</span>
                <span style="font-size:11px; letter-spacing:0.1em; color:rgba(255,255,255,0.5);">HOURS LISTENED</span>
              </div>
              <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:16px; font-size:11.5px;">
                <div>
                  <span style="color:#FA243C; font-weight:700; font-size:10px; display:block; margin-bottom:6px;">TOP ARTISTS</span>
                  <ol style="padding-left:14px; color:rgba(255,255,255,0.8); line-height:1.6;">
                    ${this.data.topArtistsList.map(a => `<li>${a.name}</li>`).join("")}
                  </ol>
                </div>
                <div>
                  <span style="color:#FA243C; font-weight:700; font-size:10px; display:block; margin-bottom:6px;">TOP SONGS</span>
                  <ol style="padding-left:14px; color:rgba(255,255,255,0.8); line-height:1.6;">
                    ${this.data.topSongsList.map(s => `<li>${s.title}</li>`).join("")}
                  </ol>
                </div>
              </div>
              <div style="text-align:center; font-size:10px; color:rgba(255,255,255,0.35);">
                bitchord-pulse.github.io • Personal Observatory
              </div>
            </div>

            <button id="wrapped-download-png-btn" style="display:flex; align-items:center; gap:8px; background:#FA243C; color:#fff; border:none; font-size:13.5px; font-weight:600; padding:12px 24px; border-radius:999px; cursor:pointer;">
              <span>Download Share Card (.PNG)</span>
            </button>
          </div>
        </div>

        <!-- Left / Right Tap Zones -->
        <div id="story-tap-prev" style="position:absolute; top:60px; bottom:0; left:0; width:35%; z-index:5; cursor:pointer;"></div>
        <div id="story-tap-next" style="position:absolute; top:60px; bottom:0; right:0; width:35%; z-index:5; cursor:pointer;"></div>
      </div>
    `;

    this.enrichWrappedMedia();

    document.getElementById("wrapped-close-btn").onclick = () => this.close();
    document.getElementById("story-tap-prev").onclick = () => this.prevSlide();
    document.getElementById("story-tap-next").onclick = () => this.nextSlide();

    const downloadBtn = document.getElementById("wrapped-download-png-btn");
    if (downloadBtn) {
      downloadBtn.onclick = () => this.downloadShareCard();
    }
  }

  async enrichWrappedMedia() {
    const topSong = this.data.topSong;
    const topArtist = this.data.topArtist;

    const songImg = document.getElementById("wrapped-top-song-art");
    if (songImg && topSong) {
      songImg.src = artEngine.getTrackArtworkUrl(topSong, this.data.artMap);
    }

    const artistImg = document.getElementById("wrapped-top-artist-img");
    if (artistImg && topArtist) {
      const portrait = await artEngine.getArtistPortrait(
        topArtist.name,
        this.data.searchHistory,
        this.data.portraitMap,
        topArtist.topTracks || []
      );
      if (portrait) artistImg.src = portrait;
    }
  }

  showSlide(index) {
    if (index < 0) index = 0;
    if (index >= this.totalSlides) {
      this.close();
      return;
    }

    this.currentSlide = index;

    for (let i = 0; i < this.totalSlides; i++) {
      const slide = document.getElementById(`story-slide-${i}`);
      const barFill = document.getElementById(`story-bar-${i}`);

      if (slide) {
        slide.style.display = i === index ? "flex" : "none";
      }

      if (barFill) {
        barFill.style.transition = i === index ? `width ${this.slideDuration}ms linear` : "none";
        if (i < index) barFill.style.width = "100%";
        else if (i === index) barFill.style.width = "100%";
        else barFill.style.width = "0%";
      }
    }

    clearTimeout(this.timer);
    if (index < this.totalSlides - 1) {
      this.timer = setTimeout(() => this.nextSlide(), this.slideDuration);
    }
  }

  nextSlide() {
    this.showSlide(this.currentSlide + 1);
  }

  prevSlide() {
    this.showSlide(this.currentSlide - 1);
  }

  async downloadShareCard() {
    const cardEl = document.getElementById("wrapped-share-card");
    if (!cardEl || typeof html2canvas === "undefined") return;

    try {
      const canvas = await html2canvas(cardEl, {
        scale: 3,
        backgroundColor: "#09090B",
        useCORS: true,
        logging: false
      });
      const link = document.createElement("a");
      link.download = `bitchord-replay-2026-${Date.now()}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (e) {
      console.error("html2canvas error", e);
    }
  }

  close() {
    clearTimeout(this.timer);
    this.isOpen = false;
    const modal = document.getElementById("wrapped-modal");
    if (modal) modal.remove();
  }
}

export const bitChordWrapped = new BitChordWrapped();
