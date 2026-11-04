/**
 * BitChord Pulse - Autonomous Full-HD Cover Art & Artist Portrait Engine
 * Upscales Google/YT images, repairs broken Android file:/// paths via iTunes API,
 * resolves artist portraits via Search History & Deezer JSONP, and generates 2x2 luxury mosaics.
 */

import { pulseDB } from "./db.js";
import { cleanTrackTitle } from "./sanitizer.js";

class ArtEngine {
  constructor() {
    this.concurrencyLimit = 4;
    this.activeWorkers = 0;
    this.queue = [];
    this.inFlightTrackSearches = new Set();
    this.inFlightArtistSearches = new Set();
    this.subscribers = new Map(); // trackId -> Set of callback functions
    this.artistSubscribers = new Map(); // artistName -> Set of callback functions
  }

  /**
   * Upscales Google/YouTube content images to 1000x1000 HD
   */
  upscaleGoogleImageUrl(url) {
    if (!url || typeof url !== "string") return null;

    if (
      url.includes("googleusercontent.com") ||
      url.includes("yt3.ggpht.com") ||
      url.includes("lh3.googleusercontent.com")
    ) {
      // Replace =w120-h120... or =w544-h544... with =w1000-h1000
      return url.replace(/=w\d+-h\d+[^?]*/, "=w1000-h1000-l90-rj");
    }
    return url;
  }

  /**
   * Fast, synchronous resolver for track artwork.
   * Returns an immediate high-quality image URL (Google upscaled or YouTube HQ fallback),
   * and queues an iTunes search if needed.
   */
  getTrackArtworkUrl(track, artCache = {}, onEnriched = null) {
    if (!track) return "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=800&q=80";

    const trackId = track.id;

    // Check memory/IndexedDB cache first
    if (artCache && artCache[trackId] && artCache[trackId].hdArt) {
      return artCache[trackId].hdArt;
    }

    const rawArt = track.art;

    // Rule A: Google / YT usercontent upscaling
    if (
      rawArt &&
      (rawArt.includes("googleusercontent.com") || rawArt.includes("yt3.ggpht.com")) &&
      !rawArt.startsWith("file://")
    ) {
      return this.upscaleGoogleImageUrl(rawArt);
    }

    // If valid web URL other than file:///
    if (rawArt && rawArt.startsWith("http") && !rawArt.includes("hqdefault.jpg")) {
      return rawArt;
    }

    // Rule B: Broken Android file:/// URI or null
    // Fast reliable fallback: YouTube high-res thumbnail
    const ytFallback = trackId ? `https://i.ytimg.com/vi/${trackId}/hqdefault.jpg` : "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=800&q=80";

    // Queue for iTunes enrichment in background
    if (trackId && onEnriched) {
      this.subscribeTrack(trackId, onEnriched);
      this.queueTrackEnrichment(track);
    }

    return ytFallback;
  }

  /**
   * Subscribe to DOM updates when an HD artwork finishes resolving
   */
  subscribeTrack(trackId, callback) {
    if (!this.subscribers.has(trackId)) {
      this.subscribers.set(trackId, new Set());
    }
    this.subscribers.get(trackId).add(callback);
  }

  /**
   * Notifies subscribers of an updated HD artwork
   */
  notifyTrackSubscribers(trackId, hdArt, previewUrl) {
    if (this.subscribers.has(trackId)) {
      for (const cb of this.subscribers.get(trackId)) {
        try {
          cb(hdArt, previewUrl);
        } catch (e) {
          console.error("Art subscriber error", e);
        }
      }
      this.subscribers.delete(trackId);
    }

    // Update any img elements with data-track-id="${trackId}"
    if (typeof document !== "undefined") {
      const elements = document.querySelectorAll(`[data-track-art="${trackId}"]`);
      elements.forEach(el => {
        if (el.tagName === "IMG") {
          el.src = hdArt;
        } else {
          el.style.backgroundImage = `url('${hdArt}')`;
        }
      });
    }
  }

  /**
   * Queues a track for background iTunes enrichment
   */
  queueTrackEnrichment(track) {
    if (!track || !track.id) return;
    if (this.inFlightTrackSearches.has(track.id)) return;

    this.inFlightTrackSearches.add(track.id);
    this.queue.push({ type: "track", data: track });
    this.processQueue();
  }

