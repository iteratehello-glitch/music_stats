/**
 * BitChord Pulse - Analytics & Visualization Engine
 * Computes temporal distributions (Hourly, Daily, Weekly, Monthly, Yearly),
 * Circadian chronotype, cultural worlds, artist podiums, consistency index,
 * skip vs savour loyalty, and collaboration graph.
 *
 * Strict Apple Music Rose/Crimson Monochromatic Palette.
 */

// Heuristics for Cultural World Classification (Monochromatic Crimson/Rose Palette)
const CULTURAL_RULES = {
  INDIAN: {
    name: "Indian Melodies & Indie",
    color: "#FA243C", // Apple Music Core Crimson
    artists: [
      "arijit singh", "shreya ghoshal", "hansika pareek", "pritam", "lata mangeshkar",
      "kishore kumar", "a.r. rahman", "a. r. rahman", "jubin nautiyal", "bayaan", "papon",
      "the local train", "sachin-jigar", "vishal-shekhar", "javed-mohsin", "shankar ehsaan loy",
      "navjot ahuja", "mohammed rafi", "hasan raheem", "rovalio", "kumar vishwas", "shantanu moitra",
      "anurag mishra", "alok ranjan srivastava", "sanjay leela bhansali", "irshad kamil", "deepali sahay",
      "the rish", "amitabh bhattacharya", "atif aslam", "kk", "sonu nigam", "mohit chauhan", "badshah",
      "diljit dosanjh", "darshan raval", "prateek kuhad", "anuv jain"
    ],
    scripts: /[\u0900-\u097F]/ // Devanagari script regex
  },
  JPOP_ANIME: {
    name: "J-Pop, Anime & Vocaloid",
    color: "#FF5E7E", // Vibrant Rose
    artists: [
      "yoasobi", "ayase", "lisa", "aimer", "yorushika", "reona", "tuki.", "radwimps",
      "sawanohiroyuki[nzk]", "hiroyuki sawano", "rokudenashi", "ryokuoushoku shakai",
      "satoru kosaki", "kevin penkin", "alisa okehazama", "anime arcade piano",
      "man with a mission", "milet", "linked horizon", "empty old city", "monogatari series",
      "vaundy", "kenshi yonezu", "eve", "zutomayo", "ado", "hige dandism", "king gnu",
      "daoko", "kikuo", "inabakumori", "zarame", "ざらめ", "エミリア"
    ],
    scripts: /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/ // Hiragana, Katakana, CJK
  },
  WESTERN: {
    name: "Western Indie & Pop",
    color: "#FF8A9E", // Soft Coral Rose
    artists: [
      "stephen sanchez", "lord huron", "new west", "mitski", "djo", "passenger",
      "lady gaga", "bruno mars", "the walters", "mild high club", "blackpink",
      "taylor swift", "billie eilish", "the weeknd", "coldplay", "arctic monkeys",
      "chappell roan", "sabrina carpenter", "conan gray", "laufey", "cigarettes after sex",
      "huntr/x", "ejae", "audrey nuna", "rei ami"
    ],
    scripts: null
  },
  GAME_OST: {
    name: "Game Soundtracks",
    color: "#E2A9B3", // Blush Champagne
    artists: ["wuthering waves", "hoyo-mix", "square enix", "capcom", "mick gordon", "toby fox", "c418"],
    scripts: null
  },
  CLASSICAL: {
    name: "Classical & Orchestral",
    color: "rgba(255, 255, 255, 0.75)", // Pure Silver White
    artists: [
      "chopin", "vivaldi", "joe hisaishi", "florian christl", "hans zimmer",
      "beethoven", "mozart", "bach", "yiruma", "ludovico einaudi", "max richter"
    ],
    scripts: null
  }
};

export class PulseAnalytics {
  /**
   * Classify a track into a cultural world
   */
  static classifyCulturalWorld(track) {
    const artistLower = (track.artist || "").toLowerCase();
    const titleLower = (track.title || "").toLowerCase();
    const combined = `${artistLower} ${titleLower}`;

    // 1. Check Japanese / Anime
    if (
      CULTURAL_RULES.JPOP_ANIME.scripts.test(combined) ||
      CULTURAL_RULES.JPOP_ANIME.artists.some(a => artistLower.includes(a)) ||
      titleLower.includes("apothecary diaries") ||
      titleLower.includes("anime") ||
      titleLower.includes("ost")
    ) {
      return CULTURAL_RULES.JPOP_ANIME;
    }

    // 2. Check Indian / Bollywood / Hindi
    if (
      CULTURAL_RULES.INDIAN.scripts.test(combined) ||
      CULTURAL_RULES.INDIAN.artists.some(a => artistLower.includes(a)) ||
      titleLower.includes("(from \"") ||
      titleLower.includes("movie:") ||
      titleLower.includes("reprise") ||
      titleLower.includes("female version")
    ) {
      return CULTURAL_RULES.INDIAN;
    }

    // 3. Check Game OST
    if (CULTURAL_RULES.GAME_OST.artists.some(a => artistLower.includes(a))) {
      return CULTURAL_RULES.GAME_OST;
    }

    // 4. Check Classical
    if (CULTURAL_RULES.CLASSICAL.artists.some(a => artistLower.includes(a))) {
      return CULTURAL_RULES.CLASSICAL;
    }

    // 5. Default to Western Indie & Pop
    return CULTURAL_RULES.WESTERN;
  }

