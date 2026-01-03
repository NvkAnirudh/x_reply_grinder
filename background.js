// Background service worker for X Reply Grinder

const BLOCKS_PER_DAY = 20;
const REPLIES_PER_BLOCK = 5;
const DAILY_GOAL = BLOCKS_PER_DAY * REPLIES_PER_BLOCK; // 100 replies
const SESSION_DURATION_MS = 30 * 60 * 1000; // 30 minutes
const BLOCKS_PER_SESSION = 4; // 4 blocks per 30-min session
const SESSIONS_PER_DAY = 5; // 5 sessions = 2.5 hours total

// Rank definitions based on lifetime blocks
const RANKS = [
  { name: "Reply Rookie", minBlocks: 0 },
  { name: "Comment Cadet", minBlocks: 20 },
  { name: "Engagement Explorer", minBlocks: 100 },
  { name: "Reply Warrior", minBlocks: 250 },
  { name: "Comment Commander", minBlocks: 500 },
  { name: "Engagement Expert", minBlocks: 1000 },
  { name: "Distribution Dynamo", minBlocks: 2500 },
  { name: "Reply Legend", minBlocks: 5000 },
  { name: "Distribution Machine", minBlocks: 10000 }
];

// Get today's date key in user's timezone, resetting at 7 PM EST
function getTodayKey() {
  const now = new Date();
  // Convert to EST
  const estOffset = -5 * 60; // EST is UTC-5
  const localOffset = now.getTimezoneOffset();
  const estTime = new Date(now.getTime() + (localOffset + estOffset) * 60000);

  // If it's before 7 PM EST, use previous day
  let dateKey;
  if (estTime.getHours() < 19) {
    const yesterday = new Date(estTime);
    yesterday.setDate(yesterday.getDate() - 1);
    dateKey = yesterday.toISOString().split('T')[0];
  } else {
    dateKey = estTime.toISOString().split('T')[0];
  }

  return dateKey;
}

// Get rank based on lifetime blocks
function getRank(lifetimeBlocks) {
  let currentRank = RANKS[0];
  for (const rank of RANKS) {
    if (lifetimeBlocks >= rank.minBlocks) {
      currentRank = rank;
    }
  }
  return currentRank;
}

// Get next rank
function getNextRank(lifetimeBlocks) {
  for (const rank of RANKS) {
    if (lifetimeBlocks < rank.minBlocks) {
      return rank;
    }
  }
  return null; // Max rank achieved
}

// Initialize or get stats
async function getStats() {
  const result = await chrome.storage.local.get(['stats']);
  const todayKey = getTodayKey();

  const defaultStats = {
    todayReplies: 0,
    todayBlocks: 0,
    todayKey: todayKey,
    currentStreak: 0,
    bestStreak: 0,
    lifetimeBlocks: 0,
    lifetimeReplies: 0,
    weeklyData: {},
    lastActiveDate: null,
    soundEnabled: true,
    timerEnabled: false,
    sessionStartTime: null,
    sessionReplies: 0,
    sessionBlocks: 0,
    sessionsCompleted: 0,
    totalSessionTime: 0 // Total time spent in sessions today (ms)
  };

  let stats = result.stats || defaultStats;

  // Reset daily stats if it's a new day
  if (stats.todayKey !== todayKey) {
    // Check if yesterday's goal was met for streak
    const yesterdayBlocks = stats.todayBlocks;

    if (stats.lastActiveDate) {
      const lastDate = new Date(stats.lastActiveDate);
      const today = new Date(todayKey);
      const diffDays = Math.floor((today - lastDate) / (1000 * 60 * 60 * 24));

      if (diffDays === 1 && yesterdayBlocks >= BLOCKS_PER_DAY) {
        stats.currentStreak++;
        if (stats.currentStreak > stats.bestStreak) {
          stats.bestStreak = stats.currentStreak;
        }
      } else if (diffDays > 1 || yesterdayBlocks < BLOCKS_PER_DAY) {
        stats.currentStreak = 0;
      }
    }

    stats.todayReplies = 0;
    stats.todayBlocks = 0;
    stats.todayKey = todayKey;
    stats.sessionStartTime = null;
    stats.sessionReplies = 0;
    stats.sessionBlocks = 0;
    stats.sessionsCompleted = 0;
    stats.totalSessionTime = 0;

    await chrome.storage.local.set({ stats });
  }

  // Data integrity check - ensure lifetime >= today
  // This fixes any corruption from previous bugs
  if (stats.lifetimeReplies < stats.todayReplies) {
    stats.lifetimeReplies = stats.todayReplies;
    await chrome.storage.local.set({ stats });
  }
  if (stats.lifetimeBlocks < stats.todayBlocks) {
    stats.lifetimeBlocks = stats.todayBlocks;
    await chrome.storage.local.set({ stats });
  }

  // Ensure sessionsCompleted exists and is valid
  if (typeof stats.sessionsCompleted !== 'number') {
    stats.sessionsCompleted = 0;
    await chrome.storage.local.set({ stats });
  }

  return stats;
}