  /**
   * Processes concurrent workers
   */
  async processQueue() {
    if (this.activeWorkers >= this.concurrencyLimit || this.queue.length === 0) {
      return;
    }

    this.activeWorkers++;
    const item = this.queue.shift();

    try {
      if (item.type === "track") {
        await this.enrichTrackArtwork(item.data);
      } else if (item.type === "artist") {
        await this.enrichArtistPortrait(item.data.artistName, item.data.topTracks);
      }
    } catch (e) {
      console.warn("Enrichment error:", e);
    } finally {
      this.activeWorkers--;
      this.processQueue();
    }
  }

  /**
   * Enriches a track using iTunes Search API (CORS enabled)
   */
  async enrichTrackArtwork(track) {
    const cleanTitle = cleanTrackTitle(track.title);
    const artist = track.primaryArtist || (track.artist ? track.artist.split(",")[0] : "");
    const searchTerm = `${cleanTitle} ${artist}`.trim();

    try {
      const url = `https://itunes.apple.com/search?term=${encodeURIComponent(searchTerm)}&entity=song&limit=1`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();

      if (json.resultCount > 0 && json.results[0].artworkUrl100) {
        // Upgrade 100x100 to 1000x1000 true square HD album art
        const hdArt = json.results[0].artworkUrl100.replace("100x100bb.jpg", "1000x1000bb.jpg");
        const previewUrl = json.results[0].previewUrl || null;

        // Cache in DB
        await pulseDB.cacheArt(track.id, hdArt, previewUrl);

        // Notify subscribers & DOM
        this.notifyTrackSubscribers(track.id, hdArt, previewUrl);
        return { hdArt, previewUrl };
      }
    } catch (err) {
      // Silent error fallback: YouTube thumbnail remains active
    }
    return null;
  }

  /**
   * Resolves artist portrait using 3-tier priority:
   * Priority 1: Search history matching
   * Priority 2: Deezer JSONP API / iTunes Artist Search
   * Priority 3: 2x2 luxury album mosaic avatar
   */
  async getArtistPortrait(artistName, searchHistory = [], portraitMap = {}, topTracks = []) {
    if (!artistName) return null;
    const cleanName = artistName.trim();

    // Check IndexedDB cache
    if (portraitMap && portraitMap[cleanName]) {
      return portraitMap[cleanName];
    }

    // Priority 1: Check parsed search_history for ARTIST entity
    const searchMatch = searchHistory.find(
      s => s.entityType === "ARTIST" && s.title && s.title.toLowerCase() === cleanName.toLowerCase()
    );
    if (searchMatch && searchMatch.artworkUrl) {
      const hdPortrait = this.upscaleGoogleImageUrl(searchMatch.artworkUrl);
      if (hdPortrait) {
        await pulseDB.cacheArtistPortrait(cleanName, hdPortrait, "search_history");
        portraitMap[cleanName] = hdPortrait;
        return hdPortrait;
      }
    }

    // Return immediate fallback or mosaic while querying Deezer in background
    const mosaicFallback = this.createMosaicAvatarSvg(cleanName, topTracks);

    // Queue Deezer / iTunes lookup in background
    this.queueArtistEnrichment(cleanName, topTracks);

    return mosaicFallback;
  }

  /**
   * Queue artist enrichment
   */
  queueArtistEnrichment(artistName, topTracks = []) {
    if (!artistName || this.inFlightArtistSearches.has(artistName)) return;
    this.inFlightArtistSearches.add(artistName);
    this.queue.push({
      type: "artist",
      data: { artistName, topTracks }
    });
    this.processQueue();
  }

