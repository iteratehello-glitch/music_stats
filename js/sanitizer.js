/**
 * BitChord Pulse - Schema Sanitizer & Normalizer
 * Handles artist tokenization, canonicalization, title cleaning,
 * unindexed time reconciliation, and settings parsing.
 */

const PROTECTED_BANDS = [
  "The Local Train",
  "Sachin-Jigar",
  "Vishal-Shekhar",
  "Javed-Mohsin",
  "Shankar Ehsaan Loy",
  "MAN WITH A MISSION",
  "Linked Horizon",
  "Empty old City",
  "Mild High Club",
  "The Walters",
  "MONOGATARI Series",
  "HOYO-MiX",
  "Simon & Garfunkel",
  "Crosby, Stills & Nash",
  "Earth, Wind & Fire",
  "Florence + The Machine",
  "Ryokuoushoku Shakai",
  "Anime Arcade Piano",
  "HUNTR/X, EJAE, AUDREY NUNA, REI AMI" // Handled gracefully
];

const ARTIST_CANONICAL_MAP = {
  "a. r. rahman": "A.R. Rahman",
  "a.r. rahman": "A.R. Rahman",
  "a.r rahman": "A.R. Rahman",
  "ar rahman": "A.R. Rahman",
  "mohd.rafi": "Mohammed Rafi",
  "mohd. rafi": "Mohammed Rafi",
  "mohd rafi": "Mohammed Rafi",
  "mohammed rafi": "Mohammed Rafi",
  "mohammad rafi": "Mohammed Rafi",
  "hiroyuki sawano": "Hiroyuki Sawano",
  "hiroyuki sawano": "Hiroyuki Sawano",
  "sawanohiroyuki[nzk]": "Hiroyuki Sawano",
  "sawano hiroyuki": "Hiroyuki Sawano",
  "エミリア（cv:高橋李依）": "エミリア（CV：高橋李依）",
  "エミリア(cv:高橋李依)": "エミリア（CV：高橋李依）",
  "zarame": "Zarame (ざらめ)",
  "ざらめ": "Zarame (ざらめ)",
  "tuki.": "tuki.",
  "yoasobi": "YOASOBI",
  "radwimps": "RADWIMPS",
  "rokudenashi": "Rokudenashi",
  "lisa": "LiSA",
  "aimer": "Aimer"
};

/**
 * Normalizes artist name variations, punctuation, and casing
 */
export function canonicalizeArtistName(rawName) {
  if (!rawName) return "Unknown Artist";
  let trimmed = rawName.trim();
  const lower = trimmed.toLowerCase();

  // Check canonical dictionary
  if (ARTIST_CANONICAL_MAP[lower]) {
    return ARTIST_CANONICAL_MAP[lower];
  }

  // Handle Japanese CV credit unification
  if (trimmed.includes("CV:") || trimmed.includes("CV：")) {
    trimmed = trimmed.replace(/CV\s*[:：]\s*/gi, "CV：");
  }

  return trimmed;
}

/**
 * Smartly tokenizes combined artist credits while preserving protected bands/duos.
 * Returns { primaryArtist, allArtists }
 */
export function smartTokenizeArtists(artistStr) {
  if (!artistStr || typeof artistStr !== "string") {
    return { primaryArtist: "Unknown Artist", allArtists: ["Unknown Artist"] };
  }

  const raw = artistStr.trim();

  // Check if entire string is a protected band
  const matchProtectedWhole = PROTECTED_BANDS.find(
    b => b.toLowerCase() === raw.toLowerCase()
  );
  if (matchProtectedWhole) {
    const canonical = canonicalizeArtistName(matchProtectedWhole);
    return { primaryArtist: canonical, allArtists: [canonical] };
  }

  // Replace protected bands with temporary placeholders before splitting
  const placeholders = [];
  let masked = raw;

  PROTECTED_BANDS.forEach((band, idx) => {
    const regex = new RegExp(band.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    if (regex.test(masked)) {
      const token = `__PROTECTED_BAND_${idx}__`;
      placeholders.push({ token, name: band });
      masked = masked.replace(regex, token);
    }
  });

  // Split on delimiters: ", ", " & ", " | ", " feat. ", " ft. ", " feat ", " ft ", " x ", " × ", " / "
  const splitRegex = /(?:\s*,\s*|\s+&\s+|\s*\|\s*|\s+(?:feat\.?|ft\.?)\s+|\s+[xX×]\s+|\s*\/\s*)/;
  const rawParts = masked.split(splitRegex);

  const cleanedArtists = [];
  rawParts.forEach(part => {
    let restored = part.trim();
    if (!restored) return;

    // Restore any placeholder
    placeholders.forEach(({ token, name }) => {
      restored = restored.replace(new RegExp(token, "g"), name);
    });

    const canonical = canonicalizeArtistName(restored);
    if (canonical && !cleanedArtists.includes(canonical)) {
      cleanedArtists.push(canonical);
    }
  });

  if (cleanedArtists.length === 0) {
    cleanedArtists.push(canonicalizeArtistName(raw));
  }

  return {
    primaryArtist: cleanedArtists[0],
    allArtists: cleanedArtists
  };
}

/**
 * Strips subtitle/film/anime metadata tags to isolate core song title
 * e.g., 'Tere Paas Main - Female Version (From "Main Vaapas Aaunga")' -> 'Tere Paas Main'
 */
export function cleanTrackTitle(title) {
  if (!title) return "Unknown Track";
  let cleaned = title.trim();

  // Strip film/soundtrack/movie tags like (From "...") or (Movie: ...) or (Original Motion Picture Soundtrack)
  cleaned = cleaned.replace(/\s*\((?:From|Movie:?|OST|Original Motion Picture Soundtrack|Audio)[^)]*\)/gi, "");
  cleaned = cleaned.replace(/\s*\[(?:Official|From|Remastered|Bonus)[^\]]*\]/gi, "");

  // Strip version suffixes for fuzzy song-matching
  return cleaned.trim();
}