// Calculate session stats and backlog
function calculateSessionStats(stats) {
  const now = Date.now();
  let currentSessionTime = 0;
  let currentSessionBlocks = 0;
  let currentSessionReplies = 0;

  // Calculate current session progress if timer is active
  if (stats.timerEnabled && stats.sessionStartTime) {
    currentSessionTime = now - stats.sessionStartTime;
    // Use the session blocks/replies from stats, which are tracked during the session
    currentSessionBlocks = stats.sessionBlocks || 0;
    currentSessionReplies = stats.sessionReplies || 0;
  }

  const completedSessions = Math.max(0, stats.sessionsCompleted || 0);

  // Backlog calculation: SESSION-SPECIFIC
  // Only care about current session performance vs target (4 blocks)
  let backlog = 0;
  let backlogReplies = 0;

  if (stats.timerEnabled && stats.sessionStartTime) {
    // Currently in a session - calculate backlog for THIS session only
    const sessionTarget = BLOCKS_PER_SESSION; // Always 4 blocks per session
    const sessionActual = currentSessionBlocks;
    backlog = Math.max(0, sessionTarget - sessionActual);
    backlogReplies = backlog * REPLIES_PER_BLOCK;
  }
  // If no active session, backlog is 0 (not tracking cumulative backlog across days)

  return {
    currentSessionTime,
    currentSessionBlocks,
    currentSessionReplies,
    completedSessions,
    backlog,
    backlogReplies,
    remainingSessions: Math.max(0, SESSIONS_PER_DAY - completedSessions - (stats.timerEnabled ? 1 : 0))
  };
}

// Update stats when a reply is detected
async function incrementReply() {
  const stats = await getStats();
  const todayKey = getTodayKey();

  stats.todayReplies++;
  stats.lifetimeReplies++;
  stats.lastActiveDate = todayKey;

  // Update weekly data
  if (!stats.weeklyData[todayKey]) {
    stats.weeklyData[todayKey] = 0;
  }
  stats.weeklyData[todayKey]++;

  // Clean up old weekly data (keep only last 7 days)
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekAgoKey = weekAgo.toISOString().split('T')[0];
  for (const key of Object.keys(stats.weeklyData)) {
    if (key < weekAgoKey) {
      delete stats.weeklyData[key];
    }
  }

  // Check for block completion
  const previousBlocks = stats.todayBlocks;
  stats.todayBlocks = Math.floor(stats.todayReplies / REPLIES_PER_BLOCK);

  const blockCompleted = stats.todayBlocks > previousBlocks;

  if (blockCompleted) {
    stats.lifetimeBlocks++;

    // Check for streak update if daily goal met
    if (stats.todayBlocks >= BLOCKS_PER_DAY && previousBlocks < BLOCKS_PER_DAY) {
      stats.currentStreak++;
      if (stats.currentStreak > stats.bestStreak) {
        stats.bestStreak = stats.currentStreak;
      }
    }
  }

  // Update session stats
  if (stats.timerEnabled) {
    if (!stats.sessionStartTime) {
      stats.sessionStartTime = Date.now();
      stats.sessionReplies = 0;
      stats.sessionBlocks = 0;
    }
    stats.sessionReplies++;
    if (blockCompleted) {
      stats.sessionBlocks++;
    }
  }

  await chrome.storage.local.set({ stats });

  return {
    stats,
    blockCompleted,
    newBlockNumber: stats.todayBlocks,
    rank: getRank(stats.lifetimeBlocks),
    nextRank: getNextRank(stats.lifetimeBlocks)
  };
}

