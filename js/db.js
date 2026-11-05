/**
 * BitChord Pulse - In-Browser Database Engine (IndexedDB)
 * High-Water Mark Incremental Synchronization & Storage Manager.
 */

import {
  smartTokenizeArtists,
  cleanTrackTitle,
  getCanonicalSongKey,
  inferAlbum,
  reconcileUnindexedTime,
  parseBitChordSettings
} from "./sanitizer.js";

const DB_NAME = "BitChordPulseDB";
const DB_VERSION = 1;

export class PulseDB {
  constructor() {
    this.db = null;
  }

  /**
   * Initializes the IndexedDB instance
   */
  async init() {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = event => {
        const db = event.target.result;

        // Metadata & settings store
        if (!db.objectStoreNames.contains("meta")) {
          db.createObjectStore("meta", { keyPath: "key" });
        }

        // Sync history log
        if (!db.objectStoreNames.contains("syncHistory")) {
          const syncStore = db.createObjectStore("syncHistory", {
            keyPath: "syncId",
            autoIncrement: true
          });
          syncStore.createIndex("uploadedAt", "uploadedAt", { unique: false });
        }

        // Consolidated master tracks
        if (!db.objectStoreNames.contains("tracks")) {
          const trackStore = db.createObjectStore("tracks", { keyPath: "id" });
          trackStore.createIndex("primaryArtist", "primaryArtist", { unique: false });
          trackStore.createIndex("canonicalKey", "canonicalKey", { unique: false });
        }

        // Monthly listening buckets
        if (!db.objectStoreNames.contains("monthly")) {
          const monthStore = db.createObjectStore("monthly", { keyPath: "compositeKey" });
          monthStore.createIndex("month", "month", { unique: false });
          monthStore.createIndex("trackId", "trackId", { unique: false });
        }

        // Hourly activity ledger
        if (!db.objectStoreNames.contains("hourlyLedger")) {
          const hourlyStore = db.createObjectStore("hourlyLedger", {
            keyPath: "id",
            autoIncrement: true
          });
          hourlyStore.createIndex("timestamp", "timestamp", { unique: false });
        }

        // Art and media cache
        if (!db.objectStoreNames.contains("artCache")) {
          db.createObjectStore("artCache", { keyPath: "trackId" });
        }

        // Artist portraits cache
        if (!db.objectStoreNames.contains("artistPortraitsCache")) {
          db.createObjectStore("artistPortraitsCache", { keyPath: "artistName" });
        }

        // Search history ledger
        if (!db.objectStoreNames.contains("searchHistory")) {
          db.createObjectStore("searchHistory", { keyPath: "key" });
        }
      };

      request.onsuccess = event => {
        this.db = event.target.result;
        resolve(this.db);
      };

      request.onerror = event => {
        console.error("IndexedDB open error:", event.target.error);
        reject(event.target.error);
      };
    });
  }

  /**
   * Helper to perform a transaction
   */
  _transaction(storeNames, mode = "readonly") {
    return this.db.transaction(storeNames, mode);
  }

  /**
   * Reads all records from an object store
   */
  async getAll(storeName) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this._transaction(storeName, "readonly");
      const store = tx.objectStore(storeName);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Gets a single value by key
   */
  async get(storeName, key) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this._transaction(storeName, "readonly");
      const store = tx.objectStore(storeName);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Puts a value into an object store
   */
  async put(storeName, value) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this._transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      const req = store.put(value);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Reads full master state for analytical computation
   */
  async getMasterState() {
    await this.init();
    const [
      metaList,
      syncHistory,
      tracks,
      monthly,
      hourlyLedger,
      artCache,
      artistPortraits,
      searchHistory
    ] = await Promise.all([
      this.getAll("meta"),
      this.getAll("syncHistory"),
      this.getAll("tracks"),
      this.getAll("monthly"),
      this.getAll("hourlyLedger"),
      this.getAll("artCache"),
      this.getAll("artistPortraitsCache"),
      this.getAll("searchHistory")
    ]);

    const metaMap = {};
    metaList.forEach(m => {
      metaMap[m.key] = m.value;
    });

    const artMap = {};
    artCache.forEach(a => {
      artMap[a.trackId] = a;
    });

    const portraitMap = {};
    artistPortraits.forEach(p => {
      portraitMap[p.artistName] = p.portraitUrl;
    });

    return {
      watermark: metaMap.lastSyncedWatermark || null,
      dayLedger: metaMap.dayLedger || {},
      monthLedger: metaMap.monthLedger || {},
      settings: metaMap.settings || null,
      audiophile: metaMap.audiophile || null,
      syncHistory: syncHistory.sort((a, b) => b.uploadedAt - a.uploadedAt),
      tracks,
      monthly,
      hourlyLedger: hourlyLedger.sort((a, b) => a.timestamp - b.timestamp),
      artMap,
      portraitMap,
      searchHistory: searchHistory.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
    };
  }

  /**
   * High-Water Mark Incremental Synchronization Algorithm
   * Processes a raw bitchord backup JSON, merges monthly/daily/track records,
   * calculates deltaMs, deltaPlays, updates hourly activity ledger,
   * deduplicates search history, and updates watermark.
   */
  async syncBackup(rawJsonInput, fileName = "bitchord-backup.json") {
    await this.init();

    let raw;
    if (typeof rawJsonInput === "string") {
      raw = JSON.parse(rawJsonInput);
    } else {
      raw = rawJsonInput;
    }

    if (!raw || !raw.listening || !Array.isArray(raw.listening)) {
      throw new Error("Invalid BitChord backup JSON: missing 'listening' array.");
    }

    const exportedAt = raw.exportedAt || new Date().toISOString();
    const parsedSettings = parseBitChordSettings(raw.settings);

    // Read existing state for comparison
    const existingMeta = await this.get("meta", "lastSyncedWatermark");
    const existingWatermark = existingMeta ? existingMeta.value : null;

    const existingDayLedgerMeta = await this.get("meta", "dayLedger");
    const existingMonthLedgerMeta = await this.get("meta", "monthLedger");
    const dayLedger = existingDayLedgerMeta && existingDayLedgerMeta.value ? { ...existingDayLedgerMeta.value } : {};
    const monthLedger = existingMonthLedgerMeta && existingMonthLedgerMeta.value ? { ...existingMonthLedgerMeta.value } : {};

    // Calculate baseline before sync
    const prevDayLedger = existingDayLedgerMeta && existingDayLedgerMeta.value ? existingDayLedgerMeta.value : {};
    const previousAuthoritativeTotalMs = Object.values(prevDayLedger).reduce((sum, d) => sum + (Number(d.ms) || 0), 0);
    const previousAuthoritativePlays = Object.values(prevDayLedger).reduce((sum, d) => sum + (Number(d.plays) || 0), 0);

    const [existingTracksArr, existingMonthlyArr] = await Promise.all([
      this.getAll("tracks"),
      this.getAll("monthly")
    ]);

    const tracksMap = new Map();
    existingTracksArr.forEach(t => tracksMap.set(t.id, t));

    const monthlyMap = new Map();
    existingMonthlyArr.forEach(m => monthlyMap.set(m.compositeKey, m));

    let deltaMsAdded = 0;
    let deltaPlaysAdded = 0;
    let newTracksCount = 0;
    const newHourlyEntries = [];

    // Process every monthly bucket
    for (const monthBucket of raw.listening) {
      const month = monthBucket.month; // e.g. "2026-10"
      if (!month) continue;

      // Extract authoritative day totals from trackDays (exact ms and plays)
      if (monthBucket.trackDays && typeof monthBucket.trackDays === "object") {
        for (const [dateStr, td] of Object.entries(monthBucket.trackDays)) {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) continue;
          if (!dayLedger[dateStr]) dayLedger[dateStr] = { ms: 0, plays: 0 };
          dayLedger[dateStr].ms = Math.max(dayLedger[dateStr].ms, Number(td.ms) || 0);
          dayLedger[dateStr].plays = Math.max(dayLedger[dateStr].plays, Number(td.plays) || 0);
        }
      }

      // Extract authoritative day-of-month totals from days (exact ms)
      if (monthBucket.days && typeof monthBucket.days === "object") {
        for (const [dayNum, msVal] of Object.entries(monthBucket.days)) {
          const fullDate = `${month}-${String(dayNum).padStart(2, "0")}`;
          if (!/^\d{4}-\d{2}-\d{2}$/.test(fullDate)) continue;
          const numMs = Number(msVal) || 0;
          if (!dayLedger[fullDate]) dayLedger[fullDate] = { ms: 0, plays: 0 };
          dayLedger[fullDate].ms = Math.max(dayLedger[fullDate].ms, numMs);
          if (dayLedger[fullDate].plays === 0 && numMs > 0) {
            dayLedger[fullDate].plays = Math.max(1, Math.round(numMs / 210000));
          }
        }
      }

      // Purge any non-standard date keys
      for (const k of Object.keys(dayLedger)) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) delete dayLedger[k];
      }

      // Extract official month totals and 24-hr circadian curve
      let monthDaysSum = 0;
      if (monthBucket.days) {
        for (const val of Object.values(monthBucket.days)) {
          monthDaysSum += Number(val) || 0;
        }
      }
      const hoursArr = Array.isArray(monthBucket.hours) && monthBucket.hours.length === 24
        ? monthBucket.hours.map(Number)
        : null;

      if (!monthLedger[month]) {
        monthLedger[month] = { month, ms: 0, plays: 0, hours: hoursArr };
      }
      monthLedger[month].ms = Math.max(monthLedger[month].ms, monthDaysSum);
      if (hoursArr) {
        monthLedger[month].hours = hoursArr;
      }

      if (!Array.isArray(monthBucket.tracks)) continue;

      for (const rawTrack of monthBucket.tracks) {
        if (!rawTrack.id) continue;
        const trackId = rawTrack.id;
        const compositeKey = `${month}__${trackId}`;
        const existingMonthly = monthlyMap.get(compositeKey);

        const newMs = Number(rawTrack.ms) || 0;
        const newPlays = Number(rawTrack.plays) || 0;
        const newLast = Number(rawTrack.last) || 0;

        const oldMs = existingMonthly ? (Number(existingMonthly.ms) || 0) : 0;
        const oldPlays = existingMonthly ? (Number(existingMonthly.plays) || 0) : 0;
        const oldLast = existingMonthly ? (Number(existingMonthly.last) || 0) : 0;

        const trackDeltaMs = Math.max(0, newMs - oldMs);
        const trackDeltaPlays = Math.max(0, newPlays - oldPlays);

        deltaMsAdded += trackDeltaMs;
        deltaPlaysAdded += trackDeltaPlays;

        // Check if track played since last sync
        if (newLast > oldLast && newLast > 0) {
          newHourlyEntries.push({
            trackId,
            timestamp: newLast,
            deltaMs: trackDeltaMs,
            deltaPlays: trackDeltaPlays,
            month
          });
        }

        // Merge daily records for this month
        const mergedDays = existingMonthly ? { ...(existingMonthly.days || {}) } : {};
        if (rawTrack.days && typeof rawTrack.days === "object") {
          for (const [dateStr, dayObj] of Object.entries(rawTrack.days)) {
            const existingDay = mergedDays[dateStr];
            const dMs = Number(dayObj.ms) || 0;
            const dPlays = Number(dayObj.plays) || 0;
            mergedDays[dateStr] = {
              ms: Math.max(existingDay ? existingDay.ms : 0, dMs),
              plays: Math.max(existingDay ? existingDay.plays : 0, dPlays)
            };
          }
        }

        const updatedMonthly = {
          compositeKey,
          month,
          trackId,
          ms: Math.max(oldMs, newMs),
          plays: Math.max(oldPlays, newPlays),
          last: Math.max(oldLast, newLast),
          days: mergedDays
        };
        monthlyMap.set(compositeKey, updatedMonthly);

        // Check track in master tracks map
        let masterTrack = tracksMap.get(trackId);
        if (!masterTrack) {
          newTracksCount++;
          const tokenized = smartTokenizeArtists(rawTrack.artist);
          const cleanTitle = cleanTrackTitle(rawTrack.title);
          const album = inferAlbum(rawTrack);

          masterTrack = {
            id: trackId,
            title: rawTrack.title || "Unknown Title",
            cleanTitle,
            artist: rawTrack.artist || "Unknown Artist",
            primaryArtist: tokenized.primaryArtist,
            artists: tokenized.allArtists,
            album,
            albumId: rawTrack.albumId || null,
            artistId: rawTrack.artistId || null,
            art: rawTrack.art || null,
            canonicalKey: getCanonicalSongKey(rawTrack.title, tokenized.primaryArtist),
            last: newLast,
            firstSeenMonth: month
          };
          tracksMap.set(trackId, masterTrack);
        } else {
          // Upgrade metadata if richer
          if (!masterTrack.albumId && rawTrack.albumId) masterTrack.albumId = rawTrack.albumId;
          if (!masterTrack.artistId && rawTrack.artistId) masterTrack.artistId = rawTrack.artistId;
          if (
            (!masterTrack.art || masterTrack.art.startsWith("file://")) &&
            rawTrack.art &&
            !rawTrack.art.startsWith("file://")
          ) {
            masterTrack.art = rawTrack.art;
          }
          if (newLast > masterTrack.last) {
            masterTrack.last = newLast;
          }
        }
      }
    }

    // Recalculate all-time cumulative ms, plays, and unified days for each master track
    const allMonthlyRecords = Array.from(monthlyMap.values());
    for (const [trackId, masterTrack] of tracksMap.entries()) {
      const trackMonthlyRecords = allMonthlyRecords.filter(m => m.trackId === trackId);
      let totalMs = 0;
      let totalPlays = 0;
      let maxLast = 0;
      const combinedDays = {};

      trackMonthlyRecords.forEach(m => {
        totalMs += m.ms || 0;
        totalPlays += m.plays || 0;
        if ((m.last || 0) > maxLast) maxLast = m.last;
        if (m.days) {
          for (const [dateStr, dayObj] of Object.entries(m.days)) {
            const existing = combinedDays[dateStr];
            combinedDays[dateStr] = {
              ms: Math.max(existing ? existing.ms : 0, dayObj.ms || 0),
              plays: Math.max(existing ? existing.plays : 0, dayObj.plays || 0)
            };
          }
        }
      });

      masterTrack.ms = totalMs;
      masterTrack.plays = totalPlays;
      masterTrack.last = maxLast;
      masterTrack.days = combinedDays;

      // Reconcile unindexed time
      const reconciliation = reconcileUnindexedTime(masterTrack);
      masterTrack.unindexedMs = reconciliation.unindexedMs;
    }

    // Persist all data in an atomic transaction
    const tx = this._transaction(
      ["meta", "syncHistory", "tracks", "monthly", "hourlyLedger", "searchHistory"],
      "readwrite"
    );

    const metaStore = tx.objectStore("meta");
    const syncStore = tx.objectStore("syncHistory");
    const tracksStore = tx.objectStore("tracks");
    const monthlyStore = tx.objectStore("monthly");
    const hourlyStore = tx.objectStore("hourlyLedger");
    const searchStore = tx.objectStore("searchHistory");

    // Write tracks
    for (const track of tracksMap.values()) {
      tracksStore.put(track);
    }

    // Write monthly records
    for (const mRec of monthlyMap.values()) {
      monthlyStore.put(mRec);
    }

    // Write hourly ledger
    for (const hEntry of newHourlyEntries) {
      hourlyStore.add(hEntry);
    }

    // Merge search history
    for (const item of parsedSettings.searchHistory) {
      const key = `${item.id || item.title}__${item.timestamp || "0"}`;
      searchStore.put({ key, ...item });
    }

    // Determine watermark progression
    let latestWatermark = exportedAt;
    if (existingWatermark && existingWatermark > exportedAt) {
      latestWatermark = existingWatermark;
    }

    // Save meta
    metaStore.put({ key: "lastSyncedWatermark", value: latestWatermark });
    metaStore.put({ key: "settings", value: parsedSettings });
    metaStore.put({ key: "audiophile", value: parsedSettings.audiophile });
    metaStore.put({ key: "dayLedger", value: dayLedger });
    metaStore.put({ key: "monthLedger", value: monthLedger });

    // Calculate total hours and plays from master tracks (matching official BitChord app: 5,832 mins / 97.2h)
    const authoritativeTotalMs = Array.from(tracksMap.values()).reduce((sum, t) => sum + (Number(t.ms) || 0), 0);
    const authoritativeTotalPlays = Array.from(tracksMap.values()).reduce((sum, t) => sum + (Number(t.plays) || 0), 0);

    const prevTrackTotalMs = existingTracksArr.reduce((sum, t) => sum + (Number(t.ms) || 0), 0);
    const prevTrackTotalPlays = existingTracksArr.reduce((sum, t) => sum + (Number(t.plays) || 0), 0);

    const effectiveDeltaMs = Math.max(0, authoritativeTotalMs - prevTrackTotalMs);
    const effectiveDeltaPlays = Math.max(0, authoritativeTotalPlays - prevTrackTotalPlays);

    // Sync History log entry
    const syncLogEntry = {
      fileName,
      exportedAt,
      uploadedAt: Date.now(),
      deltaMsAdded: effectiveDeltaMs,
      deltaPlaysAdded: effectiveDeltaPlays,
      newTracksCount,
      totalTracks: tracksMap.size,
      totalHours: (authoritativeTotalMs / 3600000).toFixed(2)
    };
    syncStore.add(syncLogEntry);

    await new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    return {
      isNewWatermark: !existingWatermark || exportedAt > existingWatermark,
      oldWatermark: existingWatermark,
      newWatermark: latestWatermark,
      deltaMsAdded: effectiveDeltaMs,
      deltaPlaysAdded: effectiveDeltaPlays,
      newTracksCount,
      totalTracks: tracksMap.size,
      totalHours: syncLogEntry.totalHours,
      fileName
    };
  }

  /**
   * Caches high-definition artwork
   */
  async cacheArt(trackId, hdArt, previewUrl = null) {
    if (!trackId || !hdArt) return;
    await this.put("artCache", {
      trackId,
      hdArt,
      previewUrl,
      cachedAt: Date.now()
    });
  }

  /**
   * Caches artist portrait URL
   */
  async cacheArtistPortrait(artistName, portraitUrl, source = "auto") {
    if (!artistName || !portraitUrl) return;
    await this.put("artistPortraitsCache", {
      artistName,
      portraitUrl,
      source,
      cachedAt: Date.now()
    });
  }

  /**
   * Exports full merged master database as JSON string
   */
  async exportMasterBackup() {
    const state = await this.getMasterState();
    const exportPayload = {
      app: "bitchord-pulse",
      exportedAt: new Date().toISOString(),
      watermark: state.watermark,
      audiophile: state.audiophile,
      settings: state.settings,
      syncHistory: state.syncHistory,
      totalTracks: state.tracks.length,
      tracks: state.tracks,
      monthly: state.monthly,
      hourlyLedger: state.hourlyLedger,
      searchHistory: state.searchHistory
    };
    return JSON.stringify(exportPayload, null, 2);
  }

  /**
   * Clears all stores in IndexedDB
   */
  async resetDatabase() {
    await this.init();
    const storeNames = [
      "meta",
      "syncHistory",
      "tracks",
      "monthly",
      "hourlyLedger",
      "artCache",
      "artistPortraitsCache",
      "searchHistory"
    ];
    const tx = this._transaction(storeNames, "readwrite");
    storeNames.forEach(name => tx.objectStore(name).clear());

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}

export const pulseDB = new PulseDB();