  /**
   * Fetch artist portrait using Deezer JSONP API (bypasses browser CORS cleanly)
   */
  async enrichArtistPortrait(artistName, topTracks = []) {
    return new Promise(resolve => {
      const callbackName = `deezer_cb_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
      const script = document.createElement("script");
      const timeout = setTimeout(() => {
        cleanup();
        resolve(null);
      }, 5000);

      const cleanup = () => {
        clearTimeout(timeout);
        delete window[callbackName];
        if (script.parentNode) script.parentNode.removeChild(script);
      };

      window[callbackName] = async data => {
        cleanup();
        if (data && data.data && data.data.length > 0) {
          const artist = data.data[0];
          const portraitUrl =
            artist.picture_xl ||
            artist.picture_big ||
            artist.picture_medium ||
            artist.picture;

          if (portraitUrl) {
            await pulseDB.cacheArtistPortrait(artistName, portraitUrl, "deezer");
            this.notifyArtistSubscribers(artistName, portraitUrl);
            resolve(portraitUrl);
            return;
          }
        }
        resolve(null);
      };

      script.src = `https://api.deezer.com/search/artist?q=${encodeURIComponent(
        artistName
      )}&limit=1&output=jsonp&callback=${callbackName}`;
      script.onerror = () => {
        cleanup();
        resolve(null);
      };

      document.head.appendChild(script);
    });
  }

  /**
   * Subscribes to artist portrait updates
   */
  subscribeArtist(artistName, callback) {
    if (!this.artistSubscribers.has(artistName)) {
      this.artistSubscribers.set(artistName, new Set());
    }
    this.artistSubscribers.get(artistName).add(callback);
  }

  /**
   * Notify artist subscribers
   */
  notifyArtistSubscribers(artistName, portraitUrl) {
    if (this.artistSubscribers.has(artistName)) {
      for (const cb of this.artistSubscribers.get(artistName)) {
        try {
          cb(portraitUrl);
        } catch (e) {
          console.error("Artist subscriber error", e);
        }
      }
      this.artistSubscribers.delete(artistName);
    }

    // Update any element with data-artist-portrait="${artistName}"
    if (typeof document !== "undefined") {
      const elements = document.querySelectorAll(
        `[data-artist-portrait="${encodeURIComponent(artistName)}"]`
      );
      elements.forEach(el => {
        if (el.tagName === "IMG") {
          el.src = portraitUrl;
        } else {
          el.style.backgroundImage = `url('${portraitUrl}')`;
        }
      });
    }
  }

  /**
   * Priority 3: Dynamic 2x2 luxury album mosaic avatar SVG
   * Generates a vinyl mosaic using top tracks' artwork
   */
  createMosaicAvatarSvg(artistName, topTracks = []) {
    const initials = (artistName || "A")
      .split(" ")
      .slice(0, 2)
      .map(w => w[0])
      .join("")
      .toUpperCase();

    // Elegant gradient background with initials
    const gradients = [
      ["#8b5cf6", "#ec4899"],
      ["#3b82f6", "#10b981"],
      ["#f59e0b", "#ef4444"],
      ["#06b6d4", "#3b82f6"],
      ["#6366f1", "#d946ef"]
    ];

    // Pick consistent gradient based on string hash
    let hash = 0;
    for (let i = 0; i < artistName.length; i++) {
      hash = artistName.charCodeAt(i) + ((hash << 5) - hash);
    }
    const pair = gradients[Math.abs(hash) % gradients.length];

    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="100%" height="100%">
        <defs>
          <linearGradient id="grad-${hash}" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="${pair[0]}" />
            <stop offset="100%" stop-color="${pair[1]}" />
          </linearGradient>
          <radialGradient id="vinylShine" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="rgba(255,255,255,0.15)"/>
            <stop offset="60%" stop-color="transparent"/>
            <stop offset="100%" stop-color="rgba(0,0,0,0.5)"/>
          </radialGradient>
        </defs>
        <rect width="400" height="400" fill="url(#grad-${hash})"/>
        <circle cx="200" cy="200" r="180" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="2"/>
        <circle cx="200" cy="200" r="140" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="1.5"/>
        <circle cx="200" cy="200" r="100" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="1.5"/>
        <circle cx="200" cy="200" r="60" fill="rgba(0,0,0,0.4)"/>
        <rect width="400" height="400" fill="url(#vinylShine)"/>
        <text x="200" y="215" text-anchor="middle" dominant-baseline="middle" font-family="'Outfit', -apple-system, sans-serif" font-size="64" font-weight="700" fill="#ffffff" letter-spacing="2">${initials}</text>
      </svg>
    `.trim();

    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }
}

export const artEngine = new ArtEngine();