  /**
   * Filters master state based on selected timeframe
   */
  static filterState(masterState, filter = "all", mergeDuplicates = false, customRange = null) {
    if (!masterState || !masterState.tracks) {
      return { tracks: [], monthly: [], dates: {}, totalMs: 0, totalPlays: 0 };
    }

    let rawTracks = [...masterState.tracks];
    let rawMonthly = [...masterState.monthly];

    // Timeframe filtering
    let allowedMonths = null;
    let allowedDateFilter = null;

    if (filter === "2026") {
      allowedMonths = ["2026-10", "2026-11", "2026-12"];
    } else if (filter === "thisMonth") {
      // Find latest month
      const months = Array.from(new Set(rawMonthly.map(m => m.month))).sort();
      allowedMonths = months.length > 0 ? [months[months.length - 1]] : ["2026-11"];
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(filter)) {
      // Exact single date (e.g. "2026-10-22")
      allowedDateFilter = d => d === filter;
    } else if (/^\d{4}-\d{2}$/.test(filter)) {
      // Exact month (e.g. "2026-10" or "2026-11")
      allowedMonths = [filter];
    } else if (filter === "thisWeek" || filter === "last7days") {
      const allDates = this.getAllDatesFromTracks(rawTracks);
      if (allDates.length > 0) {
        const sorted = allDates.sort();
        const latest = new Date(sorted[sorted.length - 1]);
        const sevenDaysPrior = new Date(latest);
        sevenDaysPrior.setDate(sevenDaysPrior.getDate() - 6);
        const minStr = sevenDaysPrior.toISOString().split("T")[0];
        allowedDateFilter = d => d >= minStr;
      }
    } else if (filter === "custom" && customRange && customRange.start && customRange.end) {
      allowedDateFilter = d => d >= customRange.start && d <= customRange.end;
    }

    // If month-filtered, restrict monthly records and recompute track values
    if (allowedMonths) {
      rawMonthly = rawMonthly.filter(m => allowedMonths.includes(m.month));
      const monthlyTrackIds = new Set(rawMonthly.map(m => m.trackId));

      rawTracks = rawTracks
        .filter(t => monthlyTrackIds.has(t.id))
        .map(t => {
          const matchingMonthly = rawMonthly.filter(m => m.trackId === t.id);
          let ms = 0;
          let plays = 0;
          const days = {};
          let maxLast = 0;

          matchingMonthly.forEach(m => {
            ms += m.ms || 0;
            plays += m.plays || 0;
            if (m.last > maxLast) maxLast = m.last;
            if (m.days) {
              for (const [date, val] of Object.entries(m.days)) {
                days[date] = val;
              }
            }
          });

          return { ...t, ms, plays, days, last: maxLast };
        });
    }

    // If specific date filter applied
    if (allowedDateFilter) {
      rawTracks = rawTracks
        .map(t => {
          const filteredDays = {};
          let filteredMs = 0;
          let filteredPlays = 0;

          if (t.days) {
            for (const [date, val] of Object.entries(t.days)) {
              if (allowedDateFilter(date)) {
                filteredDays[date] = val;
                filteredMs += val.ms || 0;
                filteredPlays += val.plays || 0;
              }
            }
          }

          return {
            ...t,
            ms: filteredMs,
            plays: filteredPlays,
            days: filteredDays
          };
        })
        .filter(t => t.ms > 0 || t.plays > 0);
    }

    // Handle "Merge Identical Songs Across Albums" toggle
    if (mergeDuplicates) {
      const mergedMap = new Map();

      rawTracks.forEach(t => {
        const key = t.canonicalKey || t.id;
        if (!mergedMap.has(key)) {
          mergedMap.set(key, { ...t, duplicateVariants: [t.id] });
        } else {
          const existing = mergedMap.get(key);
          existing.ms += t.ms;
          existing.plays += t.plays;
          existing.last = Math.max(existing.last, t.last);
          existing.duplicateVariants.push(t.id);

          // Merge days
          if (t.days) {
            for (const [date, val] of Object.entries(t.days)) {
              if (!existing.days[date]) {
                existing.days[date] = { ms: val.ms, plays: val.plays };
              } else {
                existing.days[date].ms += val.ms;
                existing.days[date].plays += val.plays;
              }
            }
          }
        }
      });

      rawTracks = Array.from(mergedMap.values());
    }

    // Aggregate dates map
    const datesMap = {};
    rawTracks.forEach(t => {
      if (t.days) {
        for (const [date, val] of Object.entries(t.days)) {
          if (!datesMap[date]) {
            datesMap[date] = { ms: 0, plays: 0, tracks: [] };
          }
          datesMap[date].ms += val.ms || 0;
          datesMap[date].plays += val.plays || 0;
          datesMap[date].tracks.push({
            id: t.id,
            title: t.title,
            artist: t.artist,
            ms: val.ms,
            plays: val.plays,
            art: t.art
          });
        }
      }
    });

    const totalMs = rawTracks.reduce((acc, t) => acc + (t.ms || 0), 0);
    const totalPlays = rawTracks.reduce((acc, t) => acc + (t.plays || 0), 0);

    return {
      tracks: rawTracks,
      monthly: rawMonthly,
      dates: datesMap,
      totalMs,
      totalPlays,
      watermark: masterState.watermark,
      settings: masterState.settings,
      audiophile: masterState.audiophile,
      searchHistory: masterState.searchHistory,
      hourlyLedger: masterState.hourlyLedger,
      artMap: masterState.artMap || {},
      portraitMap: masterState.portraitMap || {}
    };
  }