// Message handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'REPLY_DETECTED') {
    incrementReply().then(result => {
      sendResponse(result);
    });
    return true; // Keep channel open for async response
  }

  if (message.type === 'GET_STATS') {
    getStats().then(stats => {
      const sessionStats = calculateSessionStats(stats);
      sendResponse({
        stats,
        sessionStats,
        rank: getRank(stats.lifetimeBlocks),
        nextRank: getNextRank(stats.lifetimeBlocks),
        BLOCKS_PER_DAY,
        REPLIES_PER_BLOCK,
        BLOCKS_PER_SESSION,
        SESSIONS_PER_DAY
      });
    });
    return true;
  }

  if (message.type === 'TOGGLE_SOUND') {
    getStats().then(async stats => {
      stats.soundEnabled = !stats.soundEnabled;
      await chrome.storage.local.set({ stats });
      sendResponse({ soundEnabled: stats.soundEnabled });
    });
    return true;
  }

  if (message.type === 'TOGGLE_TIMER') {
    getStats().then(async stats => {
      const wasEnabled = stats.timerEnabled;
      stats.timerEnabled = !stats.timerEnabled;

      if (stats.timerEnabled) {
        // Start new session
        stats.sessionStartTime = Date.now();
        stats.sessionReplies = 0;
        stats.sessionBlocks = 0;
      } else {
        // End current session - save progress
        // Only count as completed if session was actually running
        if (wasEnabled && stats.sessionStartTime) {
          const sessionDuration = Date.now() - stats.sessionStartTime;

          // Always count the session as completed when manually ended
          // (even if less than 30 mins)
          stats.totalSessionTime += sessionDuration;
          stats.sessionsCompleted = (stats.sessionsCompleted || 0) + 1;

          // Cap at max sessions per day
          stats.sessionsCompleted = Math.min(stats.sessionsCompleted, SESSIONS_PER_DAY);
        }

        stats.sessionStartTime = null;
        stats.sessionReplies = 0;
        stats.sessionBlocks = 0;
      }

      await chrome.storage.local.set({ stats });
      sendResponse({ timerEnabled: stats.timerEnabled, sessionsCompleted: stats.sessionsCompleted });
    });
    return true;
  }

  if (message.type === 'START_SESSION') {
    getStats().then(async stats => {
      stats.timerEnabled = true;
      stats.sessionStartTime = Date.now();
      stats.sessionReplies = 0;
      stats.sessionBlocks = 0;
      await chrome.storage.local.set({ stats });
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.type === 'END_SESSION') {
    getStats().then(async stats => {
      if (stats.timerEnabled && stats.sessionStartTime) {
        const sessionDuration = Date.now() - stats.sessionStartTime;
        stats.totalSessionTime += sessionDuration;
        stats.sessionsCompleted = (stats.sessionsCompleted || 0) + 1;
        stats.sessionsCompleted = Math.min(stats.sessionsCompleted, SESSIONS_PER_DAY);
      }
      stats.timerEnabled = false;
      stats.sessionStartTime = null;
      stats.sessionReplies = 0;
      stats.sessionBlocks = 0;
      await chrome.storage.local.set({ stats });
      sendResponse({ success: true, sessionsCompleted: stats.sessionsCompleted });
    });
    return true;
  }

  if (message.type === 'SET_MANUAL_COUNT') {
    getStats().then(async stats => {
      const newCount = message.count;
      const todayKey = getTodayKey();

      // Calculate differences
      const oldTodayReplies = stats.todayReplies;
      const oldTodayBlocks = stats.todayBlocks;

      // Update today's stats
      stats.todayReplies = newCount;
      stats.todayBlocks = Math.floor(newCount / REPLIES_PER_BLOCK);
      stats.lastActiveDate = todayKey;

      // Calculate actual change in today's stats
      const replyChange = stats.todayReplies - oldTodayReplies;
      const blockChange = stats.todayBlocks - oldTodayBlocks;

      // Update lifetime stats by the change amount
      // This ensures lifetime always reflects cumulative progress
      stats.lifetimeReplies += replyChange;
      stats.lifetimeBlocks += blockChange;

      // Ensure lifetime is never less than today (safety check)
      stats.lifetimeReplies = Math.max(stats.lifetimeReplies, stats.todayReplies);
      stats.lifetimeBlocks = Math.max(stats.lifetimeBlocks, stats.todayBlocks);

      // Update weekly data
      stats.weeklyData[todayKey] = newCount;

      // If session is active, adjust session stats
      // When manual count is set during a session, we need to account for what
      // was already in the session before the manual adjustment
      if (stats.timerEnabled && stats.sessionStartTime) {
        // The session should track only new replies added during this session
        // If manual count increased today's total, but those replies weren't from this session,
        // we need to adjust sessionReplies accordingly
        // For simplicity: if manual count is being set, assume session just started
        // and reset session counters (user can re-log during session)
        stats.sessionReplies = 0;
        stats.sessionBlocks = 0;
      }

      await chrome.storage.local.set({ stats });
      sendResponse({ success: true, stats });
    });
    return true;
  }
});

// Set up daily reset alarm
chrome.alarms.create('dailyReset', {
  periodInMinutes: 60 // Check every hour
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'dailyReset') {
    // This will trigger reset if needed
    await getStats();
  }
});

// Handle keyboard shortcut command
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'log-reply') {
    // Send message to active tab's content script
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && (tab.url?.includes('x.com') || tab.url?.includes('twitter.com'))) {
      chrome.tabs.sendMessage(tab.id, { type: 'LOG_REPLY_SHORTCUT' });
    }
  }
});
