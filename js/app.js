/**
 * BitChord Pulse - Apple Music "Liquid Glass" Master Application Controller
 * Features 3-Mode Master Switcher (All-Time | Monthly | Daily),
 * Vinyl Record Player with Animated Waveform EQ,
 * Dynamic Min-Max Normalized GitHub Contribution Heatmap with Glow Tiers & Legend,
 * Reactive Library Tab with Live Search, Sort, 4 Sub-Tabs & Cultural World Filters,
 * Artist Gravity Constellation Canvas, Song Loyalty vs. Binge Matrix,
 * and Song/Album Deep-Dive Dossier Modals.
 */

import { pulseDB } from "./db.js";
import { PulseAnalytics } from "./analytics.js";
import { artEngine } from "./art-engine.js";
import { pulsePlayer } from "./player.js";
import { bitChordWrapped } from "./wrapped.js";

class BitChordPulseApp {
  constructor() {
    this.masterState = null;
    this.currentTab = "listen-now";
    this.currentListenNowMode = "all-time"; // 'all-time' | 'monthly' | 'daily'
    this.currentTimeframe = "all";
    
    this.selectedMonth = "all";
    this.availableMonths = [];
    
    this.selectedDayDate = null;
    this.availableDays = [];
    this.dayHourlyMode = "projected"; // 'projected' | 'exact'

    this.monthMetric = "hours"; // 'hours' or 'plays'
    this.heatmapViewMode = "github"; // 'github' or 'month-cover'

    // Library Tab Reactive State
    this.activeLibraryTab = "all-songs"; // 'all-songs' | 'albums' | 'consistent' | 'skipped'
    this.librarySearchQuery = "";
    this.librarySortBy = "hours-desc";
    this.libraryGenreFilter = "all";

    this.charts = {};
    this.constellationAnimId = null;
  }

  async init() {
    this.attachEventListeners();
    await this.loadDatabase();
  }

  /**
   * Load data from IndexedDB
   */
  async loadDatabase() {
    try {
      this.masterState = await pulseDB.getMasterState();

      if (!this.masterState.tracks || this.masterState.tracks.length === 0) {
        this.renderEmptyState(true);
      } else {
        this.renderEmptyState(false);
        this.extractDatesAndMonths();
        this.renderApplication();
      }
    } catch (err) {
      console.error("Failed to load IndexedDB state:", err);
      this.showToast("Database Error", err.message, "error");
    }
  }

  extractDatesAndMonths() {
    const monthSet = new Set();
    const daySet = new Set();

    if (this.masterState.monthly) {
      this.masterState.monthly.forEach(m => {
        if (m.month) monthSet.add(m.month);
        if (m.days) {
          Object.keys(m.days).forEach(d => daySet.add(d));
        }
      });
    }

    if (this.masterState.tracks) {
      this.masterState.tracks.forEach(t => {
        if (t.days) {
          Object.keys(t.days).forEach(d => daySet.add(d));
        }
      });
    }

    this.availableMonths = Array.from(monthSet).sort();
    this.availableDays = Array.from(daySet).sort();

    if (this.availableMonths.length > 0 && (!this.selectedMonth || this.selectedMonth === "all")) {
      this.selectedMonth = this.availableMonths[this.availableMonths.length - 1];
    }

    if (this.availableDays.length > 0 && (!this.selectedDayDate || !this.availableDays.includes(this.selectedDayDate))) {
      this.selectedDayDate = this.availableDays[this.availableDays.length - 1];
    }
  }

  /**
   * Main render orchestrator
   */
  renderApplication() {
    if (!this.masterState || this.masterState.tracks.length === 0) return;

    const filteredGlobal = PulseAnalytics.filterState(
      this.masterState,
      this.currentTimeframe,
      false
    );

    this.renderHeaderAndStatus();
    this.renderTabListenNow(filteredGlobal);
    this.renderTabTimeRhythm();
    this.renderTabArtists(filteredGlobal);
    this.renderTabSongsAlbums(filteredGlobal);
    this.renderTabDnaRig(filteredGlobal);
  }