  /**
   * Helper to extract all distinct date keys from tracks
   */
  static getAllDatesFromTracks(tracks) {
    const dates = new Set();
    tracks.forEach(t => {
      if (t.days) {
        Object.keys(t.days).forEach(d => dates.add(d));
      }
    });
    return Array.from(dates);
  }

  /**
   * Section A: Computes Executive Command Center Bento KPIs
   */
  static computeHeroKPIs(filteredState) {
    const { tracks, dates, totalMs, totalPlays, watermark } = filteredState;

    const totalSeconds = Math.floor(totalMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    let partialListens = 0;
    tracks.forEach(t => {
      if (t.ms > 0 && t.plays === 0) {
        partialListens++;
      }
    });

    const uniqueTracks = tracks.length;
    const uniqueArtists = new Set(tracks.map(t => t.primaryArtist)).size;
    const uniqueAlbums = new Set(tracks.map(t => t.album)).size;

    const activeDates = Object.keys(dates).sort();
    const activeDaysCount = activeDates.length;
    let daysInRange = activeDaysCount;

    if (activeDaysCount > 1) {
      const first = new Date(activeDates[0]);
      const last = new Date(activeDates[activeDates.length - 1]);
      const diffTime = Math.abs(last - first);
      daysInRange = Math.max(activeDaysCount, Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1);
    }

    const dailyAverageMs = activeDaysCount > 0 ? totalMs / activeDaysCount : 0;
    const activeDaysRatio = daysInRange > 0 ? (activeDaysCount / daysInRange) * 100 : 0;

    const streakInfo = this.calculateStreaks(activeDates);

    return {
      totalMs,
      hours,
      minutes,
      seconds,
      totalHoursFormatted: (totalMs / 3600000).toFixed(1),
      totalPlays,
      partialListens,
      uniqueTracks,
      uniqueArtists,
      uniqueAlbums,
      activeDaysCount,
      daysInRange,
      activeDaysRatio: activeDaysRatio.toFixed(1),
      dailyAverageHours: (dailyAverageMs / 3600000).toFixed(1),
      currentStreak: streakInfo.currentStreak,
      longestStreak: streakInfo.longestStreak,
      watermark
    };
  }

  /**
   * Calculates current and longest listening streaks
   */
  static calculateStreaks(sortedDateStrings) {
    if (!sortedDateStrings || sortedDateStrings.length === 0) {
      return { currentStreak: 0, longestStreak: 0 };
    }

    let longest = 1;
    let current = 1;

    for (let i = 1; i < sortedDateStrings.length; i++) {
      const prev = new Date(sortedDateStrings[i - 1]);
      const curr = new Date(sortedDateStrings[i]);
      const diffDays = Math.round((curr - prev) / (1000 * 60 * 60 * 24));

      if (diffDays === 1) {
        current++;
        if (current > longest) longest = current;
      } else if (diffDays > 1) {
        current = 1;
      }
    }

    return { currentStreak: current, longestStreak: longest };
  }

  /**
   * Section B.1: Hourly Circadian Rhythm & 24h Distribution
   */
  static computeHourlyCircadian(filteredState) {
    const { tracks, hourlyLedger, searchHistory } = filteredState;

    const hourlyPlays = new Array(24).fill(0);
    const hourlySearches = new Array(24).fill(0);
    const dayparts = {
      morning: { name: "Morning (06:00–12:00)", ms: 0, plays: 0, tracks: new Map(), artists: new Map() },
      afternoon: { name: "Afternoon (12:00–17:00)", ms: 0, plays: 0, tracks: new Map(), artists: new Map() },
      evening: { name: "Evening (17:00–22:00)", ms: 0, plays: 0, tracks: new Map(), artists: new Map() },
      night: { name: "Late Night (22:00–06:00)", ms: 0, plays: 0, tracks: new Map(), artists: new Map() }
    };

    const matrix7x24 = Array.from({ length: 7 }, () => new Array(24).fill(0));

    tracks.forEach(track => {
      if (track.last && track.last > 0) {
        const date = new Date(track.last);
        const hour = date.getHours();
        const day = date.getDay(); // 0-6

        const plays = track.plays || 1;
        hourlyPlays[hour] += plays;
        matrix7x24[day][hour] += plays;

        let partKey = "night";
        if (hour >= 6 && hour < 12) partKey = "morning";
        else if (hour >= 12 && hour < 17) partKey = "afternoon";
        else if (hour >= 17 && hour < 22) partKey = "evening";

        const dp = dayparts[partKey];
        dp.ms += track.ms;
        dp.plays += plays;

        dp.tracks.set(track.title, (dp.tracks.get(track.title) || 0) + track.ms);
        dp.artists.set(track.primaryArtist, (dp.artists.get(track.primaryArtist) || 0) + track.ms);
      }
    });

    if (hourlyLedger && hourlyLedger.length > 0) {
      hourlyLedger.forEach(entry => {
        const date = new Date(entry.timestamp);
        const hour = date.getHours();
        hourlyPlays[hour] += entry.deltaPlays || 1;
      });
    }

    if (searchHistory && searchHistory.length > 0) {
      searchHistory.forEach(item => {
        if (item.timestamp) {
          const date = new Date(item.timestamp);
          const hour = date.getHours();
          hourlySearches[hour]++;
        }
      });
    }

    const daypartCards = Object.entries(dayparts).map(([key, dp]) => {
      let topTrack = "None";
      let topArtist = "None";
      let maxTrackMs = 0;
      let maxArtistMs = 0;

      for (const [t, m] of dp.tracks.entries()) {
        if (m > maxTrackMs) {
          maxTrackMs = m;
          topTrack = t;
        }
      }

      for (const [a, m] of dp.artists.entries()) {
        if (m > maxArtistMs) {
          maxArtistMs = m;
          topArtist = a;
        }
      }

      return {
        key,
        name: dp.name,
        hours: (dp.ms / 3600000).toFixed(1),
        plays: dp.plays,
        topTrack,
        topArtist
      };
    });

    // Determine peak hour
    let peakHour = 0;
    let maxHourPlays = 0;
    hourlyPlays.forEach((p, h) => {
      if (p > maxHourPlays) {
        maxHourPlays = p;
        peakHour = h;
      }
    });

    const formatHour = h => {
      const ampm = h >= 12 ? "PM" : "AM";
      const h12 = h % 12 === 0 ? 12 : h % 12;
      return `${h12}:00 ${ampm}`;
    };

    const nightOwlScore = hourlyPlays.slice(22).reduce((a, b) => a + b, 0) + hourlyPlays.slice(0, 5).reduce((a, b) => a + b, 0);
    const morningScore = hourlyPlays.slice(6, 12).reduce((a, b) => a + b, 0);
    const afternoonScore = hourlyPlays.slice(12, 17).reduce((a, b) => a + b, 0);
    const eveningScore = hourlyPlays.slice(17, 22).reduce((a, b) => a + b, 0);

    let chronotype = "Night Owl";
    if (nightOwlScore >= morningScore && nightOwlScore >= eveningScore) {
      chronotype = "Night Owl";
    } else if (eveningScore >= morningScore && eveningScore >= nightOwlScore) {
      chronotype = "Evening Peak";
    } else if (morningScore >= afternoonScore && morningScore >= eveningScore) {
      chronotype = "Early Bird";
    } else {
      chronotype = "Midday Explorer";
    }

    return {
      hourlyPlays,
      hourlySearches,
      matrix7x24,
      daypartCards,
      peakHourFormatted: formatHour(peakHour),
      chronotype
    };
  }

  /**
   * Section B.2: Daily Activity Heatmap & Area Streamgraph Data
   */
  static computeDailyActivity(filteredState) {
    const { dates } = filteredState;
    const sortedDates = Object.keys(dates).sort();

    const dailySeries = sortedDates.map(dateStr => {
      const item = dates[dateStr];
      return {
        date: dateStr,
        hours: parseFloat((item.ms / 3600000).toFixed(2)),
        plays: item.plays,
        tracksCount: item.tracks.length
      };
    });

    return {
      sortedDates,
      dailySeries
    };
  }

  /**
   * Section B.3: Weekly Momentum & Weekday Rhythm
   */
  static computeWeeklyBreakdown(filteredState) {
    const { dates } = filteredState;

    const daysOfWeek = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    // 0=Mon, 1=Tue, ..., 6=Sun (converted from 0=Sun)
    const weekdayMs = new Array(7).fill(0);
    const weekdayPlays = new Array(7).fill(0);
    const weekdayCounts = new Array(7).fill(0);

    for (const [dateStr, val] of Object.entries(dates)) {
      const d = new Date(dateStr);
      const dayRaw = d.getDay(); // 0 is Sunday
      const dayIdx = dayRaw === 0 ? 6 : dayRaw - 1; // 0=Mon, 6=Sun
      weekdayMs[dayIdx] += val.ms;
      weekdayPlays[dayIdx] += val.plays;
      weekdayCounts[dayIdx]++;
    }

    const radarAveragesHours = weekdayMs.map((ms, i) => {
      const count = weekdayCounts[i] || 1;
      return parseFloat((ms / count / 3600000).toFixed(2));
    });

    const weekdayTotalMs = weekdayMs.slice(0, 5).reduce((a, b) => a + b, 0);
    const weekendTotalMs = weekdayMs[5] + weekdayMs[6];

    return {
      daysOfWeek,
      weekdayMs,
      weekdayPlays,
      radarAveragesHours,
      weekdayHours: (weekdayTotalMs / 3600000).toFixed(1),
      weekendHours: (weekendTotalMs / 3600000).toFixed(1)
    };
  }

  /**
   * Section B.4 & B.5: Monthly Horizon & Annual Run-Rate Projection
   */
  static computeMonthlyAndYearly(masterState, filteredState) {
    const monthlyBuckets = {};

    masterState.monthly.forEach(m => {
      if (!monthlyBuckets[m.month]) {
        monthlyBuckets[m.month] = {
          month: m.month,
          totalMs: 0,
          dailyMs: 0,
          plays: 0,
          trackMsMap: new Map(),
          artistMsMap: new Map(),
          albumMsMap: new Map()
        };
      }

      const b = monthlyBuckets[m.month];
      b.totalMs += m.ms || 0;
      b.plays += m.plays || 0;

      if (m.days) {
        for (const d of Object.values(m.days)) {
          b.dailyMs += d.ms || 0;
        }
      }

      const track = masterState.tracks.find(t => t.id === m.trackId);
      if (track) {
        b.trackMsMap.set(track.title, (b.trackMsMap.get(track.title) || 0) + m.ms);
        b.artistMsMap.set(track.primaryArtist, (b.artistMsMap.get(track.primaryArtist) || 0) + m.ms);
        if (track.album) {
          b.albumMsMap.set(track.album, (b.albumMsMap.get(track.album) || 0) + m.ms);
        }
      }
    });

    const monthsSummary = Object.values(monthlyBuckets)
      .sort((a, b) => a.month.localeCompare(b.month))
      .map(b => {
        let topSong = "—";
        let topArtist = "—";
        let topAlbum = "—";
        let maxTrack = 0;
        let maxArtist = 0;
        let maxAlbum = 0;

        for (const [t, m] of b.trackMsMap.entries()) {
          if (m > maxTrack) {
            maxTrack = m;
            topSong = t;
          }
        }
        for (const [a, m] of b.artistMsMap.entries()) {
          if (m > maxArtist) {
            maxArtist = m;
            topArtist = a;
          }
        }
        for (const [al, m] of b.albumMsMap.entries()) {
          if (m > maxAlbum) {
            maxAlbum = m;
            topAlbum = al;
          }
        }

        return {
          month: b.month,
          totalHours: (b.totalMs / 3600000).toFixed(1),
          dailyHours: (b.dailyMs / 3600000).toFixed(1),
          unindexedHours: (Math.max(0, b.totalMs - b.dailyMs) / 3600000).toFixed(1),
          plays: b.plays,
          topSong,
          topArtist,
          topAlbum
        };
      });

    const activeDatesCount = Object.keys(filteredState.dates).length || 1;
    const dailyVelocityHours = filteredState.totalMs / activeDatesCount / 3600000;
    const projectedFullYearHours = Math.round(dailyVelocityHours * 365);
    const projectedFullYearPlays = Math.round((filteredState.totalPlays / activeDatesCount) * 365);

    return {
      monthsSummary,
      dailyVelocityHours: dailyVelocityHours.toFixed(1),
      projectedFullYearHours,
      projectedFullYearPlays
    };
  }

  /**
   * Section C: Artist Leaderboard & Podium (#1, #2, #3)
   */
  static computeArtistLeaderboard(filteredState, creditMode = "primary") {
    const { tracks, totalMs } = filteredState;
    const artistMap = new Map();

    tracks.forEach(track => {
      const artistsToCredit = creditMode === "all" ? track.artists || [track.primaryArtist] : [track.primaryArtist];
      const splitFactor = creditMode === "all" ? artistsToCredit.length : 1;
      const trackMs = (track.ms || 0) / splitFactor;
      const trackPlays = (track.plays || 0) / splitFactor;

      artistsToCredit.forEach(artistName => {
        if (!artistMap.has(artistName)) {
          artistMap.set(artistName, {
            name: artistName,
            totalMs: 0,
            totalPlays: 0,
            tracks: [],
            albums: new Set(),
            collaborators: new Set()
          });
        }

        const a = artistMap.get(artistName);
        a.totalMs += trackMs;
        a.totalPlays += trackPlays;
        a.tracks.push(track);
        if (track.album) a.albums.add(track.album);

        if (track.artists && track.artists.length > 1) {
          track.artists.forEach(co => {
            if (co !== artistName) a.collaborators.add(co);
          });
        }
      });
    });

    const sortedArtists = Array.from(artistMap.values())
      .sort((a, b) => b.totalMs - a.totalMs)
      .map((a, index) => {
        const hours = (a.totalMs / 3600000).toFixed(1);
        const sharePercent = totalMs > 0 ? ((a.totalMs / totalMs) * 100).toFixed(1) : 0;
        const sortedTracks = [...a.tracks].sort((t1, t2) => t2.ms - t1.ms);

        return {
          rank: index + 1,
          name: a.name,
          totalMs: a.totalMs,
          hours,
          plays: Math.round(a.totalPlays),
          uniqueTracksCount: a.tracks.length,
          uniqueAlbumsCount: a.albums.size,
          sharePercent,
          topTracks: sortedTracks,
          collaborators: Array.from(a.collaborators)
        };
      });

    const podium = sortedArtists.slice(0, 3);

    return {
      podium,
      leaderboard: sortedArtists
    };
  }

  /**
   * Section D: Top Songs, Album Showcase, and Behavioral Insights
   */
  static computeSongsAndAlbums(filteredState) {
    const { tracks, totalMs } = filteredState;

    // Top Songs
    const sortedSongs = [...tracks].sort((a, b) => b.ms - a.ms);

    // Consistency Index (Obsession): Ranked by count of distinct days played
    const obsessionIndex = [...tracks]
      .map(t => {
        const distinctDaysCount = t.days ? Object.keys(t.days).length : 0;
        const totalMinutes = Math.round((t.ms || 0) / 60000);
        return {
          ...t,
          distinctDaysCount,
          totalMinutes,
          hours: (t.ms / 3600000).toFixed(1)
        };
      })
      .sort((a, b) => b.distinctDaysCount - a.distinctDaysCount || b.ms - a.ms);

    // Album Showcase
    const albumMap = new Map();
    tracks.forEach(track => {
      const albumName = track.album || "Single / Unspecified";
      if (!albumMap.has(albumName)) {
        albumMap.set(albumName, {
          album: albumName,
          albumId: track.albumId,
          primaryArtist: track.primaryArtist,
          art: track.art,
          id: track.id,
          totalMs: 0,
          totalPlays: 0,
          tracks: []
        });
      }

      const alb = albumMap.get(albumName);
      alb.totalMs += track.ms;
      alb.totalPlays += track.plays;
      alb.tracks.push(track);
    });

    const albumShowcase = Array.from(albumMap.values())
      .sort((a, b) => b.totalMs - a.totalMs)
      .map((alb, index) => ({
        ...alb,
        rank: index + 1,
        hours: (alb.totalMs / 3600000).toFixed(1),
        totalMinutes: Math.round(alb.totalMs / 60000),
        trackCount: alb.tracks.length,
        tracks: alb.tracks.sort((t1, t2) => t2.ms - t1.ms)
      }));

    return {
      topSongs: sortedSongs,
      obsessionIndex,
      albumShowcase
    };
  }

  /**
   * Section E: Cultural Worlds & Collaboration Network
   */
  static computeCulturalWorldsAndGraph(filteredState) {
    const { tracks } = filteredState;

    const worldTotals = {
      [CULTURAL_RULES.INDIAN.name]: { ...CULTURAL_RULES.INDIAN, ms: 0, plays: 0, trackCount: 0 },
      [CULTURAL_RULES.JPOP_ANIME.name]: { ...CULTURAL_RULES.JPOP_ANIME, ms: 0, plays: 0, trackCount: 0 },
      [CULTURAL_RULES.WESTERN.name]: { ...CULTURAL_RULES.WESTERN, ms: 0, plays: 0, trackCount: 0 },
      [CULTURAL_RULES.GAME_OST.name]: { ...CULTURAL_RULES.GAME_OST, ms: 0, plays: 0, trackCount: 0 },
      [CULTURAL_RULES.CLASSICAL.name]: { ...CULTURAL_RULES.CLASSICAL, ms: 0, plays: 0, trackCount: 0 }
    };

    tracks.forEach(t => {
      const world = this.classifyCulturalWorld(t);
      const target = worldTotals[world.name];
      if (target) {
        target.ms += t.ms;
        target.plays += t.plays;
        target.trackCount++;
      }
    });

    const totalTrackedMs = Object.values(worldTotals).reduce((sum, w) => sum + w.ms, 0) || 1;
    const culturalDistribution = Object.values(worldTotals).map(w => ({
      name: w.name,
      color: w.color,
      ms: w.ms,
      hours: (w.ms / 3600000).toFixed(1),
      plays: w.plays,
      trackCount: w.trackCount,
      percent: parseFloat(((w.ms / totalTrackedMs) * 100).toFixed(1))
    })).sort((a, b) => b.ms - a.ms);

    return {
      culturalDistribution
    };
  }

  /**
   * Computes comprehensive Single Day analytics for Mode C and Day Inspector
   */
  static computeDayBreakdown(masterState, dateStr) {
    if (!masterState || !masterState.tracks || !dateStr) {
      return null;
    }

    const dayTracks = [];
    let totalMs = 0;
    let totalPlays = 0;
    const artistMap = new Map();

    masterState.tracks.forEach(track => {
      if (track.days && track.days[dateStr]) {
        const d = track.days[dateStr];
        const ms = d.ms || 0;
        const plays = d.plays || 0;
        totalMs += ms;
        totalPlays += plays;

        dayTracks.push({
          ...track,
          dayMs: ms,
          dayPlays: plays,
          totalMinutes: Math.round(ms / 60000),
          seconds: Math.floor((ms % 60000) / 1000)
        });

        const artist = track.primaryArtist || "Unknown Artist";
        if (!artistMap.has(artist)) {
          artistMap.set(artist, { name: artist, ms: 0, plays: 0, tracks: [] });
        }
        const a = artistMap.get(artist);
        a.ms += ms;
        a.plays += plays;
        a.tracks.push(track);
      }
    });

    // Fallback: check monthly records if tracks map does not have days for dateStr
    if (dayTracks.length === 0 && masterState.monthly && Array.isArray(masterState.monthly)) {
      const monthPrefix = dateStr.slice(0, 7);
      masterState.monthly.forEach(m => {
        if (m.month === monthPrefix && m.days && m.days[dateStr]) {
          const d = m.days[dateStr];
          const ms = d.ms || 0;
          const plays = d.plays || 0;
          if (ms > 0 || plays > 0) {
            const masterTrack = masterState.tracks.find(t => t.id === m.trackId) || {
              id: m.trackId,
              title: "Track " + m.trackId,
              artist: "Unknown Artist",
              primaryArtist: "Unknown Artist"
            };
            totalMs += ms;
            totalPlays += plays;
            dayTracks.push({
              ...masterTrack,
              dayMs: ms,
              dayPlays: plays,
              totalMinutes: Math.round(ms / 60000),
              seconds: Math.floor((ms % 60000) / 1000)
            });

            const artist = masterTrack.primaryArtist || masterTrack.artist || "Unknown Artist";
            if (!artistMap.has(artist)) {
              artistMap.set(artist, { name: artist, ms: 0, plays: 0, tracks: [] });
            }
            const a = artistMap.get(artist);
            a.ms += ms;
            a.plays += plays;
            a.tracks.push(masterTrack);
          }
        }
      });
    }

    dayTracks.sort((a, b) => b.dayMs - a.dayMs);

    const totalHours = Math.floor(totalMs / 3600000);
    const totalMinutes = Math.floor((totalMs % 3600000) / 60000);
    const totalSeconds = Math.floor((totalMs % 60000) / 1000);

    const topArtists = Array.from(artistMap.values())
      .sort((a, b) => b.ms - a.ms)
      .map(a => ({
        name: a.name,
        ms: a.ms,
        hours: (a.ms / 3600000).toFixed(1),
        minutes: Math.round(a.ms / 60000),
        plays: a.plays,
        tracksCount: a.tracks.length,
        percent: totalMs > 0 ? parseFloat(((a.ms / totalMs) * 100).toFixed(1)) : 0
      }));

    // Safe timestamp-to-date matcher (handles epoch milliseconds, ISO strings, and local/UTC boundaries)
    const matchesTargetDate = (ts, targetDate) => {
      if (!ts || !targetDate) return false;
      if (typeof ts === "string") {
        if (ts.startsWith(targetDate)) return true;
        if (ts.length >= 10 && ts.slice(0, 10) === targetDate) return true;
      }
      try {
        const d = new Date(ts);
        if (isNaN(d.getTime())) return false;
        if (d.toISOString().split("T")[0] === targetDate) return true;
        const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        if (local === targetDate) return true;
      } catch (_) {}
      return false;
    };

    const getSafeHour = ts => {
      try {
        const d = new Date(ts);
        if (!isNaN(d.getTime())) {
          return d.getHours();
        }
      } catch (_) {}
      return -1;
    };

    // Hourly curves for this day
    const exactHourlyPlays = new Array(24).fill(0);
    const projectedHourlyHours = new Array(24).fill(0);

    // 1. Confirmed hourly timestamps
    if (masterState.hourlyLedger) {
      masterState.hourlyLedger.forEach(item => {
        if (matchesTargetDate(item.timestamp, dateStr)) {
          const h = getSafeHour(item.timestamp);
          if (h >= 0 && h < 24) {
            exactHourlyPlays[h] += item.deltaPlays || 1;
          }
        }
      });
    }

    if (masterState.searchHistory) {
      masterState.searchHistory.forEach(item => {
        if (matchesTargetDate(item.timestamp, dateStr)) {
          const h = getSafeHour(item.timestamp);
          if (h >= 0 && h < 24) {
            exactHourlyPlays[h] += 1;
          }
        }
      });
    }

    // Also check track.last if it falls on dateStr
    dayTracks.forEach(t => {
      if (t.last && t.last > 0 && matchesTargetDate(t.last, dateStr)) {
        const h = getSafeHour(t.last);
        if (h >= 0 && h < 24) {
          exactHourlyPlays[h] += t.dayPlays || 1;
        }
      }
    });

    // 2. Projected 24-hour curve (distributes day's ms based on circadian profile)
    const totalExactPlays = exactHourlyPlays.reduce((a, b) => a + b, 0);
    const circadian = this.computeHourlyCircadian(masterState);
    const globalHourly = circadian.hourlyPlays;
    const globalTotal = globalHourly.reduce((a, b) => a + b, 0) || 1;

    for (let h = 0; h < 24; h++) {
      let weight = 0;
      if (totalExactPlays > 0) {
        weight = 0.6 * (exactHourlyPlays[h] / totalExactPlays) + 0.4 * (globalHourly[h] / globalTotal);
      } else {
        weight = globalHourly[h] / globalTotal;
      }
      projectedHourlyHours[h] = parseFloat(((totalMs * weight) / 3600000).toFixed(2));
    }

    return {
      dateStr,
      totalMs,
      totalPlays,
      totalHours,
      totalMinutes,
      totalSeconds,
      formattedTime: `${totalHours}h ${totalMinutes}m`,
      uniqueSongs: dayTracks.length,
      uniqueArtists: artistMap.size,
      topSong: dayTracks[0] || null,
      topArtist: topArtists[0] || null,
      topArtists,
      tracks: dayTracks,
      exactHourlyPlays,
      projectedHourlyHours
    };
  }

  /**
   * Section F: Song Loyalty vs. Binge Matrix
   * Compares Daily Rituals (7-10+ days) vs. Single-Day Obsessions (>60% time in 1 day)
   */
  static computeSongLoyaltyVsBinge(filteredState) {
    const { tracks } = filteredState;

    // Daily Rituals: Songs played across the most distinct days
    const dailyRituals = [...tracks]
      .filter(t => t.days && Object.keys(t.days).length >= 2)
      .map(t => {
        const daysKeys = Object.keys(t.days);
        const distinctDays = daysKeys.length;
        const totalMinutes = Math.round((t.ms || 0) / 60000);
        return {
          ...t,
          distinctDays,
          totalMinutes
        };
      })
      .sort((a, b) => b.distinctDays - a.distinctDays || b.ms - a.ms)
      .slice(0, 8);

    // Single-Day Obsessions: Songs where a large % of listening happened on 1 day
    const singleDayObsessions = [...tracks]
      .filter(t => t.days && (t.ms >= 15 * 60000 || t.plays >= 3))
      .map(t => {
        const daysEntries = Object.entries(t.days);
        daysEntries.sort((a, b) => b[1].ms - a[1].ms);
        const topDay = daysEntries[0];
        const topDayMs = topDay ? topDay[1].ms : 0;
        const bingePct = t.ms > 0 ? Math.round((topDayMs / t.ms) * 100) : 0;
        return {
          ...t,
          bingeDate: topDay ? topDay[0] : "",
          topDayMinutes: Math.round(topDayMs / 60000),
          bingePct
        };
      })
      .filter(t => t.bingePct >= 50)
      .sort((a, b) => b.bingePct - a.bingePct || b.ms - a.ms)
      .slice(0, 8);

    return {
      dailyRituals,
      singleDayObsessions
    };
  }
}