/**
 * Creates a canonical song key to merge identical recordings across albums
 * (e.g., 'Qaafirana' from Kedarnath vs 'Qaafirana' from Best of Arijit)
 */
export function getCanonicalSongKey(title, artist) {
  const baseTitle = cleanTrackTitle(title)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  const baseArtist = (artist || "")
    .toLowerCase()
    .split(/[,&|]/)[0]
    .replace(/[^a-z0-9]/g, "");
  return `${baseTitle}__${baseArtist}`;
}

/**
 * Infers an album name when track.album is null
 */
export function inferAlbum(track) {
  if (track.album && track.album.trim() && track.album !== "null") {
    return track.album.trim();
  }
  return `Single • ${cleanTrackTitle(track.title)}`;
}

/**
 * Calculates unindexed monthly milliseconds
 * (i.e. ms logged before daily tracking began in BitChord)
 */
export function reconcileUnindexedTime(track) {
  const days = track.days || {};
  let dailySum = 0;
  for (const date in days) {
    dailySum += days[date].ms || 0;
  }
  const unindexedMs = Math.max(0, (track.ms || 0) - dailySum);
  return {
    dailySum,
    unindexedMs,
    totalMs: track.ms || 0
  };
}

/**
 * Parses BitChord settings object
 */
export function parseBitChordSettings(settingsObj) {
  if (!settingsObj || typeof settingsObj !== "object") {
    return {
      searchHistory: [],
      addonSearchHistory: [],
      equalizerBands: [0, 0, 0, 0, 0, 0, 0],
      audiophile: {}
    };
  }

  // Parse search history
  let searchHistory = [];
  try {
    const rawVal = settingsObj.search_history?.value;
    if (rawVal) {
      searchHistory = JSON.parse(rawVal);
    }
  } catch (e) {
    console.warn("Failed to parse settings.search_history", e);
  }

  // Parse addon search history
  let addonSearchHistory = [];
  try {
    const rawVal = settingsObj.addon_search_history?.value;
    if (rawVal) {
      addonSearchHistory = JSON.parse(rawVal);
    }
  } catch (e) {
    console.warn("Failed to parse settings.addon_search_history", e);
  }

  // Parse equalizer bands
  let equalizerBands = [2.5, 3.5, 2.5, 1.0, 1.0, 3.0, 3.0];
  try {
    const rawEq = settingsObj.equalizer_bands?.value;
    if (rawEq) {
      equalizerBands = rawEq.split(",").map(v => parseFloat(v.trim()) || 0);
    }
  } catch (e) {
    console.warn("Failed to parse settings.equalizer_bands", e);
  }

  // Audiophile rig flags
  const audiophile = {
    audioQualityWifi: settingsObj.audio_quality_wifi?.value || "LOSSLESS",
    audioQualityCellular: settingsObj.audio_quality_cellular?.value || "LOSSLESS",
    audioQualityDownload: settingsObj.audio_quality_download?.value || "LOSSLESS",
    outputPcmMode: settingsObj.output_pcm_mode?.value || "FLOAT_32",
    dolbyAtmos: settingsObj.dolby_atmos?.value === "true",
    spatialAudio: settingsObj.spatial_audio?.value === "true",
    bitPerfectMode: settingsObj.bit_perfect_mode?.value || "OFF",
    lyricsOffsetMs: parseInt(settingsObj.lyrics_offset_ms?.value || "-200", 10),
    audioCacheLimitBytes: parseInt(settingsObj.audio_cache_limit_bytes?.value || "1610612736", 10),
    equalizerBands
  };

  return {
    searchHistory,
    addonSearchHistory,
    equalizerBands,
    audiophile
  };
}