  renderHeaderAndStatus() {
    const watermarkText = this.masterState.watermark
      ? new Date(this.masterState.watermark).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit"
        })
      : "No Data";

    const sidebarWm = document.getElementById("sidebar-watermark-text");
    const headerSynced = document.getElementById("header-synced-pill");

    if (sidebarWm) sidebarWm.textContent = `Synced: ${watermarkText}`;
    if (headerSynced) headerSynced.textContent = `Synced: ${watermarkText}`;
  }

  /**
   * =========================================================================
   * TAB 1: Listen Now (3-Mode Master Switcher: All-Time | Monthly | Daily)
   * =========================================================================
   */
  renderTabListenNow(filteredGlobal) {
    this.setListenNowMode(this.currentListenNowMode);
  }

  setListenNowMode(mode) {
    this.currentListenNowMode = mode;
    document.querySelectorAll("#ln-master-mode-switcher .master-pill-btn").forEach(btn => {
      btn.classList.toggle("active", btn.getAttribute("data-mode") === mode);
    });

    const badge = document.getElementById("master-mode-meta-badge");
    const allTimePanel = document.getElementById("ln-view-alltime");
    const monthlyPanel = document.getElementById("ln-view-monthly");
    const dailyPanel = document.getElementById("ln-view-daily");

    if (mode === "all-time") {
      allTimePanel?.classList.remove("hidden");
      monthlyPanel?.classList.add("hidden");
      dailyPanel?.classList.add("hidden");

      if (badge && this.availableDays.length > 0) {
        const first = this.formatDateShort(this.availableDays[0]);
        const last = this.formatDateShort(this.availableDays[this.availableDays.length - 1]);
        badge.textContent = `All-Time Observatory • ${first} – ${last}`;
      }
      const filtered = PulseAnalytics.filterState(this.masterState, this.currentTimeframe, false);
      this.renderListenNowAllTime(filtered);

    } else if (mode === "monthly") {
      allTimePanel?.classList.add("hidden");
      monthlyPanel?.classList.remove("hidden");
      dailyPanel?.classList.add("hidden");

      if (badge) {
        badge.textContent = `Monthly Focus • ${this.formatMonthName(this.selectedMonth)}`;
      }
      this.renderListenNowMonthly();

    } else if (mode === "daily") {
      allTimePanel?.classList.add("hidden");
      monthlyPanel?.classList.add("hidden");
      dailyPanel?.classList.remove("hidden");

      if (badge && this.selectedDayDate) {
        badge.textContent = `Daily Breakdown • ${this.formatDateLong(this.selectedDayDate)}`;
      }
      this.renderListenNowDaily();
    }
  }

  /**
   * Mode A: All-Time View
   */
  renderListenNowAllTime(filtered) {
    const kpis = PulseAnalytics.computeHeroKPIs(filtered);
    const artists = PulseAnalytics.computeArtistLeaderboard(filtered, "primary");
    const songs = PulseAnalytics.computeSongsAndAlbums(filtered);
    const daily = PulseAnalytics.computeDailyActivity(filtered);
    const cultural = PulseAnalytics.computeCulturalWorldsAndGraph(filtered);
    const loyaltyBinge = PulseAnalytics.computeSongLoyaltyVsBinge(filtered);

    const topSong = songs.topSongs[0] || { title: "Unknown Song", artist: "Unknown Artist", ms: 0, plays: 0 };

    // 1. Vinyl Record Player Showcase Card
    const anthemTitle = document.getElementById("alltime-anthem-title");
    const anthemArtist = document.getElementById("alltime-anthem-artist");
    const anthemStats = document.getElementById("alltime-anthem-stats");
    const anthemArt = document.getElementById("alltime-vinyl-art");
    const playBtn = document.getElementById("alltime-vinyl-play-btn");
    const vinylDisc = document.getElementById("alltime-vinyl-disc");

    if (anthemTitle) anthemTitle.textContent = topSong.title;
    if (anthemArtist) anthemArtist.textContent = topSong.artist;
    if (anthemStats) anthemStats.textContent = `${(topSong.ms / 3600000).toFixed(1)} hrs • ${topSong.plays} plays`;

    if (anthemArt && topSong.id) {
      anthemArt.src = artEngine.getTrackArtworkUrl(topSong, this.masterState.artMap, hd => {
        anthemArt.src = hd;
      });
    }

    if (playBtn && topSong.id) {
      playBtn.onclick = e => {
        e.stopPropagation();
        const art = artEngine.getTrackArtworkUrl(topSong, this.masterState.artMap);
        const previewUrl = this.masterState.artMap[topSong.id]?.previewUrl || null;
        pulsePlayer.playTrack(topSong, art, previewUrl);
        if (vinylDisc) vinylDisc.classList.remove("paused");
      };
    }

    // 2. Bento 6-Stat Glass Strip
    const statHours = document.getElementById("stat-alltime-hours");
    const statMs = document.getElementById("stat-alltime-ms");
    const statPlays = document.getElementById("stat-alltime-plays");
    const statPartials = document.getElementById("stat-alltime-partials");
    const statTracks = document.getElementById("stat-alltime-tracks");
    const statAlbums = document.getElementById("stat-alltime-albums");
    const statArtists = document.getElementById("stat-alltime-artists");
    const statActiveDays = document.getElementById("stat-alltime-activedays");
    const statRatio = document.getElementById("stat-alltime-ratio");
    const statStreak = document.getElementById("stat-alltime-streak");
    const statLongest = document.getElementById("stat-alltime-longest");

    if (statHours) statHours.textContent = `${kpis.hours}h ${kpis.minutes}m`;
    if (statMs) statMs.textContent = `${(kpis.totalMs / 3600000).toFixed(1)} hours tracked`;
    if (statPlays) statPlays.textContent = kpis.totalPlays.toLocaleString();
    if (statPartials) statPartials.textContent = `${kpis.partialListens} skips`;
    if (statTracks) statTracks.textContent = kpis.uniqueTracks.toLocaleString();
    if (statAlbums) statAlbums.textContent = `${kpis.uniqueAlbums} albums`;
    if (statArtists) statArtists.textContent = `${kpis.uniqueArtists} creators`;
    if (statActiveDays) statActiveDays.textContent = `${kpis.activeDaysCount} / ${kpis.daysInRange}`;
    if (statRatio) statRatio.textContent = `${kpis.activeDaysRatio}% consistency`;
    if (statStreak) statStreak.textContent = `${kpis.currentStreak} Days`;
    if (statLongest) statLongest.textContent = `${kpis.longestStreak} record`;

    // 3. All-Time Growth Curve / Daily Horizon
    this.renderDailyTrendChart(daily);

    // 4. All-Time Top 3 Artists Podium
    const podiumEl = document.getElementById("alltime-artists-podium");
    if (podiumEl) {
      podiumEl.innerHTML = artists.podium.map((a, idx) => {
        const topTrackTitle = a.topTracks[0]?.title || "Top Anthem";
        return `
          <div class="glass-card podium-glass-card" data-artist-idx="${idx}">
            <img class="podium-portrait" data-artist-portrait="${encodeURIComponent(a.name)}" src="https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=200" alt="${a.name}" />
            <div class="podium-info">
              <span class="podium-rank-tag">#${idx + 1} ARTIST</span>
              <div class="podium-name">${a.name}</div>
              <div class="podium-metric">${a.hours} hrs • ${a.plays} plays</div>
              <span class="podium-top-chip" title="${topTrackTitle}">▶ ${topTrackTitle}</span>
            </div>
          </div>
        `;
      }).join("");

      artists.podium.forEach((a, idx) => {
        artEngine.getArtistPortrait(a.name, this.masterState.searchHistory, this.masterState.portraitMap, a.topTracks)
          .then(portrait => {
            const img = podiumEl.querySelector(`img[data-artist-portrait="${encodeURIComponent(a.name)}"]`);
            if (img && portrait) img.src = portrait;
          });
      });

      podiumEl.querySelectorAll(".podium-glass-card").forEach((card, idx) => {
        card.onclick = () => this.openArtistDrawer(artists.podium[idx]);
      });
    }

    // 5. On Repeat Top 5 Tracks List
    const repeatList = document.getElementById("on-repeat-tracks-list");
    if (repeatList) {
      repeatList.innerHTML = songs.topSongs.slice(0, 5).map(track => {
        const artUrl = artEngine.getTrackArtworkUrl(track, this.masterState.artMap);
        return `
          <div class="on-repeat-item" data-track-id="${track.id}">
            <img class="on-repeat-art" data-track-art="${track.id}" src="${artUrl}" alt="" />
            <div class="on-repeat-info">
              <div class="on-repeat-title">${track.title}</div>
              <div class="on-repeat-artist">${track.artist}</div>
            </div>
            <span class="on-repeat-playcount-pill">${track.plays} plays</span>
          </div>
        `;
      }).join("");

      repeatList.querySelectorAll(".on-repeat-item").forEach(item => {
        const trackId = item.getAttribute("data-track-id");
        const track = songs.topSongs.find(t => t.id === trackId);
        item.onclick = () => {
          if (track) this.openSongDeepDive(track);
        };
      });
    }

    // 6. Sonic Aura Radar / Mood Rose Chart
    this.renderSonicAuraRadar(cultural);

    // 7. Song Loyalty vs. Binge Matrix
    this.renderLoyaltyBingeMatrix(loyaltyBinge);
  }

  renderDailyTrendChart(dailyData) {
    const canvas = document.getElementById("chart-listen-now-daily");
    if (!canvas || typeof Chart === "undefined") return;

    if (this.charts.dailyTrend) this.charts.dailyTrend.destroy();

    const ctx = canvas.getContext("2d");
    const gradient = ctx.createLinearGradient(0, 0, 0, 260);
    gradient.addColorStop(0, "rgba(250, 36, 60, 0.35)");
    gradient.addColorStop(1, "rgba(250, 36, 60, 0.0)");

    const labels = dailyData.dailySeries.map(d => {
      const parts = d.date.split("-");
      return `${parts[1]}/${parts[2]}`;
    });
    const hours = dailyData.dailySeries.map(d => d.hours);

    this.charts.dailyTrend = new Chart(canvas, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            data: hours,
            borderColor: "#FA243C",
            backgroundColor: gradient,
            borderWidth: 2.5,
            tension: 0.36,
            fill: true,
            pointRadius: 3,
            pointBackgroundColor: "#FA243C",
            pointHoverRadius: 6,
            pointHoverBackgroundColor: "#FFFFFF"
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "rgba(18, 18, 24, 0.94)",
            borderColor: "rgba(255, 255, 255, 0.12)",
            borderWidth: 1,
            titleColor: "#FFFFFF",
            bodyColor: "rgba(255, 255, 255, 0.8)",
            cornerRadius: 10,
            displayColors: false,
            callbacks: {
              label: ctx => ` ${ctx.parsed.y} hrs listened`
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              color: "rgba(255, 255, 255, 0.35)",
              font: { family: "Inter", size: 10 },
              maxTicksLimit: 12
            }
          },
          y: {
            grid: { color: "rgba(255, 255, 255, 0.04)" },
            ticks: {
              color: "rgba(255, 255, 255, 0.35)",
              font: { family: "Inter", size: 10 },
              callback: v => `${v}h`
            }
          }
        }
      }
    });
  }

  renderSonicAuraRadar(culturalData) {
    const canvas = document.getElementById("chart-listen-now-sonic-radar");
    if (!canvas || typeof Chart === "undefined") return;

    if (this.charts.sonicRadar) this.charts.sonicRadar.destroy();

    const labels = culturalData.culturalDistribution.map(c => c.name.split(" ")[0]);
    const values = culturalData.culturalDistribution.map(c => c.percent);

    this.charts.sonicRadar = new Chart(canvas, {
      type: "radar",
      data: {
        labels,
        datasets: [
          {
            data: values,
            backgroundColor: "rgba(250, 36, 60, 0.25)",
            borderColor: "#FA243C",
            borderWidth: 2,
            pointBackgroundColor: "#FF5E7E",
            pointBorderColor: "#FFFFFF",
            pointHoverBackgroundColor: "#FFFFFF",
            pointHoverBorderColor: "#FA243C",
            pointRadius: 4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "rgba(18, 18, 24, 0.94)",
            borderColor: "rgba(255, 255, 255, 0.12)",
            borderWidth: 1,
            callbacks: {
              label: ctx => ` ${ctx.label}: ${ctx.parsed.r}%`
            }
          }
        },
        scales: {
          r: {
            grid: { color: "rgba(255, 255, 255, 0.06)" },
            angleLines: { color: "rgba(255, 255, 255, 0.08)" },
            pointLabels: {
              color: "rgba(255, 255, 255, 0.65)",
              font: { family: "Inter", size: 11, weight: "500" }
            },
            ticks: {
              display: false,
              backdropColor: "transparent"
            }
          }
        }
      }
    });
  }

  renderLoyaltyBingeMatrix(matrixData) {
    const ritualsEl = document.getElementById("loyalty-rituals-list");
    const obsessionsEl = document.getElementById("loyalty-obsessions-list");

    if (ritualsEl) {
      ritualsEl.innerHTML = matrixData.dailyRituals.map(t => {
        const art = artEngine.getTrackArtworkUrl(t, this.masterState.artMap);
        return `
          <div class="loyalty-item" data-track-id="${t.id}">
            <img class="loyalty-art" src="${art}" alt="" />
            <div class="loyalty-info">
              <div class="loyalty-title">${t.title}</div>
              <div class="loyalty-artist">${t.artist}</div>
            </div>
            <span class="loyalty-pill loyalty-pill-ritual">🌿 ${t.distinctDays} Days</span>
          </div>
        `;
      }).join("");

      ritualsEl.querySelectorAll(".loyalty-item").forEach(item => {
        const id = item.getAttribute("data-track-id");
        const track = matrixData.dailyRituals.find(x => x.id === id);
        item.onclick = () => { if (track) this.openSongDeepDive(track); };
      });
    }

    if (obsessionsEl) {
      obsessionsEl.innerHTML = matrixData.singleDayObsessions.map(t => {
        const art = artEngine.getTrackArtworkUrl(t, this.masterState.artMap);
        return `
          <div class="loyalty-item" data-track-id="${t.id}">
            <img class="loyalty-art" src="${art}" alt="" />
            <div class="loyalty-info">
              <div class="loyalty-title">${t.title}</div>
              <div class="loyalty-artist">${t.artist}</div>
            </div>
            <span class="loyalty-pill loyalty-pill-binge">⚡ ${t.bingePct}% in 1 Day</span>
          </div>
        `;
      }).join("");

      obsessionsEl.querySelectorAll(".loyalty-item").forEach(item => {
        const id = item.getAttribute("data-track-id");
        const track = matrixData.singleDayObsessions.find(x => x.id === id);
        item.onclick = () => { if (track) this.openSongDeepDive(track); };
      });
    }
  }

  /**
   * Mode B: Monthly Breakdown View
   */
  renderListenNowMonthly() {
    const strip = document.getElementById("ln-months-pill-strip");
    const indicator = document.getElementById("ln-month-indicator-pill");

    if (indicator) {
      indicator.textContent = this.formatMonthName(this.selectedMonth);
    }

    if (strip) {
      strip.innerHTML = this.availableMonths.map(m => {
        const isActive = this.selectedMonth === m ? "active" : "";
        const label = this.formatMonthShort(m);
        return `<button class="month-pill-btn ${isActive}" data-month="${m}">${label}</button>`;
      }).join("");

      strip.querySelectorAll(".month-pill-btn").forEach(btn => {
        btn.onclick = () => {
          this.selectedMonth = btn.getAttribute("data-month");
          this.renderListenNowMonthly();
        };
      });
    }

    const prevBtn = document.getElementById("btn-ln-month-prev");
    const nextBtn = document.getElementById("btn-ln-month-next");

    if (prevBtn) {
      prevBtn.onclick = () => {
        const idx = this.availableMonths.indexOf(this.selectedMonth);
        if (idx > 0) {
          this.selectedMonth = this.availableMonths[idx - 1];
          this.renderListenNowMonthly();
        }
      };
    }

    if (nextBtn) {
      nextBtn.onclick = () => {
        const idx = this.availableMonths.indexOf(this.selectedMonth);
        if (idx >= 0 && idx < this.availableMonths.length - 1) {
          this.selectedMonth = this.availableMonths[idx + 1];
          this.renderListenNowMonthly();
        }
      };
    }

    // Filter data for selected month
    const monthState = PulseAnalytics.filterState(this.masterState, this.selectedMonth, false);
    const monthKpis = PulseAnalytics.computeHeroKPIs(monthState);
    const monthArtists = PulseAnalytics.computeArtistLeaderboard(monthState, "primary");
    const monthSongs = PulseAnalytics.computeSongsAndAlbums(monthState);

    // Summary Hero Strip
    const hEl = document.getElementById("ln-ms-summary-hours");
    const sEl = document.getElementById("ln-ms-summary-split");
    const aEl = document.getElementById("ln-ms-summary-avghours");
    const pEl = document.getElementById("ln-ms-summary-plays");

    if (hEl) hEl.textContent = `${monthKpis.totalHoursFormatted} hrs`;
    if (sEl) sEl.textContent = `${monthKpis.hours}h tracked`;
    if (aEl) aEl.textContent = `${monthKpis.dailyAverageHours}h / day`;
    if (pEl) pEl.textContent = `${monthKpis.totalPlays} plays`;

    // #1 Artist & Song & Album
    const topArtist = monthArtists.podium[0] || { name: "Unknown", hours: 0, plays: 0 };
    const topSong = monthSongs.topSongs[0] || { title: "Unknown", artist: "Unknown", plays: 0 };
    const topAlbum = monthSongs.albumShowcase[0] || { album: "Unknown", primaryArtist: "Unknown", hours: 0 };

    const artistName = document.getElementById("ln-month-artist-name");
    const artistMeta = document.getElementById("ln-month-artist-meta");
    const artistImg = document.getElementById("ln-month-artist-img");

    if (artistName) artistName.textContent = topArtist.name;
    if (artistMeta) artistMeta.textContent = `${topArtist.hours} hrs • ${topArtist.plays} plays`;
    if (artistImg && topArtist.name) {
      artEngine.getArtistPortrait(topArtist.name, this.masterState.searchHistory, this.masterState.portraitMap, topArtist.topTracks)
        .then(portrait => { if (portrait) artistImg.src = portrait; });
    }

    const songTitle = document.getElementById("ln-month-song-title");
    const songMeta = document.getElementById("ln-month-song-meta");
    const songImg = document.getElementById("ln-month-song-img");
    const songPlay = document.getElementById("ln-month-song-play-btn");

    if (songTitle) songTitle.textContent = topSong.title;
    if (songMeta) songMeta.textContent = `${topSong.artist} • ${topSong.plays} plays`;
    if (songImg && topSong.id) {
      songImg.src = artEngine.getTrackArtworkUrl(topSong, this.masterState.artMap);
    }
    if (songPlay && topSong.id) {
      songPlay.onclick = e => {
        e.stopPropagation();
        const art = artEngine.getTrackArtworkUrl(topSong, this.masterState.artMap);
        const previewUrl = this.masterState.artMap[topSong.id]?.previewUrl || null;
        pulsePlayer.playTrack(topSong, art, previewUrl);
      };
    }

    const albumTitle = document.getElementById("ln-month-album-title");
    const albumMeta = document.getElementById("ln-month-album-meta");
    const albumImg = document.getElementById("ln-month-album-img");

    if (albumTitle) albumTitle.textContent = topAlbum.album;
    if (albumMeta) albumMeta.textContent = `${topAlbum.primaryArtist} • ${topAlbum.hours} hrs`;
    if (albumImg && topAlbum.id) {
      albumImg.src = artEngine.getTrackArtworkUrl(topAlbum, this.masterState.artMap);
    }

    // Day-by-Day Bar Chart
    this.renderMonthDaysChart(monthState);

    // Monthly Cover Art Calendar
    this.renderMonthCoverCalendar(monthState);

    // Top Songs Tracklist of this Month
    const songsList = document.getElementById("ln-month-top-songs-list");
    if (songsList) {
      const maxMs = monthSongs.topSongs[0]?.ms || 1;
      songsList.innerHTML = monthSongs.topSongs.slice(0, 15).map((track, idx) => {
        const art = artEngine.getTrackArtworkUrl(track, this.masterState.artMap);
        const totalMinutes = Math.round(track.ms / 60000);
        const sharePct = Math.min(100, Math.max(4, Math.round((track.ms / maxMs) * 100)));
        return `
          <div class="apple-track-row" data-track-id="${track.id}">
            <span class="track-col-rank">${idx + 1}</span>
            <div class="track-art-box">
              <img src="${art}" alt="" />
              <div class="track-hover-play">▶</div>
            </div>
            <div class="track-col-title-artist">
              <div class="track-row-title">${track.title}</div>
              <div class="track-row-artist">${track.artist}</div>
            </div>
            <div class="track-col-album">${track.album || "Single"}</div>
            <div class="track-col-plays-time">
              <span class="track-plays-text">${track.plays} plays • ${totalMinutes}m</span>
              <div class="track-share-bar-bg">
                <div class="track-share-bar-fill" style="width:${sharePct}%"></div>
              </div>
            </div>
          </div>
        `;
      }).join("");

      songsList.querySelectorAll(".apple-track-row").forEach(row => {
        const id = row.getAttribute("data-track-id");
        const track = monthSongs.topSongs.find(t => t.id === id);
        row.onclick = () => { if (track) this.openSongDeepDive(track); };
      });
    }
  }

  renderMonthDaysChart(monthState) {
    const canvas = document.getElementById("chart-ln-monthly-days");
    if (!canvas || typeof Chart === "undefined") return;

    if (this.charts.monthDays) this.charts.monthDays.destroy();

    const [yearStr, mStr] = this.selectedMonth.split("-");
    const year = parseInt(yearStr, 10);
    const month = parseInt(mStr, 10) - 1;
    const totalDays = new Date(year, month + 1, 0).getDate();

    const labels = [];
    const hoursData = [];
    const dateStrings = [];

    for (let d = 1; d <= totalDays; d++) {
      const dateStr = `${yearStr}-${mStr.padStart(2, "0")}-${d.toString().padStart(2, "0")}`;
      labels.push(`${d}`);
      dateStrings.push(dateStr);
      const dayData = monthState.dates[dateStr];
      hoursData.push(dayData ? parseFloat((dayData.ms / 3600000).toFixed(2)) : 0);
    }

    this.charts.monthDays = new Chart(canvas, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            data: hoursData,
            backgroundColor: "rgba(250, 36, 60, 0.8)",
            hoverBackgroundColor: "#FF6B81",
            borderRadius: 6,
            barThickness: "flex"
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        onClick: (event, elements) => {
          if (elements.length > 0) {
            const index = elements[0].index;
            const clickedDate = dateStrings[index];
            this.selectedDayDate = clickedDate;
            this.setListenNowMode("daily");
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "rgba(18, 18, 24, 0.94)",
            borderColor: "rgba(255, 255, 255, 0.12)",
            borderWidth: 1,
            callbacks: {
              title: items => `Date: ${dateStrings[items[0].index]}`,
              label: ctx => ` ${ctx.parsed.y} hrs (Click to open Day View)`
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: "rgba(255, 255, 255, 0.4)", font: { family: "Inter", size: 10 } }
          },
          y: {
            grid: { color: "rgba(255, 255, 255, 0.04)" },
            ticks: {
              color: "rgba(255, 255, 255, 0.4)",
              font: { family: "Inter", size: 10 },
              callback: v => `${v}h`
            }
          }
        }
      }
    });
  }

  renderMonthCoverCalendar(monthState) {
    const grid = document.getElementById("ln-cal-month-days-grid");
    if (!grid) return;

    const [yearStr, mStr] = this.selectedMonth.split("-");
    const year = parseInt(yearStr, 10);
    const month = parseInt(mStr, 10) - 1;

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const totalDays = lastDay.getDate();
    const startDayOfWeek = (firstDay.getDay() + 6) % 7; // Mon=0, Sun=6

    let html = "";
    for (let i = 0; i < startDayOfWeek; i++) {
      html += `<div class="month-cover-cell empty-day"></div>`;
    }

    for (let day = 1; day <= totalDays; day++) {
      const dateStr = `${yearStr}-${mStr.padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
      const dayData = monthState.dates[dateStr];
      const isSelected = dateStr === this.selectedDayDate ? "selected" : "";

      if (dayData && dayData.ms > 0) {
        const topTrack = [...dayData.tracks].sort((a, b) => b.ms - a.ms)[0];
        const artUrl = artEngine.getTrackArtworkUrl(topTrack, this.masterState.artMap);
        const mins = Math.round(dayData.ms / 60000);

        html += `
          <div class="month-cover-cell ${isSelected}" data-date="${dateStr}" title="${dateStr}: ${mins}m (${dayData.plays}p) - Click to inspect day">
            <img class="month-cell-bg-art" src="${artUrl}" alt="" />
            <span class="month-cell-day-num">${day}</span>
            <span class="month-cell-min-badge">${mins}m</span>
          </div>
        `;
      } else {
        html += `
          <div class="month-cover-cell ${isSelected}" data-date="${dateStr}">
            <span class="month-cell-day-num" style="background:transparent; color:rgba(255,255,255,0.4);">${day}</span>
          </div>
        `;
      }
    }

    grid.innerHTML = html;

    grid.querySelectorAll(".month-cover-cell[data-date]").forEach(cell => {
      cell.onclick = () => {
        const dateStr = cell.getAttribute("data-date");
        this.selectedDayDate = dateStr;
        this.setListenNowMode("daily");
      };
    });
  }

  /**
   * Mode C: Daily Deep-Dive View
   */
  renderListenNowDaily() {
    const strip = document.getElementById("ln-daily-pills-strip");
    const nativePicker = document.getElementById("ln-day-native-picker");
    const badge = document.getElementById("master-mode-meta-badge");

    if (!this.availableDays || this.availableDays.length === 0) {
      if (badge) badge.textContent = "Daily Breakdown • No Data Available";
      const tracklistRows = document.getElementById("ln-day-tracklist-rows");
      if (tracklistRows) {
        tracklistRows.innerHTML = `
          <div style="padding: 32px 16px; text-align: center; color: var(--text-secondary); font-size: 14px;">
            No daily listening logs found. Upload a raw BitChord backup to explore daily stats.
          </div>
        `;
      }
      return;
    }

    if (!this.selectedDayDate || !this.availableDays.includes(this.selectedDayDate)) {
      this.selectedDayDate = this.availableDays[this.availableDays.length - 1];
    }

    if (badge && this.selectedDayDate) {
      badge.textContent = `Daily Breakdown • ${this.formatDateLong(this.selectedDayDate)}`;
    }

    if (nativePicker) {
      nativePicker.min = this.availableDays[0];
      nativePicker.max = this.availableDays[this.availableDays.length - 1];
      nativePicker.value = this.selectedDayDate;
      nativePicker.onchange = e => {
        if (e.target.value) {
          this.selectedDayDate = e.target.value;
          this.renderListenNowDaily();
        }
      };
    }

    if (strip) {
      strip.innerHTML = this.availableDays.map(dateStr => {
        const isActive = this.selectedDayDate === dateStr ? "active" : "";
        let dayMs = 0;
        if (this.masterState.tracks) {
          for (const t of this.masterState.tracks) {
            if (t.days && t.days[dateStr]) dayMs += t.days[dateStr].ms || 0;
          }
        }
        if (dayMs === 0 && this.masterState.monthly) {
          const mPrefix = dateStr.slice(0, 7);
          for (const m of this.masterState.monthly) {
            if (m.month === mPrefix && m.days && m.days[dateStr]) {
              dayMs += m.days[dateStr].ms || 0;
            }
          }
        }
        const hours = (dayMs / 3600000).toFixed(1);
        const shortDate = this.formatDateShort(dateStr);

        return `
          <button class="daily-active-pill ${isActive}" data-date="${dateStr}">
            <span>${shortDate}</span>
            <span class="daily-pill-badge">${hours}h</span>
          </button>
        `;
      }).join("");

      strip.querySelectorAll(".daily-active-pill").forEach(btn => {
        btn.onclick = () => {
          this.selectedDayDate = btn.getAttribute("data-date");
          this.renderListenNowDaily();
        };
      });

      // Smoothly scroll active pill into visible center
      const activePill = strip.querySelector(".daily-active-pill.active");
      if (activePill) {
        activePill.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
      }
    }

    const prevDayBtn = document.getElementById("btn-ln-day-prev");
    const nextDayBtn = document.getElementById("btn-ln-day-next");
    const curIdx = this.availableDays.indexOf(this.selectedDayDate);

    if (prevDayBtn) {
      prevDayBtn.disabled = curIdx <= 0;
      prevDayBtn.style.opacity = curIdx <= 0 ? "0.35" : "1";
      prevDayBtn.style.cursor = curIdx <= 0 ? "not-allowed" : "pointer";
      prevDayBtn.onclick = () => {
        if (curIdx > 0) {
          this.selectedDayDate = this.availableDays[curIdx - 1];
          this.renderListenNowDaily();
        } else if (curIdx === -1) {
          const prior = this.availableDays.filter(d => d < this.selectedDayDate);
          if (prior.length > 0) {
            this.selectedDayDate = prior[prior.length - 1];
            this.renderListenNowDaily();
          }
        }
      };
    }

    if (nextDayBtn) {
      const isLast = curIdx >= this.availableDays.length - 1;
      nextDayBtn.disabled = isLast;
      nextDayBtn.style.opacity = isLast ? "0.35" : "1";
      nextDayBtn.style.cursor = isLast ? "not-allowed" : "pointer";
      nextDayBtn.onclick = () => {
        if (curIdx >= 0 && curIdx < this.availableDays.length - 1) {
          this.selectedDayDate = this.availableDays[curIdx + 1];
          this.renderListenNowDaily();
        } else if (curIdx === -1) {
          const subsequent = this.availableDays.filter(d => d > this.selectedDayDate);
          if (subsequent.length > 0) {
            this.selectedDayDate = subsequent[0];
            this.renderListenNowDaily();
          }
        }
      };
    }

    // Compute Day Breakdown
    const dayData = PulseAnalytics.computeDayBreakdown(this.masterState, this.selectedDayDate);
    if (!dayData) return;

    // Day Hero KPI Strip
    const timeEl = document.getElementById("stat-day-total-time");
    const secondsEl = document.getElementById("stat-day-exact-seconds");
    const playsEl = document.getElementById("stat-day-total-plays");
    const songsEl = document.getElementById("stat-day-unique-songs");
    const topSongTitleEl = document.getElementById("stat-day-top-song-title");
    const topSongMetaEl = document.getElementById("stat-day-top-song-meta");
    const topArtistNameEl = document.getElementById("stat-day-top-artist-name");
    const topArtistMetaEl = document.getElementById("stat-day-top-artist-meta");

    if (timeEl) timeEl.textContent = dayData.formattedTime;
    if (secondsEl) secondsEl.textContent = `${(dayData.totalMs / 3600000).toFixed(2)} hours tracked`;
    if (playsEl) playsEl.textContent = dayData.totalPlays.toLocaleString();
    if (songsEl) songsEl.textContent = `${dayData.uniqueSongs} songs`;
    if (topSongTitleEl) topSongTitleEl.textContent = dayData.topSong?.title || "—";
    if (topSongMetaEl) topSongMetaEl.textContent = dayData.topSong ? `${dayData.topSong.totalMinutes || 0}m • ${dayData.topSong.dayPlays || 0} plays` : "No plays";
    if (topArtistNameEl) topArtistNameEl.textContent = dayData.topArtist?.name || "—";
    if (topArtistMetaEl) topArtistMetaEl.textContent = dayData.topArtist ? `${dayData.topArtist.minutes || 0} mins • ${dayData.topArtist.percent || 0}% of day` : "No plays";

    // 24-Hour Hourly Activity Graph for That Day
    this.renderDailyHourlyChart(dayData);

    // Toggle button for projected vs exact
    const toggleBtn = document.getElementById("btn-toggle-day-hourly-mode");
    if (toggleBtn) {
      toggleBtn.textContent = this.dayHourlyMode === "projected" 
        ? "Mode: Exact + Circadian Projected" 
        : "Mode: Confirmed Timestamps Only";
      toggleBtn.onclick = () => {
        this.dayHourlyMode = this.dayHourlyMode === "projected" ? "exact" : "projected";
        this.renderDailyHourlyChart(dayData);
      };
    }

    // Top Artists of the Day
    const artistsGrid = document.getElementById("ln-day-artists-grid");
    if (artistsGrid) {
      if (dayData.topArtists.length === 0) {
        artistsGrid.innerHTML = `
          <div style="padding: 24px; text-align: center; color: var(--text-tertiary); grid-column: 1/-1;">
            No artist activity recorded on this day.
          </div>
        `;
      } else {
        artistsGrid.innerHTML = dayData.topArtists.slice(0, 6).map((a, idx) => `
          <div class="day-artist-card" data-artist-idx="${idx}" data-artist-name="${encodeURIComponent(a.name)}">
            <div class="day-artist-art-wrap">
              <img class="day-artist-art" data-artist-portrait="${encodeURIComponent(a.name)}" src="https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=150" alt="${a.name}" />
              <span class="day-artist-rank-badge">#${idx + 1}</span>
            </div>
            <div class="day-artist-info">
              <div class="day-artist-name">${a.name}</div>
              <div class="day-artist-meta">${a.minutes} mins • ${a.percent}% of day</div>
            </div>
          </div>
        `).join("");

        dayData.topArtists.slice(0, 6).forEach(a => {
          artEngine.getArtistPortrait(a.name, this.masterState.searchHistory, this.masterState.portraitMap)
            .then(portrait => {
              const img = artistsGrid.querySelector(`img[data-artist-portrait="${encodeURIComponent(a.name)}"]`);
              if (img && portrait) img.src = portrait;
            });
        });

        artistsGrid.querySelectorAll(".day-artist-card").forEach(card => {
          const idx = parseInt(card.getAttribute("data-artist-idx"), 10);
          const artist = dayData.topArtists[idx];
          if (artist) {
            const fullLeaderboard = PulseAnalytics.computeArtistLeaderboard(this.masterState, "primary");
            const fullArtist = fullLeaderboard.leaderboard.find(x => x.name === artist.name) || {
              name: artist.name,
              hours: artist.hours,
              plays: artist.plays,
              uniqueTracksCount: artist.tracksCount || 1,
              topTracks: artist.tracks || []
            };
            card.onclick = () => this.openArtistDrawer(fullArtist);
          }
        });
      }
    }

    // Complete Tracklist of the Day
    const tracklistRows = document.getElementById("ln-day-tracklist-rows");
    if (tracklistRows) {
      if (dayData.tracks.length === 0) {
        const recentDays = this.availableDays.slice(-4).reverse();
        tracklistRows.innerHTML = `
          <div style="padding: 32px 16px; text-align: center; color: var(--text-secondary);">
            <div style="font-size: 14px; margin-bottom: 12px;">No tracks recorded on ${this.formatDateLong(this.selectedDayDate)}.</div>
            <div style="font-size: 12px; color: var(--text-tertiary); margin-bottom: 16px;">Jump to nearest active listening days:</div>
            <div style="display: flex; gap: 8px; justify-content: center; flex-wrap: wrap;">
              ${recentDays.map(d => `<button class="btn-sidebar-secondary btn-quick-jump-day" data-date="${d}" style="width:auto; padding:6px 14px;">${this.formatDateShort(d)}</button>`).join("")}
            </div>
          </div>
        `;
        tracklistRows.querySelectorAll(".btn-quick-jump-day").forEach(btn => {
          btn.onclick = () => {
            this.selectedDayDate = btn.getAttribute("data-date");
            this.renderListenNowDaily();
          };
        });
      } else {
        const maxMs = dayData.tracks[0]?.dayMs || 1;
        tracklistRows.innerHTML = dayData.tracks.map((t, idx) => {
          const art = artEngine.getTrackArtworkUrl(t, this.masterState.artMap);
          const sharePct = Math.min(100, Math.max(4, Math.round((t.dayMs / maxMs) * 100)));
          return `
            <div class="apple-track-row" data-track-id="${t.id}">
              <span class="track-col-rank">${idx + 1}</span>
              <div class="track-art-box">
                <img src="${art}" alt="" />
                <div class="track-hover-play">▶</div>
              </div>
              <div class="track-col-title-artist">
                <div class="track-row-title">${t.title}</div>
                <div class="track-row-artist">${t.artist}</div>
              </div>
              <div class="track-col-album">${t.album || "Single"}</div>
              <div class="track-col-plays-time">
                <span class="track-plays-text">${t.dayPlays} plays • ${t.totalMinutes}m ${t.seconds}s</span>
                <div class="track-share-bar-bg">
                  <div class="track-share-bar-fill" style="width:${sharePct}%"></div>
                </div>
              </div>
            </div>
          `;
        }).join("");

        tracklistRows.querySelectorAll(".apple-track-row").forEach(row => {
          const id = row.getAttribute("data-track-id");
          const track = dayData.tracks.find(x => x.id === id);
          row.onclick = () => { if (track) this.openSongDeepDive(track); };
        });
      }
    }
  }

  renderDailyHourlyChart(dayData) {
    const canvas = document.getElementById("chart-ln-daily-hourly");
    if (!canvas || typeof Chart === "undefined") return;

    if (this.charts.dailyHourly) this.charts.dailyHourly.destroy();

    const subtitle = document.getElementById("ln-day-chart-subtitle");
    if (subtitle) {
      subtitle.textContent = this.dayHourlyMode === "projected"
        ? `Hourly duration from 00:00 to 23:00 on ${dayData.dateStr} (Weighted by Circadian Profile)`
        : `Confirmed play events from 00:00 to 23:00 on ${dayData.dateStr}`;
    }

    const labels = Array.from({ length: 24 }, (_, i) => `${i.toString().padStart(2, "0")}:00`);
    const isProjected = this.dayHourlyMode === "projected";
    const dataValues = isProjected ? dayData.projectedHourlyHours : dayData.exactHourlyPlays;

    const ctx = canvas.getContext("2d");
    const gradient = ctx.createLinearGradient(0, 0, 0, 240);
    gradient.addColorStop(0, "rgba(250, 36, 60, 0.4)");
    gradient.addColorStop(1, "rgba(250, 36, 60, 0.0)");

    this.charts.dailyHourly = new Chart(canvas, {
      type: isProjected ? "line" : "bar",
      data: {
        labels,
        datasets: [
          {
            data: dataValues,
            borderColor: "#FA243C",
            backgroundColor: isProjected ? gradient : "rgba(250, 36, 60, 0.8)",
            borderWidth: 2,
            tension: 0.38,
            fill: isProjected,
            pointRadius: isProjected ? 3 : 0,
            borderRadius: isProjected ? 0 : 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "rgba(18, 18, 24, 0.94)",
            borderColor: "rgba(255, 255, 255, 0.12)",
            borderWidth: 1,
            callbacks: {
              label: ctx => isProjected ? ` ${ctx.parsed.y} hrs listened` : ` ${ctx.parsed.y} plays`
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: "rgba(255, 255, 255, 0.4)", font: { family: "Inter", size: 10 }, maxTicksLimit: 12 }
          },
          y: {
            grid: { color: "rgba(255, 255, 255, 0.04)" },
            ticks: {
              color: "rgba(255, 255, 255, 0.4)",
              font: { family: "Inter", size: 10 },
              callback: v => isProjected ? `${v}h` : v
            }
          }
        }
      }
    });
  }

  /**
   * =========================================================================
   * TAB 2: Time & Rhythm (GitHub Heatmap Matrix with Dynamic Tiers & Legend)
   * =========================================================================
   */
  renderTabTimeRhythm() {
    this.renderTimeNavigatorBar();

    const monthFilter = this.selectedMonth === "all" ? "all" : this.selectedMonth;
    const filteredMonth = PulseAnalytics.filterState(this.masterState, monthFilter, false);

    this.renderMonthSummaryStrip(filteredMonth);

    if (this.heatmapViewMode === "github") {
      document.getElementById("github-heatmap-view")?.classList.remove("hidden");
      document.getElementById("month-calendar-cover-view")?.classList.add("hidden");
      document.getElementById("heatmap-display-title").textContent = "Listening Contribution Matrix (2026)";
      document.getElementById("heatmap-display-subtitle").textContent = "Hover squares for details or click any day to inspect full day records below";
      this.renderGitHubContributionMatrix();
    } else {
      document.getElementById("github-heatmap-view")?.classList.add("hidden");
      document.getElementById("month-calendar-cover-view")?.classList.remove("hidden");
      const monthName = this.formatMonthName(this.selectedMonth);
      document.getElementById("heatmap-display-title").textContent = `${monthName} Calendar (Cover Art View)`;
      document.getElementById("heatmap-display-subtitle").textContent = "Every day displays the album artwork of your #1 most played anthem";
      this.renderMonthCalendarCoverView(filteredMonth);
    }

    const hourly = PulseAnalytics.computeHourlyCircadian(filteredMonth);
    const weekly = PulseAnalytics.computeWeeklyBreakdown(filteredMonth);
    const monthlyYearly = PulseAnalytics.computeMonthlyAndYearly(this.masterState, filteredMonth);

    const peakBadge = document.getElementById("badge-circadian-peak");
    if (peakBadge) peakBadge.textContent = `Peak: ${hourly.peakHourFormatted} • ${hourly.chronotype}`;

    this.renderCircadianChart(hourly);
    this.renderWeeklyBarsChart(weekly);
    this.renderMonthlyHorizonChart(monthlyYearly);
  }

  renderTimeNavigatorBar() {
    const strip = document.getElementById("months-pill-strip");
    if (!strip) return;

    let html = `<button class="month-pill-btn ${this.selectedMonth === 'all' ? 'active' : ''}" data-month="all">All Months</button>`;

    this.availableMonths.forEach(m => {
      const label = this.formatMonthShort(m);
      const isActive = this.selectedMonth === m ? "active" : "";
      html += `<button class="month-pill-btn ${isActive}" data-month="${m}">${label}</button>`;
    });

    strip.innerHTML = html;

    strip.querySelectorAll(".month-pill-btn").forEach(btn => {
      btn.onclick = () => {
        this.selectedMonth = btn.getAttribute("data-month");
        this.renderTabTimeRhythm();
      };
    });

    const prevBtn = document.getElementById("btn-month-prev");
    const nextBtn = document.getElementById("btn-month-next");

    if (prevBtn) {
      prevBtn.onclick = () => {
        const idx = this.availableMonths.indexOf(this.selectedMonth);
        if (idx > 0) {
          this.selectedMonth = this.availableMonths[idx - 1];
          this.renderTabTimeRhythm();
        } else if (this.selectedMonth === "all" && this.availableMonths.length > 0) {
          this.selectedMonth = this.availableMonths[0];
          this.renderTabTimeRhythm();
        }
      };
    }

    if (nextBtn) {
      nextBtn.onclick = () => {
        const idx = this.availableMonths.indexOf(this.selectedMonth);
        if (idx >= 0 && idx < this.availableMonths.length - 1) {
          this.selectedMonth = this.availableMonths[idx + 1];
          this.renderTabTimeRhythm();
        } else if (idx === this.availableMonths.length - 1) {
          this.selectedMonth = "all";
          this.renderTabTimeRhythm();
        }
      };
    }
  }

  renderMonthSummaryStrip(filteredMonth) {
    const kpis = PulseAnalytics.computeHeroKPIs(filteredMonth);
    const artists = PulseAnalytics.computeArtistLeaderboard(filteredMonth, "primary");
    const songs = PulseAnalytics.computeSongsAndAlbums(filteredMonth);

    const hoursEl = document.getElementById("ms-summary-hours");
    const splitEl = document.getElementById("ms-summary-split");
    const songEl = document.getElementById("ms-summary-song");
    const artistEl = document.getElementById("ms-summary-artist");

    if (hoursEl) hoursEl.textContent = `${kpis.totalHoursFormatted} hrs`;
    if (splitEl) splitEl.textContent = `${kpis.hours}h daily / ${kpis.totalPlays} plays`;
    if (songEl) songEl.textContent = songs.topSongs[0]?.title || "—";
    if (artistEl) artistEl.textContent = artists.podium[0]?.name || "—";
  }

  /**
   * AUTHENTIC GITHUB CONTRIBUTION GRAPH with Dynamic Normalization & Glow Tiers
   */
  renderGitHubContributionMatrix() {
    const squaresGrid = document.getElementById("gh-squares-grid");
    const monthLabelsRow = document.getElementById("gh-month-labels");
    const tooltip = document.getElementById("gh-tooltip");
    const legendPeakLabel = document.getElementById("gh-legend-peak-label");
    if (!squaresGrid || !monthLabelsRow) return;

    const year = 2026;
    let maxActiveMs = 0;

    const datesMap = this.masterState.tracks.reduce((acc, t) => {
      if (t.days) {
        for (const [d, val] of Object.entries(t.days)) {
          if (!acc[d]) acc[d] = { ms: 0, plays: 0, topTrack: t };
          acc[d].ms += val.ms || 0;
          acc[d].plays += val.plays || 0;
          if (acc[d].ms > maxActiveMs) maxActiveMs = acc[d].ms;
          if (val.ms > (acc[d].topMs || 0)) {
            acc[d].topMs = val.ms;
            acc[d].topTrack = t;
          }
        }
      }
      return acc;
    }, {});

    if (legendPeakLabel) {
      legendPeakLabel.textContent = `More (${(maxActiveMs / 3600000).toFixed(1)}h)`;
    }

    const monthColumns = new Map();
    const startDate = new Date(year, 0, 1);
    const startDayOfWeek = (startDate.getDay() + 6) % 7;

    const totalDays = 365;
    let gridHtml = "";

    for (let i = 0; i < startDayOfWeek; i++) {
      gridHtml += `<div class="gh-cell" data-level="0" style="opacity:0.2;"></div>`;
    }

    let activeWeekColumn = 0;

    for (let dayOfYear = 0; dayOfYear < totalDays; dayOfYear++) {
      const curDate = new Date(year, 0, 1 + dayOfYear);
      const weekIndex = Math.floor((dayOfYear + startDayOfWeek) / 7);

      const m = curDate.getMonth();
      const dNum = curDate.getDate();
      if (dNum === 1 && !monthColumns.has(m)) {
        monthColumns.set(m, weekIndex);
      }

      const dateStr = curDate.toISOString().split("T")[0];
      const dayData = datesMap[dateStr];
      const ms = dayData ? dayData.ms : 0;
      const plays = dayData ? dayData.plays : 0;
      const minutes = Math.round(ms / 60000);

      // Dynamic Min-Max Normalization into 5 Tiers
      const ratio = maxActiveMs > 0 ? ms / maxActiveMs : 0;
      let level = 0;
      if (ratio > 0.75) level = 4;
      else if (ratio > 0.50) level = 3;
      else if (ratio > 0.25) level = 2;
      else if (ratio > 0) level = 1;

      if (level > 0) activeWeekColumn = weekIndex;

      const isSelected = dateStr === this.selectedDayDate ? "selected" : "";
      gridHtml += `
        <div class="gh-cell ${isSelected}" 
             data-level="${level}" 
             data-date="${dateStr}"
             data-mins="${minutes}"
             data-plays="${plays}"
             data-top="${dayData?.topTrack?.title || ''}">
        </div>
      `;
    }

    const remainingDays = 7 - ((startDayOfWeek + totalDays) % 7);
    if (remainingDays < 7) {
      for (let i = 0; i < remainingDays; i++) {
        gridHtml += `<div class="gh-cell" data-level="0" style="opacity:0.2;"></div>`;
      }
    }

    squaresGrid.innerHTML = gridHtml;

    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    let monthLabelsHtml = "";
    for (let col = 0; col < 53; col++) {
      let label = "";
      for (const [m, cIndex] of monthColumns.entries()) {
        if (cIndex === col) {
          label = monthNames[m];
          break;
        }
      }
      monthLabelsHtml += `<span>${label}</span>`;
    }
    monthLabelsRow.innerHTML = monthLabelsHtml;

    squaresGrid.querySelectorAll(".gh-cell[data-date]").forEach(cell => {
      cell.onmouseenter = e => {
        const date = cell.getAttribute("data-date");
        const mins = cell.getAttribute("data-mins");
        const plays = cell.getAttribute("data-plays");
        const top = cell.getAttribute("data-top");

        const formatted = this.formatDateLong(date);
        tooltip.innerHTML = `
          <strong>${formatted}</strong> • ${mins}m (${plays} plays)
          ${top ? `<div style="font-size:10.5px; color:rgba(255,255,255,0.6); margin-top:2px;">#1: ${top}</div>` : ""}
        `;
        tooltip.style.display = "block";
      };

      cell.onmousemove = e => {
        tooltip.style.left = `${e.clientX + 14}px`;
        tooltip.style.top = `${e.clientY - 28}px`;
      };

      cell.onmouseleave = () => {
        tooltip.style.display = "none";
      };

      cell.onclick = () => {
        squaresGrid.querySelectorAll(".gh-cell").forEach(c => c.classList.remove("selected"));
        cell.classList.add("selected");
        const dateStr = cell.getAttribute("data-date");
        this.selectCalendarDay(dateStr);
      };
    });

    const wrapper = document.getElementById("github-heatmap-view");
    if (wrapper && activeWeekColumn > 0) {
      setTimeout(() => {
        const targetScroll = Math.max(0, (activeWeekColumn - 8) * 17);
        wrapper.scrollTo({ left: targetScroll, behavior: "smooth" });
      }, 100);
    }

    if (this.selectedDayDate) {
      this.selectCalendarDay(this.selectedDayDate);
    }
  }

  renderMonthCalendarCoverView(filteredMonth) {
    const container = document.getElementById("cal-month-days-grid");
    if (!container) return;

    const monthStr = this.selectedMonth === "all" ? this.availableMonths[this.availableMonths.length - 1] : this.selectedMonth;
    const [yearStr, mStr] = monthStr.split("-");
    const year = parseInt(yearStr, 10);
    const month = parseInt(mStr, 10) - 1;

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const totalDaysInMonth = lastDay.getDate();
    const startDayOfWeek = (firstDay.getDay() + 6) % 7;

    let html = "";
    for (let i = 0; i < startDayOfWeek; i++) {
      html += `<div class="month-cover-cell empty-day"></div>`;
    }

    for (let day = 1; day <= totalDaysInMonth; day++) {
      const dateStr = `${yearStr}-${mStr.padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
      const dayData = filteredMonth.dates[dateStr];
      const isSelected = dateStr === this.selectedDayDate ? "selected" : "";

      if (dayData && dayData.ms > 0) {
        const topTrack = [...dayData.tracks].sort((a, b) => b.ms - a.ms)[0];
        const artUrl = artEngine.getTrackArtworkUrl(topTrack, this.masterState.artMap);
        const mins = Math.round(dayData.ms / 60000);

        html += `
          <div class="month-cover-cell ${isSelected}" data-date="${dateStr}" title="${dateStr}: ${mins}m (${dayData.plays}p) - #1: ${topTrack.title}">
            <img class="month-cell-bg-art" src="${artUrl}" alt="" />
            <span class="month-cell-day-num">${day}</span>
            <span class="month-cell-min-badge">${mins}m</span>
          </div>
        `;
      } else {
        html += `
          <div class="month-cover-cell ${isSelected}" data-date="${dateStr}">
            <span class="month-cell-day-num" style="background:transparent; color:rgba(255,255,255,0.4);">${day}</span>
          </div>
        `;
      }
    }

    container.innerHTML = html;

    container.querySelectorAll(".month-cover-cell[data-date]").forEach(cell => {
      cell.onclick = () => {
        container.querySelectorAll(".month-cover-cell").forEach(c => c.classList.remove("selected"));
        cell.classList.add("selected");
        const dateStr = cell.getAttribute("data-date");
        this.selectCalendarDay(dateStr);
      };
    });
  }

  selectCalendarDay(dateStr) {
    this.selectedDayDate = dateStr;
    const dateTitle = document.getElementById("inspector-selected-date");
    const statsEl = document.getElementById("inspector-selected-stats");
    const listEl = document.getElementById("inspector-selected-tracks");
    const jumpBtn = document.getElementById("btn-jump-to-daily-mode");

    if (!dateStr) return;

    const dayData = PulseAnalytics.computeDayBreakdown(this.masterState, dateStr);
    if (!dayData) return;

    if (dateTitle) dateTitle.textContent = this.formatDateLong(dateStr);
    if (statsEl) statsEl.textContent = `${dayData.formattedTime} • ${dayData.totalPlays} plays`;

    // Render mini hourly curve in inspector
    this.renderInspectorMiniHourly(dayData);

    if (jumpBtn) {
      jumpBtn.onclick = () => {
        this.selectedDayDate = dateStr;
        this.switchAppTab("listen-now");
        this.setListenNowMode("daily");
      };
    }

    if (listEl) {
      if (dayData.tracks.length === 0) {
        listEl.innerHTML = `
          <div style="font-size:13px; color:var(--text-tertiary); text-align:center; padding:20px; grid-column:1/-1;">
            No songs recorded on this date.
          </div>
        `;
        return;
      }

      listEl.innerHTML = dayData.tracks.map(t => {
        const artUrl = artEngine.getTrackArtworkUrl(t, this.masterState.artMap);
        return `
          <div class="inspector-mini-track" data-track-id="${t.id}">
            <img class="inspector-mini-art" src="${artUrl}" alt="" />
            <div class="inspector-mini-info">
              <div class="inspector-mini-title">${t.title}</div>
              <div class="inspector-mini-artist">${t.artist}</div>
            </div>
            <span class="inspector-mini-time">${t.totalMinutes}m</span>
          </div>
        `;
      }).join("");

      listEl.querySelectorAll(".inspector-mini-track").forEach(item => {
        item.onclick = () => {
          const id = item.getAttribute("data-track-id");
          const track = dayData.tracks.find(x => x.id === id);
          if (track) this.openSongDeepDive(track);
        };
      });
    }
  }

  renderInspectorMiniHourly(dayData) {
    const canvas = document.getElementById("chart-inspector-hourly");
    if (!canvas || typeof Chart === "undefined") return;

    if (this.charts.inspectorHourly) this.charts.inspectorHourly.destroy();

    const labels = Array.from({ length: 24 }, (_, i) => `${i}`);
    const dataValues = dayData.projectedHourlyHours;

    this.charts.inspectorHourly = new Chart(canvas, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            data: dataValues,
            backgroundColor: "rgba(250, 36, 60, 0.75)",
            hoverBackgroundColor: "#FF6B81",
            borderRadius: 4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "rgba(18, 18, 24, 0.94)",
            borderColor: "rgba(255, 255, 255, 0.12)",
            borderWidth: 1,
            callbacks: {
              title: items => `${items[0].label}:00`,
              label: ctx => ` ${ctx.parsed.y} hrs`
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: "rgba(255, 255, 255, 0.3)", font: { family: "Inter", size: 9 }, maxTicksLimit: 12 }
          },
          y: {
            grid: { color: "rgba(255, 255, 255, 0.04)" },
            ticks: { color: "rgba(255, 255, 255, 0.3)", font: { family: "Inter", size: 9 }, callback: v => `${v}h` }
          }
        }
      }
    });
  }

  renderCircadianChart(hourlyData) {
    const canvas = document.getElementById("chart-circadian-curve");
    if (!canvas || typeof Chart === "undefined") return;

    if (this.charts.circadian) this.charts.circadian.destroy();

    const ctx = canvas.getContext("2d");
    const gradient = ctx.createLinearGradient(0, 0, 0, 200);
    gradient.addColorStop(0, "rgba(250, 36, 60, 0.35)");
    gradient.addColorStop(1, "rgba(250, 36, 60, 0.0)");

    const labels = Array.from({ length: 24 }, (_, i) => `${i.toString().padStart(2, "0")}:00`);

    this.charts.circadian = new Chart(canvas, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            data: hourlyData.hourlyPlays,
            borderColor: "#FA243C",
            backgroundColor: gradient,
            borderWidth: 2,
            tension: 0.4,
            fill: true,
            pointRadius: 0,
            pointHoverRadius: 5
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "rgba(18, 18, 24, 0.94)",
            borderColor: "rgba(255, 255, 255, 0.12)",
            borderWidth: 1,
            callbacks: {
              label: ctx => ` ${ctx.parsed.y} plays`
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: "rgba(255, 255, 255, 0.35)", font: { family: "Inter", size: 10 }, maxTicksLimit: 8 }
          },
          y: {
            grid: { color: "rgba(255, 255, 255, 0.04)" },
            ticks: { color: "rgba(255, 255, 255, 0.35)", font: { family: "Inter", size: 10 } }
          }
        }
      }
    });
  }

  renderWeeklyBarsChart(weeklyData) {
    const canvas = document.getElementById("chart-weekly-bars");
    if (!canvas || typeof Chart === "undefined") return;

    if (this.charts.weeklyBars) this.charts.weeklyBars.destroy();

    this.charts.weeklyBars = new Chart(canvas, {
      type: "bar",
      data: {
        labels: weeklyData.daysOfWeek,
        datasets: [
          {
            data: weeklyData.radarAveragesHours,
            backgroundColor: "rgba(250, 36, 60, 0.85)",
            hoverBackgroundColor: "#FF5E7E",
            borderRadius: 8,
            barThickness: 22
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "rgba(18, 18, 24, 0.94)",
            borderColor: "rgba(255, 255, 255, 0.12)",
            borderWidth: 1,
            callbacks: {
              label: ctx => ` ${ctx.parsed.y} hrs average`
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: "rgba(255, 255, 255, 0.5)", font: { family: "Inter", size: 11 } }
          },
          y: {
            grid: { color: "rgba(255, 255, 255, 0.04)" },
            ticks: {
              color: "rgba(255, 255, 255, 0.35)",
              font: { family: "Inter", size: 10 },
              callback: v => `${v}h`
            }
          }
        }
      }
    });
  }

  renderMonthlyHorizonChart(monthlyYearly) {
    const canvas = document.getElementById("chart-monthly-horizon");
    if (!canvas || typeof Chart === "undefined") return;

    if (this.charts.monthlyHorizon) this.charts.monthlyHorizon.destroy();

    const labels = monthlyYearly.monthsSummary.map(m => m.month);
    const dataValues = monthlyYearly.monthsSummary.map(m =>
      this.monthMetric === "hours" ? parseFloat(m.totalHours) : m.plays
    );

    this.charts.monthlyHorizon = new Chart(canvas, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            data: dataValues,
            backgroundColor: "rgba(250, 36, 60, 0.85)",
            hoverBackgroundColor: "#FF5E7E",
            borderRadius: 10,
            barThickness: 32
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "rgba(18, 18, 24, 0.94)",
            borderColor: "rgba(255, 255, 255, 0.12)",
            borderWidth: 1,
            callbacks: {
              label: ctx =>
                this.monthMetric === "hours"
                  ? ` ${ctx.parsed.y} hrs listened`
                  : ` ${ctx.parsed.y} completed plays`
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: "rgba(255, 255, 255, 0.5)", font: { family: "Inter" } }
          },
          y: {
            grid: { color: "rgba(255, 255, 255, 0.04)" },
            ticks: {
              color: "rgba(255, 255, 255, 0.35)",
              font: { family: "Inter" },
              callback: v => (this.monthMetric === "hours" ? `${v}h` : v)
            }
          }
        }
      }
    });
  }

  /**
   * =========================================================================
   * TAB 3: Artists (Podium, Constellation Canvas & Gallery)
   * =========================================================================
   */
  async renderTabArtists(filtered) {
    const data = PulseAnalytics.computeArtistLeaderboard(filtered, "primary");

    // 1. Interactive Artist Gravity Constellation Canvas
    this.renderArtistConstellation(data.leaderboard);

    // 2. Top 3 Podium Cards
    const podiumEl = document.getElementById("artists-podium-cards");
    if (podiumEl) {
      podiumEl.innerHTML = data.podium.map((a, idx) => {
        const topTrackTitle = a.topTracks[0]?.title || "Top Anthem";
        return `
          <div class="glass-card podium-glass-card" data-artist-index="${idx}">
            <img class="podium-portrait" data-artist-portrait="${encodeURIComponent(a.name)}" src="https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=200" alt="${a.name}" />
            <div class="podium-info">
              <span class="podium-rank-tag">#${idx + 1} ARTIST</span>
              <div class="podium-name">${a.name}</div>
              <div class="podium-metric">${a.hours} hrs • ${a.plays} plays</div>
              <span class="podium-top-chip" title="${topTrackTitle}">▶ ${topTrackTitle}</span>
            </div>
          </div>
        `;
      }).join("");

      data.podium.forEach(a => {
        artEngine.getArtistPortrait(a.name, this.masterState.searchHistory, this.masterState.portraitMap, a.topTracks)
          .then(portrait => {
            const img = podiumEl.querySelector(`img[data-artist-portrait="${encodeURIComponent(a.name)}"]`);
            if (img && portrait) img.src = portrait;
          });
      });

      podiumEl.querySelectorAll(".podium-glass-card").forEach((card, idx) => {
        card.onclick = () => this.openArtistDrawer(data.podium[idx]);
      });
    }

    // 3. All Artists Gallery (Capped at 210px) with Rank Badges
    const galleryEl = document.getElementById("all-artists-gallery");
    if (galleryEl) {
      galleryEl.innerHTML = data.leaderboard.slice(0, 48).map((a, idx) => `
        <div class="artist-gallery-card" data-artist-idx="${idx}">
          <div class="artist-gallery-art-wrap">
            <img class="artist-squircle-portrait" data-artist-portrait="${encodeURIComponent(a.name)}" src="https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=200" alt="${a.name}" />
            <span class="artist-gallery-rank-badge">#${idx + 1}</span>
          </div>
          <div class="artist-gallery-name">${a.name}</div>
          <div class="artist-gallery-sub">${a.hours} hrs • ${a.plays} plays</div>
        </div>
      `).join("");

      data.leaderboard.slice(0, 48).forEach(a => {
        artEngine.getArtistPortrait(a.name, this.masterState.searchHistory, this.masterState.portraitMap, a.topTracks)
          .then(portrait => {
            const img = galleryEl.querySelector(`img[data-artist-portrait="${encodeURIComponent(a.name)}"]`);
            if (img && portrait) img.src = portrait;
          });
      });

      galleryEl.querySelectorAll(".artist-gallery-card").forEach(card => {
        const idx = parseInt(card.getAttribute("data-artist-idx"), 10);
        card.onclick = () => this.openArtistDrawer(data.leaderboard[idx]);
      });
    }
  }

  renderArtistConstellation(artistsList) {
    const canvas = document.getElementById("artist-constellation-canvas");
    if (!canvas) return;

    if (this.constellationAnimId) {
      cancelAnimationFrame(this.constellationAnimId);
      this.constellationAnimId = null;
    }

    const rect = canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = rect.width;
    const height = rect.height;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);

    const topArtists = artistsList.slice(0, 12);
    if (topArtists.length === 0) return;

    // Grid-spaced jittered initial placement across full canvas area to prevent central clumping
    const cols = width > 768 ? 4 : (width > 480 ? 3 : 2);
    const rows = Math.ceil(topArtists.length / cols);
    const cellW = width / cols;
    const cellH = height / rows;

    const nodes = topArtists.map((a, i) => {
      // Radius scaled smoothly from 42px (#1) down to 24px (#12)
      const radius = Math.round(24 + (1 - i / topArtists.length) * 18);
      const col = i % cols;
      const row = Math.floor(i / cols);

      const x = Math.max(radius + 20, Math.min(width - radius - 20, cellW * (col + 0.5) + (Math.random() - 0.5) * (cellW * 0.25)));
      const y = Math.max(radius + 36, Math.min(height - radius - 36, cellH * (row + 0.5) + (Math.random() - 0.5) * (cellH * 0.25)));

      const vx = (Math.random() - 0.5) * 0.35;
      const vy = (Math.random() - 0.5) * 0.35;

      const img = new Image();
      artEngine.getArtistPortrait(a.name, this.masterState.searchHistory, this.masterState.portraitMap, a.topTracks)
        .then(url => { if (url) img.src = url; });

      return {
        ...a,
        rank: a.rank || (i + 1),
        x,
        y,
        vx,
        vy,
        radius,
        img
      };
    });

    let hoveredNode = null;
    let draggedNode = null;
    let dragOffset = { x: 0, y: 0 };

    canvas.onmousemove = e => {
      const crect = canvas.getBoundingClientRect();
      const mx = e.clientX - crect.left;
      const my = e.clientY - crect.top;

      if (draggedNode) {
        draggedNode.x = mx + dragOffset.x;
        draggedNode.y = my + dragOffset.y;
        draggedNode.vx = 0;
        draggedNode.vy = 0;
        return;
      }

      hoveredNode = null;
      for (const node of nodes) {
        const dx = node.x - mx;
        const dy = node.y - my;
        if (Math.hypot(dx, dy) < node.radius + 8) {
          hoveredNode = node;
          break;
        }
      }
      canvas.style.cursor = hoveredNode ? "pointer" : "default";
    };

    canvas.onmousedown = e => {
      const crect = canvas.getBoundingClientRect();
      const mx = e.clientX - crect.left;
      const my = e.clientY - crect.top;
      for (const node of nodes) {
        if (Math.hypot(node.x - mx, node.y - my) <= node.radius + 8) {
          draggedNode = node;
          dragOffset.x = node.x - mx;
          dragOffset.y = node.y - my;
          break;
        }
      }
    };

    const handleMouseUp = () => {
      if (draggedNode) {
        draggedNode = null;
      }
    };
    window.addEventListener("mouseup", handleMouseUp);

    canvas.onclick = () => {
      if (hoveredNode && !draggedNode) {
        this.openArtistDrawer(hoveredNode);
      }
    };

    const drawPill = (c, x, y, w, h, r) => {
      if (c.roundRect) {
        c.beginPath();
        c.roundRect(x, y, w, h, r);
        c.fill();
      } else {
        c.beginPath();
        c.moveTo(x + r, y);
        c.arcTo(x + w, y, x + w, y + h, r);
        c.arcTo(x + w, y + h, x, y + h, r);
        c.arcTo(x, y + h, x, y, r);
        c.arcTo(x, y, x + w, y, r);
        c.closePath();
        c.fill();
      }
    };

    const animate = () => {
      ctx.clearRect(0, 0, width, height);

      // 1. Multi-body collision separation & physics
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.hypot(dx, dy) || 0.001;
          const minDist = a.radius + b.radius + 32; // Buffer to prevent label/pill collision

          if (dist < minDist) {
            const overlap = minDist - dist;
            const nx = dx / dist;
            const ny = dy / dist;
            const force = overlap * 0.08;
            if (a !== draggedNode) {
              a.vx -= nx * force;
              a.vy -= ny * force;
            }
            if (b !== draggedNode) {
              b.vx += nx * force;
              b.vy += ny * force;
            }
          }
        }
      }

      // 2. Connecting constellation filaments
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[j].x - nodes[i].x;
          const dy = nodes[j].y - nodes[i].y;
          const dist = Math.hypot(dx, dy);
          if (dist < 170) {
            ctx.beginPath();
            ctx.strokeStyle = `rgba(250, 36, 60, ${0.22 * (1 - dist / 170)})`;
            ctx.lineWidth = 1;
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.stroke();
          }
        }
      }

      // 3. Update & render each artist node
      nodes.forEach(node => {
        if (node !== draggedNode) {
          // Center gravity
          node.vx += (width / 2 - node.x) * 0.0002;
          node.vy += (height / 2 - node.y) * 0.0002;

          // Gentle ambient float
          node.vx += (Math.random() - 0.5) * 0.03;
          node.vy += (Math.random() - 0.5) * 0.03;

          // Velocity damping
          node.vx *= 0.94;
          node.vy *= 0.94;

          // Velocity clamp
          const spd = Math.hypot(node.vx, node.vy);
          if (spd > 1.2) {
            node.vx = (node.vx / spd) * 1.2;
            node.vy = (node.vy / spd) * 1.2;
          }

          node.x += node.vx;
          node.y += node.vy;

          // Safe boundary bounce
          const padX = node.radius + 18;
          const padY = node.radius + 38;
          if (node.x < padX) { node.x = padX; node.vx = Math.abs(node.vx) * 0.7; }
          if (node.x > width - padX) { node.x = width - padX; node.vx = -Math.abs(node.vx) * 0.7; }
          if (node.y < padY) { node.y = padY; node.vy = Math.abs(node.vy) * 0.7; }
          if (node.y > height - padY) { node.y = height - padY; node.vy = -Math.abs(node.vy) * 0.7; }
        }

        const isHovered = hoveredNode === node;
        const r = isHovered ? node.radius * 1.18 : node.radius;

        // Circular portrait
        ctx.save();
        ctx.shadowColor = isHovered ? "#FA243C" : "rgba(250, 36, 60, 0.5)";
        ctx.shadowBlur = isHovered ? 24 : 10;

        ctx.beginPath();
        ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
        ctx.fillStyle = "#16161D";
        ctx.fill();
        ctx.lineWidth = isHovered ? 3 : (node.rank === 1 ? 2.5 : 1.5);
        ctx.strokeStyle = isHovered ? "#FFFFFF" : (node.rank === 1 ? "#FF5E7E" : "rgba(250, 36, 60, 0.85)");
        ctx.stroke();
        ctx.clip();

        if (node.img && node.img.complete && node.img.naturalWidth > 0) {
          ctx.drawImage(node.img, node.x - r, node.y - r, r * 2, r * 2);
        } else {
          ctx.fillStyle = "#1e1e28";
          ctx.fillRect(node.x - r, node.y - r, r * 2, r * 2);
          ctx.font = "bold 14px Inter";
          ctx.fillStyle = "rgba(255,255,255,0.7)";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(node.name.slice(0, 2).toUpperCase(), node.x, node.y);
        }
        ctx.restore();

        // Rank Badge Pill ON TOP of Bubble
        const badgeW = 28;
        const badgeH = 15;
        const badgeX = node.x - badgeW / 2;
        const badgeY = node.y - r - 8;

        ctx.save();
        ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
        ctx.shadowBlur = 4;
        ctx.fillStyle = isHovered ? "#FFFFFF" : (node.rank <= 3 ? "#FA243C" : "rgba(250, 36, 60, 0.88)");
        drawPill(ctx, badgeX, badgeY, badgeW, badgeH, 7);
        ctx.restore();

        ctx.save();
        ctx.font = "bold 9px Inter, -apple-system, sans-serif";
        ctx.fillStyle = isHovered ? "#FA243C" : "#FFFFFF";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(`#${node.rank}`, node.x, badgeY + badgeH / 2 + 0.5);
        ctx.restore();

        // Artist Name & Hours Below Bubble
        ctx.save();
        ctx.textAlign = "center";
        ctx.shadowColor = "rgba(0, 0, 0, 0.95)";
        ctx.shadowBlur = 5;

        let dispName = node.name;
        if (dispName.length > 15) dispName = dispName.slice(0, 14) + "…";

        ctx.font = isHovered ? "bold 12px Inter, -apple-system, sans-serif" : "600 11px Inter, -apple-system, sans-serif";
        ctx.fillStyle = isHovered ? "#FFFFFF" : "rgba(255, 255, 255, 0.92)";
        ctx.fillText(dispName, node.x, node.y + r + 15);

        ctx.font = "500 9.5px Inter, -apple-system, sans-serif";
        ctx.fillStyle = isHovered ? "#FF6B81" : "rgba(255, 255, 255, 0.6)";
        ctx.fillText(`${node.hours}h • ${node.plays}p`, node.x, node.y + r + 28);
        ctx.restore();
      });

      this.constellationAnimId = requestAnimationFrame(animate);
    };

    animate();
  }

  async openArtistDrawer(artistObj) {
    if (!artistObj) return;

    const drawer = document.getElementById("artist-slide-drawer");
    const nameEl = document.getElementById("drawer-artist-name");
    const statsEl = document.getElementById("drawer-artist-stats");
    const portraitEl = document.getElementById("drawer-artist-portrait");
    const listEl = document.getElementById("drawer-artist-tracklist");

    if (nameEl) nameEl.textContent = artistObj.name;
    if (statsEl) statsEl.textContent = `${artistObj.hours} hrs listened • ${artistObj.plays} plays • ${artistObj.uniqueTracksCount} songs`;

    const portrait = await artEngine.getArtistPortrait(
      artistObj.name,
      this.masterState.searchHistory,
      this.masterState.portraitMap,
      artistObj.topTracks
    );
    if (portraitEl) portraitEl.src = portrait;

    if (listEl) {
      listEl.innerHTML = artistObj.topTracks.map(t => {
        const art = artEngine.getTrackArtworkUrl(t, this.masterState.artMap);
        const mins = (t.ms / 60000).toFixed(1);
        return `
          <div class="inspector-mini-track" data-song-id="${t.id}" style="cursor:pointer;">
            <img class="inspector-mini-art" src="${art}" alt="" />
            <div class="inspector-mini-info">
              <div class="inspector-mini-title">${t.title}</div>
              <div class="inspector-mini-artist">${mins} mins • ${t.plays} plays</div>
            </div>
            <button style="background:transparent; border:none; color:var(--accent-crimson); font-size:14px; cursor:pointer;">▶</button>
          </div>
        `;
      }).join("");

      listEl.querySelectorAll(".inspector-mini-track").forEach(row => {
        row.onclick = () => {
          const id = row.getAttribute("data-song-id");
          const track = artistObj.topTracks.find(x => x.id === id);
          if (track) this.openSongDeepDive(track);
        };
      });
    }

    if (drawer) drawer.classList.remove("hidden");
  }

  /**
   * =========================================================================
   * TAB 4: Songs & Albums / Library (Reactive Search, Sort & Filters)
   * =========================================================================
   */
  renderTabSongsAlbums(filtered) {
    this.renderLibraryToolbar();
    this.filterAndRenderLibrary();
  }

  renderLibraryToolbar() {
    // 1. Subtab switcher
    const switcherBtns = document.querySelectorAll("#library-view-switcher .time-pill-btn");
    switcherBtns.forEach(btn => {
      btn.onclick = () => {
        switcherBtns.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        this.activeLibraryTab = btn.getAttribute("data-subtab");
        this.filterAndRenderLibrary();
      };
    });

    // 2. Search input & clear button
    const searchInput = document.getElementById("library-search-input");
    const clearBtn = document.getElementById("library-search-clear");

    if (searchInput) {
      searchInput.oninput = e => {
        this.librarySearchQuery = e.target.value.toLowerCase().trim();
        if (clearBtn) clearBtn.classList.toggle("hidden", this.librarySearchQuery.length === 0);
        this.filterAndRenderLibrary();
      };
    }

    if (clearBtn && searchInput) {
      clearBtn.onclick = () => {
        searchInput.value = "";
        this.librarySearchQuery = "";
        clearBtn.classList.add("hidden");
        this.filterAndRenderLibrary();
      };
    }

    // 3. Sort selector
    const sortSelect = document.getElementById("library-sort-select");
    if (sortSelect) {
      sortSelect.onchange = e => {
        this.librarySortBy = e.target.value;
        this.filterAndRenderLibrary();
      };
    }

    // 4. Cultural / Sonic World Filter Pills
    const worldPills = document.querySelectorAll("#library-world-pills .world-filter-pill");
    worldPills.forEach(pill => {
      pill.onclick = () => {
        worldPills.forEach(p => p.classList.remove("active"));
        pill.classList.add("active");
        this.libraryGenreFilter = pill.getAttribute("data-world");
        this.filterAndRenderLibrary();
      };
    });
  }

  filterAndRenderLibrary() {
    let tracks = [...this.masterState.tracks];

    // Search query filter
    if (this.librarySearchQuery) {
      tracks = tracks.filter(t => 
        (t.title || "").toLowerCase().includes(this.librarySearchQuery) ||
        (t.artist || "").toLowerCase().includes(this.librarySearchQuery) ||
        (t.album || "").toLowerCase().includes(this.librarySearchQuery)
      );
    }

    // Genre filter
    if (this.libraryGenreFilter !== "all") {
      tracks = tracks.filter(t => {
        const world = PulseAnalytics.classifyCulturalWorld(t);
        return world.name === this.libraryGenreFilter;
      });
    }

    // Sort tracks
    tracks.sort((a, b) => {
      if (this.librarySortBy === "hours-desc") return (b.ms || 0) - (a.ms || 0);
      if (this.librarySortBy === "plays-desc") return (b.plays || 0) - (a.plays || 0);
      if (this.librarySortBy === "days-desc") {
        const da = a.days ? Object.keys(a.days).length : 0;
        const db = b.days ? Object.keys(b.days).length : 0;
        return db - da || (b.ms || 0) - (a.ms || 0);
      }
      if (this.librarySortBy === "recent-desc") return (b.last || 0) - (a.last || 0);
      if (this.librarySortBy === "title-asc") return (a.title || "").localeCompare(b.title || "");
      return 0;
    });

    const counter = document.getElementById("library-results-counter");
    if (counter) {
      counter.textContent = `Showing ${tracks.length} of ${this.masterState.tracks.length} songs`;
    }

    // Switch view containers
    document.getElementById("view-library-songs")?.classList.toggle("hidden", this.activeLibraryTab !== "all-songs");
    document.getElementById("view-library-albums")?.classList.toggle("hidden", this.activeLibraryTab !== "albums");
    document.getElementById("view-library-consistent")?.classList.toggle("hidden", this.activeLibraryTab !== "consistent");
    document.getElementById("view-library-skipped")?.classList.toggle("hidden", this.activeLibraryTab !== "skipped");

    if (this.activeLibraryTab === "all-songs") {
      this.renderLibrarySongsList(tracks);
    } else if (this.activeLibraryTab === "albums") {
      this.renderLibraryAlbumsGrid(tracks);
    } else if (this.activeLibraryTab === "consistent") {
      this.renderLibraryConsistentList(tracks);
    } else if (this.activeLibraryTab === "skipped") {
      this.renderLibrarySkippedList(tracks);
    }
  }

  renderLibrarySongsList(tracks) {
    const container = document.getElementById("library-songs-rows");
    if (!container) return;

    const maxMs = tracks[0]?.ms || 1;

    container.innerHTML = tracks.slice(0, 80).map((t, idx) => {
      const art = artEngine.getTrackArtworkUrl(t, this.masterState.artMap);
      const mins = Math.round((t.ms || 0) / 60000);
      const sharePct = Math.min(100, Math.max(4, Math.round(((t.ms || 0) / maxMs) * 100)));
      const daysCount = t.days ? Math.min(8, Object.keys(t.days).length) : 0;
      const dotsHtml = Array.from({ length: daysCount }).map(() => `<span class="consistency-dot"></span>`).join("");

      return `
        <div class="apple-track-row" data-track-id="${t.id}">
          <span class="track-col-rank">${idx + 1}</span>
          <div class="track-art-box">
            <img src="${art}" alt="" />
            <div class="track-hover-play">▶</div>
          </div>
          <div class="track-col-title-artist">
            <div class="track-row-title">${t.title}</div>
            <div class="track-row-artist">${t.artist}</div>
          </div>
          <div class="track-col-album">${t.album || "Single"}</div>
          <div class="track-col-dots" title="${daysCount} active listening days">${dotsHtml}</div>
          <div class="track-col-plays-time">
            <span class="track-plays-text">${t.plays} plays • ${mins}m</span>
            <div class="track-share-bar-bg">
              <div class="track-share-bar-fill" style="width:${sharePct}%"></div>
            </div>
          </div>
        </div>
      `;
    }).join("");

    container.querySelectorAll(".apple-track-row").forEach(row => {
      const id = row.getAttribute("data-track-id");
      const track = tracks.find(x => x.id === id);
      row.onclick = () => { if (track) this.openSongDeepDive(track); };
    });
  }

  renderLibraryAlbumsGrid(tracks) {
    const grid = document.getElementById("library-albums-grid");
    if (!grid) return;

    const albumMap = new Map();
    tracks.forEach(track => {
      const name = track.album || "Single / Unspecified";
      if (!albumMap.has(name)) {
        albumMap.set(name, {
          album: name,
          artist: track.primaryArtist,
          id: track.id,
          art: track.art,
          totalMs: 0,
          totalPlays: 0,
          tracks: []
        });
      }
      const alb = albumMap.get(name);
      alb.totalMs += track.ms || 0;
      alb.totalPlays += track.plays || 0;
      alb.tracks.push(track);
    });

    const albums = Array.from(albumMap.values()).sort((a, b) => b.totalMs - a.totalMs);

    grid.innerHTML = albums.map(alb => {
      const art = artEngine.getTrackArtworkUrl(alb, this.masterState.artMap);
      const hours = (alb.totalMs / 3600000).toFixed(1);
      return `
        <div class="album-apple-card" data-album-name="${encodeURIComponent(alb.album)}">
          <img class="album-art-square" src="${art}" alt="" />
          <div class="album-apple-title">${alb.album}</div>
          <div class="album-apple-artist">${alb.artist}</div>
          <div class="album-apple-time">${hours}h • ${alb.tracks.length} tracks</div>
        </div>
      `;
    }).join("");

    grid.querySelectorAll(".album-apple-card").forEach(card => {
      const name = decodeURIComponent(card.getAttribute("data-album-name"));
      const alb = albums.find(a => a.album === name);
      card.onclick = () => { if (alb) this.openAlbumDeepDive(alb); };
    });
  }

  renderLibraryConsistentList(tracks) {
    const container = document.getElementById("library-consistent-rows");
    if (!container) return;

    const consistentTracks = [...tracks].sort((a, b) => {
      const da = a.days ? Object.keys(a.days).length : 0;
      const db = b.days ? Object.keys(b.days).length : 0;
      return db - da || b.ms - a.ms;
    });

    container.innerHTML = consistentTracks.slice(0, 40).map((t, idx) => {
      const art = artEngine.getTrackArtworkUrl(t, this.masterState.artMap);
      const daysCount = t.days ? Object.keys(t.days).length : 0;
      const mins = Math.round((t.ms || 0) / 60000);

      return `
        <div class="apple-track-row" data-track-id="${t.id}">
          <span class="track-col-rank">#${idx + 1}</span>
          <div class="track-art-box">
            <img src="${art}" alt="" />
            <div class="track-hover-play">▶</div>
          </div>
          <div class="track-col-title-artist">
            <div class="track-row-title">${t.title}</div>
            <div class="track-row-artist">${t.artist}</div>
          </div>
          <div style="font-weight:700; color:var(--accent-crimson); font-size:13.5px;">
            🔥 ${daysCount} Active Days
          </div>
          <div class="track-col-plays-time">
            <span class="track-plays-text">${t.plays} plays • ${mins}m</span>
          </div>
        </div>
      `;
    }).join("");

    container.querySelectorAll(".apple-track-row").forEach(row => {
      const id = row.getAttribute("data-track-id");
      const track = consistentTracks.find(x => x.id === id);
      row.onclick = () => { if (track) this.openSongDeepDive(track); };
    });
  }

  renderLibrarySkippedList(tracks) {
    const container = document.getElementById("library-skipped-rows");
    if (!container) return;

    const skippedTracks = tracks.filter(t => (t.ms || 0) > 0 && (t.plays || 0) === 0);

    if (skippedTracks.length === 0) {
      container.innerHTML = `
        <div style="text-align:center; padding:40px; color:var(--text-tertiary); font-size:13px;">
          No skipped or partial tracks matching current filters.
        </div>
      `;
      return;
    }

    container.innerHTML = skippedTracks.slice(0, 40).map((t, idx) => {
      const art = artEngine.getTrackArtworkUrl(t, this.masterState.artMap);
      const mins = ((t.ms || 0) / 60000).toFixed(1);

      return `
        <div class="apple-track-row" data-track-id="${t.id}">
          <span class="track-col-rank">${idx + 1}</span>
          <div class="track-art-box">
            <img src="${art}" alt="" />
            <div class="track-hover-play">▶</div>
          </div>
          <div class="track-col-title-artist">
            <div class="track-row-title">${t.title}</div>
            <div class="track-row-artist">${t.artist}</div>
          </div>
          <div style="color:var(--accent-rose); font-size:12px; font-weight:600;">
            Partial Listen (${mins}m)
          </div>
          <div class="track-col-plays-time">
            <span class="track-plays-text" style="color:var(--text-tertiary);">0 Completed Plays</span>
          </div>
        </div>
      `;
    }).join("");

    container.querySelectorAll(".apple-track-row").forEach(row => {
      const id = row.getAttribute("data-track-id");
      const track = skippedTracks.find(x => x.id === id);
      row.onclick = () => { if (track) this.openSongDeepDive(track); };
    });
  }

  /**
   * Song Deep-Dive Modal
   */
  openSongDeepDive(track) {
    if (!track) return;

    const modal = document.getElementById("song-deepdive-modal");
    const artEl = document.getElementById("deepdive-song-art");
    const titleEl = document.getElementById("deepdive-song-title");
    const artistEl = document.getElementById("deepdive-song-artist");
    const albumEl = document.getElementById("deepdive-song-album");
    const hoursChip = document.getElementById("deepdive-chip-hours");
    const playsChip = document.getElementById("deepdive-chip-plays");
    const daysChip = document.getElementById("deepdive-chip-days");

    const artUrl = artEngine.getTrackArtworkUrl(track, this.masterState.artMap);
    if (artEl) artEl.src = artUrl;
    if (titleEl) titleEl.textContent = track.title || "Song Title";
    if (artistEl) artistEl.textContent = track.artist || "Artist";
    if (albumEl) albumEl.textContent = track.album || "Single";

    const mins = Math.round((track.ms || 0) / 60000);
    const hours = ((track.ms || 0) / 3600000).toFixed(1);
    const daysCount = track.days ? Object.keys(track.days).length : 0;

    if (hoursChip) hoursChip.textContent = `${hours}h (${mins} mins)`;
    if (playsChip) playsChip.textContent = `${track.plays || 0} plays`;
    if (daysChip) daysChip.textContent = `${daysCount} active days`;

    // Render daily history mini bar chart
    this.renderSongDailyHistoryChart(track);

    // Audio preview & YouTube triggers
    const playTrigger = document.getElementById("deepdive-play-trigger");
    const listenNowBtn = document.getElementById("deepdive-listen-now-btn");
    const youtubeBtn = document.getElementById("deepdive-youtube-btn");

    const handlePlay = () => {
      const previewUrl = this.masterState.artMap[track.id]?.previewUrl || null;
      pulsePlayer.playTrack(track, artUrl, previewUrl);
    };

    if (playTrigger) playTrigger.onclick = handlePlay;
    if (listenNowBtn) listenNowBtn.onclick = handlePlay;
    if (youtubeBtn) {
      youtubeBtn.onclick = () => {
        window.open(`https://www.youtube.com/watch?v=${track.id}`, "_blank");
      };
    }

    if (modal) modal.classList.remove("hidden");
  }

  renderSongDailyHistoryChart(track) {
    const canvas = document.getElementById("chart-deepdive-daily-history");
    if (!canvas || typeof Chart === "undefined") return;

    if (this.charts.songDailyHistory) this.charts.songDailyHistory.destroy();

    const daysEntries = Object.entries(track.days || {}).sort((a, b) => a[0].localeCompare(b[0]));
    const labels = daysEntries.map(e => {
      const parts = e[0].split("-");
      return `${parts[1]}/${parts[2]}`;
    });
    const dataValues = daysEntries.map(e => Math.round((e[1].ms || 0) / 60000));

    this.charts.songDailyHistory = new Chart(canvas, {
      type: "bar",
      data: {
        labels: labels.length > 0 ? labels : ["No Days"],
        datasets: [
          {
            data: dataValues.length > 0 ? dataValues : [0],
            backgroundColor: "rgba(250, 36, 60, 0.8)",
            borderRadius: 5
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "rgba(18, 18, 24, 0.94)",
            borderColor: "rgba(255, 255, 255, 0.12)",
            borderWidth: 1,
            callbacks: {
              label: ctx => ` ${ctx.parsed.y} mins played`
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: "rgba(255, 255, 255, 0.4)", font: { family: "Inter", size: 10 } }
          },
          y: {
            grid: { color: "rgba(255, 255, 255, 0.04)" },
            ticks: { color: "rgba(255, 255, 255, 0.4)", font: { family: "Inter", size: 10 }, callback: v => `${v}m` }
          }
        }
      }
    });
  }

  /**
   * Album Deep-Dive Modal
   */
  openAlbumDeepDive(albumObj) {
    if (!albumObj) return;

    const modal = document.getElementById("album-deepdive-modal");
    const artEl = document.getElementById("album-deepdive-art");
    const titleEl = document.getElementById("album-deepdive-title");
    const artistEl = document.getElementById("album-deepdive-artist");
    const metaEl = document.getElementById("album-deepdive-meta");
    const listEl = document.getElementById("album-deepdive-tracklist");

    const artUrl = artEngine.getTrackArtworkUrl(albumObj, this.masterState.artMap);
    if (artEl) artEl.src = artUrl;
    if (titleEl) titleEl.textContent = albumObj.album;
    if (artistEl) artistEl.textContent = albumObj.artist;
    if (metaEl) metaEl.textContent = `${(albumObj.totalMs / 3600000).toFixed(1)} hrs • ${albumObj.tracks.length} songs`;

    if (listEl) {
      listEl.innerHTML = albumObj.tracks.map((t, idx) => {
        const mins = Math.round((t.ms || 0) / 60000);
        return `
          <div class="inspector-mini-track" data-track-id="${t.id}" style="cursor:pointer;">
            <span style="font-family:var(--font-mono); font-size:12px; color:var(--text-tertiary); width:20px;">${idx + 1}</span>
            <div class="inspector-mini-info">
              <div class="inspector-mini-title">${t.title}</div>
              <div class="inspector-mini-artist">${mins} mins • ${t.plays} plays</div>
            </div>
            <button style="background:transparent; border:none; color:var(--accent-crimson); font-size:14px; cursor:pointer;">▶</button>
          </div>
        `;
      }).join("");

      listEl.querySelectorAll(".inspector-mini-track").forEach(item => {
        const id = item.getAttribute("data-track-id");
        const track = albumObj.tracks.find(x => x.id === id);
        item.onclick = () => { if (track) this.openSongDeepDive(track); };
      });
    }

    if (modal) modal.classList.remove("hidden");
  }

  /**
   * =========================================================================
   * TAB 5: DNA & Audio Rig (Sonic Worlds, EQ & Search Strip)
   * =========================================================================
   */
  renderTabDnaRig(filtered) {
    const cultural = PulseAnalytics.computeCulturalWorldsAndGraph(filtered);

    this.renderSonicWorldsChart(cultural);

    const breakdownList = document.getElementById("sonic-worlds-breakdown-list");
    if (breakdownList) {
      breakdownList.innerHTML = cultural.culturalDistribution.map(c => `
        <div style="display:flex; justify-content:space-between; align-items:center; font-size:13px; color:var(--text-secondary);">
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="width:8px; height:8px; border-radius:50%; background:${c.color};"></span>
            <span>${c.name}</span>
          </div>
          <span style="font-family:var(--font-mono); color:#fff; font-weight:600;">${c.percent}%</span>
        </div>
      `).join("");
    }

    this.renderAudiophileEqChart();

    const carousel = document.getElementById("search-discovery-carousel");
    if (carousel && this.masterState.searchHistory) {
      carousel.innerHTML = this.masterState.searchHistory.slice(0, 15).map(item => {
        const art = artEngine.upscaleGoogleImageUrl(item.artworkUrl) || "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=200";
        return `
          <div class="search-chip-card">
            <img class="search-chip-art" src="${art}" alt="" />
            <div>
              <div class="search-chip-title">${item.title}</div>
              <div class="search-chip-sub">${item.subtitle || item.entityType}</div>
            </div>
          </div>
        `;
      }).join("");
    }
  }

  renderSonicWorldsChart(culturalData) {
    const canvas = document.getElementById("chart-sonic-worlds");
    if (!canvas || typeof Chart === "undefined") return;

    if (this.charts.sonicWorlds) this.charts.sonicWorlds.destroy();

    this.charts.sonicWorlds = new Chart(canvas, {
      type: "doughnut",
      data: {
        labels: culturalData.culturalDistribution.map(c => c.name),
        datasets: [
          {
            data: culturalData.culturalDistribution.map(c => c.percent),
            backgroundColor: culturalData.culturalDistribution.map(c => c.color),
            borderColor: "#09090B",
            borderWidth: 3,
            cutout: "70%"
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "rgba(18, 18, 24, 0.94)",
            borderColor: "rgba(255, 255, 255, 0.12)",
            borderWidth: 1,
            callbacks: {
              label: ctx => ` ${ctx.label}: ${ctx.parsed}%`
            }
          }
        }
      }
    });
  }

  renderAudiophileEqChart() {
    const canvas = document.getElementById("chart-audiophile-eq");
    if (!canvas || typeof Chart === "undefined") return;

    if (this.charts.audiophileEq) this.charts.audiophileEq.destroy();

    const bands = this.masterState.audiophile?.equalizerBands || [2.5, 3.5, 2.5, 1.0, 1.0, 3.0, 3.0];
    const labels = ["32Hz", "64Hz", "125Hz", "500Hz", "1kHz", "4kHz", "16kHz"];

    const ctx = canvas.getContext("2d");
    const gradient = ctx.createLinearGradient(0, 0, 0, 180);
    gradient.addColorStop(0, "rgba(250, 36, 60, 0.35)");
    gradient.addColorStop(1, "rgba(250, 36, 60, 0.0)");

    this.charts.audiophileEq = new Chart(canvas, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            data: bands,
            borderColor: "#FA243C",
            backgroundColor: gradient,
            borderWidth: 2.5,
            tension: 0.45,
            fill: true,
            pointBackgroundColor: "#FFFFFF",
            pointBorderColor: "#FA243C",
            pointBorderWidth: 2,
            pointRadius: 4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "rgba(18, 18, 24, 0.94)",
            borderColor: "rgba(255, 255, 255, 0.12)",
            borderWidth: 1,
            callbacks: {
              label: ctx => ` Gain: ${ctx.parsed.y > 0 ? "+" : ""}${ctx.parsed.y} dB`
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: "rgba(255, 255, 255, 0.4)", font: { family: "Inter", size: 10 } }
          },
          y: {
            min: -5,
            max: 5,
            grid: { color: "rgba(255, 255, 255, 0.04)" },
            ticks: {
              color: "rgba(255, 255, 255, 0.4)",
              font: { family: "Inter", size: 10 },
              callback: v => `${v > 0 ? "+" : ""}${v}dB`
            }
          }
        }
      }
    });
  }

  /**
   * =========================================================================
   * Event Listeners & Tab Switching
   * =========================================================================
   */
  attachEventListeners() {
    // 1. Sidebar Tab Switching (Desktop) & Bottom Tab Bar (Mobile)
    const handleTabChange = targetTab => {
      this.switchAppTab(targetTab);
    };

    document.querySelectorAll(".nav-tab-btn, .mobile-tab-btn").forEach(btn => {
      btn.onclick = () => {
        const targetTab = btn.getAttribute("data-tab");
        handleTabChange(targetTab);
      };
    });

    // 1b. Inter-Tab Section Jump Buttons (Navigate from Listen Now cards directly to full detail tabs)
    document.addEventListener("click", e => {
      const jumpBtn = e.target.closest(".btn-section-jump");
      if (jumpBtn) {
        const targetTab = jumpBtn.getAttribute("data-target-tab");
        if (targetTab) {
          this.switchAppTab(targetTab);
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
      }
    });

    // 2. Master Mode Switcher Buttons (Listen Now)
    document.querySelectorAll("#ln-master-mode-switcher .master-pill-btn").forEach(btn => {
      btn.onclick = () => {
        const mode = btn.getAttribute("data-mode");
        this.setListenNowMode(mode);
      };
    });

    // 3. Timeframe selector buttons in header
    const timePills = document.querySelectorAll(".time-segmented-pill .time-pill-btn");
    timePills.forEach(pill => {
      pill.onclick = () => {
        timePills.forEach(p => p.classList.remove("active"));
        pill.classList.add("active");
        this.currentTimeframe = pill.getAttribute("data-timeframe");
        this.renderApplication();
      };
    });

    // 4. Heatmap View Toggle (GitHub Matrix vs. Month Calendar Cover View)
    const heatmapViewBtns = document.querySelectorAll("#heatmap-view-toggle .view-toggle-btn");
    heatmapViewBtns.forEach(btn => {
      btn.onclick = () => {
        heatmapViewBtns.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        this.heatmapViewMode = btn.getAttribute("data-view");
        this.renderTabTimeRhythm();
      };
    });

    // 5. Monthly Metric Toggle in Time tab
    const toggleMonthMetricBtn = document.getElementById("btn-toggle-month-metric");
    if (toggleMonthMetricBtn) {
      toggleMonthMetricBtn.onclick = () => {
        this.monthMetric = this.monthMetric === "hours" ? "plays" : "hours";
        toggleMonthMetricBtn.textContent = `Metric: ${this.monthMetric === "hours" ? "Hours" : "Plays"}`;
        const filteredMonth = PulseAnalytics.filterState(this.masterState, this.selectedMonth, false);
        const monthlyYearly = PulseAnalytics.computeMonthlyAndYearly(this.masterState, filteredMonth);
        this.renderMonthlyHorizonChart(monthlyYearly);
      };
    }

    // 6. Replay Story Mode
    const triggerReplay = () => {
      if (this.masterState) {
        const filtered = PulseAnalytics.filterState(this.masterState, this.currentTimeframe, false);
        bitChordWrapped.open(this.masterState, filtered);
      }
    };
    const sidebarReplayBtn = document.getElementById("btn-sidebar-replay");
    if (sidebarReplayBtn) sidebarReplayBtn.onclick = triggerReplay;

    // 7. Update Backup buttons
    const fileInput = document.getElementById("global-file-input");
    const updateBtns = [
      document.getElementById("btn-header-update"),
      document.getElementById("btn-sidebar-update")
    ];

    updateBtns.forEach(btn => {
      if (btn && fileInput) btn.onclick = () => fileInput.click();
    });

    if (fileInput) {
      fileInput.onchange = async e => {
        if (e.target.files && e.target.files.length > 0) {
          await this.handleFileIngest(e.target.files[0]);
          fileInput.value = "";
        }
      };
    }

    // 8. Drag & Drop
    window.addEventListener("dragover", e => e.preventDefault());
    window.addEventListener("drop", async e => {
      e.preventDefault();
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        await this.handleFileIngest(e.dataTransfer.files[0]);
      }
    });

    // 9. Demo backup loader
    document.querySelectorAll(".btn-load-demo-backup").forEach(btn => {
      btn.onclick = async () => {
        this.showToast("Loading Demo...", "Fetching repository backup", "info");
        try {
          let res = await fetch("./bitchord-backup.json");
          if (!res.ok) res = await fetch("./bitchord-backup-2026-11-04.json");
          if (!res.ok) throw new Error("Built-in demo backup not found.");
          const rawJson = await res.json();
          const diff = await pulseDB.syncBackup(rawJson, "bitchord-backup-demo.json");
          await this.loadDatabase();
          this.triggerSyncCelebration(diff);
        } catch (err) {
          this.showToast("Demo Error", err.message, "error");
        }
      };
    });

    // 10. Drawer close
    const drawerCloseBtn = document.getElementById("drawer-artist-close");
    if (drawerCloseBtn) {
      drawerCloseBtn.onclick = () => {
        document.getElementById("artist-slide-drawer")?.classList.add("hidden");
      };
    }

    // 11. Database Manager Modal
    const dbBtn = document.getElementById("btn-sidebar-db");
    const dbModal = document.getElementById("database-manager-modal");
    if (dbBtn && dbModal) {
      dbBtn.onclick = () => {
        this.renderDatabaseHistory();
        dbModal.classList.remove("hidden");
      };
    }

    // 12. Modal close triggers
    document.querySelectorAll(".modal-close-trigger").forEach(btn => {
      btn.onclick = () => {
        btn.closest(".modal-overlay")?.classList.add("hidden");
      };
    });

    // Export Master JSON
    const exportBtn = document.getElementById("btn-export-master-json");
    if (exportBtn) {
      exportBtn.onclick = async () => {
        const jsonStr = await pulseDB.exportMasterBackup();
        const blob = new Blob([jsonStr], { type: "application/json" });
        const link = document.createElement("a");
        link.download = `bitchord-master-backup-${new Date().toISOString().split("T")[0]}.json`;
        link.href = URL.createObjectURL(blob);
        link.click();
      };
    }

    // Reset DB
    const resetBtn = document.getElementById("btn-reset-database");
    if (resetBtn) {
      resetBtn.onclick = async () => {
        if (confirm("Reset and clear all BitChord Pulse records?")) {
          await pulseDB.resetDatabase();
          location.reload();
        }
      };
    }
  }

  switchAppTab(targetTab) {
    if (targetTab === this.currentTab) return;

    document.querySelectorAll(".nav-tab-btn, .mobile-tab-btn").forEach(btn => {
      btn.classList.toggle("active", btn.getAttribute("data-tab") === targetTab);
    });

    document.querySelectorAll(".app-tab-panel").forEach(p => p.classList.remove("active"));
    const targetPanel = document.getElementById(`tab-${targetTab}`);
    if (targetPanel) targetPanel.classList.add("active");

    this.currentTab = targetTab;
    const headerTitle = document.getElementById("header-tab-title");
    const titleMap = {
      "listen-now": "Listen Now",
      "time-rhythm": "Time & Rhythm",
      "artists": "Artists",
      "songs-albums": "Songs & Albums",
      "dna-rig": "DNA & Audio Rig"
    };
    if (headerTitle) headerTitle.textContent = titleMap[targetTab] || "Observatory";

    if (this.masterState) {
      const filtered = PulseAnalytics.filterState(this.masterState, this.currentTimeframe, false);
      if (targetTab === "listen-now") this.renderTabListenNow(filtered);
      if (targetTab === "time-rhythm") this.renderTabTimeRhythm();
      if (targetTab === "artists") this.renderTabArtists(filtered);
      if (targetTab === "songs-albums") this.renderTabSongsAlbums(filtered);
      if (targetTab === "dna-rig") {
        this.renderSonicWorldsChart(PulseAnalytics.computeCulturalWorldsAndGraph(filtered));
        this.renderAudiophileEqChart();
      }
    }
  }

  async handleFileIngest(file) {
    if (!file) return;
    this.showToast("Syncing Backup...", `Analyzing ${file.name}`, "info");

    try {
      const text = await file.text();
      const rawJson = JSON.parse(text);
      const diff = await pulseDB.syncBackup(rawJson, file.name);
      await this.loadDatabase();
      this.triggerSyncCelebration(diff);
    } catch (err) {
      console.error("Sync error", err);
      this.showToast("Sync Error", err.message, "error");
    }
  }

  triggerSyncCelebration(diff) {
    if (typeof confetti === "function") {
      confetti({
        particleCount: 70,
        spread: 60,
        origin: { y: 0.6 },
        colors: ["#FA243C", "#FF5E7E", "#FF8A9E", "#FFFFFF"]
      });
    }

    const mins = Math.round(diff.deltaMsAdded / 60000);
    this.showToast("Sync Complete", `+${mins}m listened, +${diff.deltaPlaysAdded} plays, +${diff.newTracksCount} songs`, "success");

    const diffModal = document.getElementById("sync-diff-modal");
    if (diffModal) {
      document.getElementById("diff-modal-filename").textContent = diff.fileName;
      document.getElementById("diff-modal-time").textContent = `+${mins}m`;
      document.getElementById("diff-modal-plays").textContent = `+${diff.deltaPlaysAdded}`;
      document.getElementById("diff-modal-newtracks").textContent = `+${diff.newTracksCount}`;
      document.getElementById("diff-modal-totalhours").textContent = `${diff.totalHours}h`;
      diffModal.classList.remove("hidden");
    }
  }

  renderDatabaseHistory() {
    const tbody = document.getElementById("db-history-tbody");
    if (!tbody || !this.masterState) return;

    tbody.innerHTML = (this.masterState.syncHistory || []).map(h => `
      <tr style="border-bottom: 1px solid rgba(255,255,255,0.04);">
        <td style="padding:8px 12px;">${new Date(h.uploadedAt).toLocaleDateString()}</td>
        <td style="padding:8px 12px; max-width:140px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${h.fileName}</td>
        <td style="padding:8px 12px; color:var(--accent-crimson);">+${Math.round(h.deltaMsAdded / 60000)}m</td>
        <td style="padding:8px 12px;">+${h.deltaPlaysAdded}</td>
        <td style="padding:8px 12px; font-weight:700;">${h.totalHours}h</td>
      </tr>
    `).join("");
  }

  renderEmptyState(isEmpty) {
    const dropzone = document.getElementById("initial-empty-dropzone");
    const mainArea = document.getElementById("main-tab-content-area");

    if (isEmpty) {
      if (dropzone) dropzone.classList.remove("hidden");
      if (mainArea) mainArea.classList.add("hidden");
    } else {
      if (dropzone) dropzone.classList.add("hidden");
      if (mainArea) mainArea.classList.remove("hidden");
    }
  }

  showToast(title, message, type = "info") {
    let container = document.getElementById("pulse-toast-container");
    if (!container) {
      container = document.createElement("div");
      container.id = "pulse-toast-container";
      container.style.cssText = "position:fixed; top:20px; right:24px; z-index:9999; display:flex; flex-direction:column; gap:8px;";
      document.body.appendChild(container);
    }

    const toast = document.createElement("div");
    toast.style.cssText = `
      background: rgba(18, 18, 24, 0.94);
      backdrop-filter: blur(25px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-left: 4px solid #FA243C;
      border-radius: 12px;
      padding: 10px 16px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6);
      min-width: 260px;
    `;
    toast.innerHTML = `
      <div style="font-weight:700; font-size:13px; color:#fff; margin-bottom:2px;">${title}</div>
      <div style="font-size:11.5px; color:rgba(255,255,255,0.7);">${message}</div>
    `;

    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transition = "opacity 0.3s ease";
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  // Format date utilities
  formatMonthName(monthStr) {
    if (!monthStr || monthStr === "all") return "All Months";
    const [year, month] = monthStr.split("-");
    const d = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
    return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  }

  formatMonthShort(monthStr) {
    if (!monthStr || monthStr === "all") return "All";
    const [year, month] = monthStr.split("-");
    const d = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
    return d.toLocaleDateString(undefined, { month: "short", year: "numeric" });
  }

  formatDateShort(dateStr) {
    if (!dateStr) return "";
    const parts = dateStr.split("-");
    const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  formatDateLong(dateStr) {
    if (!dateStr) return "";
    const parts = dateStr.split("-");
    const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const app = new BitChordPulseApp();
  window.__pulseApp = app;
  app.init();
});
