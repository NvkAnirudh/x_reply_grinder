// Popup script for X Reply Grinder

const BLOCKS_PER_DAY = 20;
const REPLIES_PER_BLOCK = 5;

// DOM Elements
const elements = {
  streakBadge: document.getElementById('streakBadge'),
  streakCount: document.getElementById('streakCount'),
  flameIcon: document.getElementById('flameIcon'),
  rankBadge: document.getElementById('rankBadge'),
  rankProgressBar: document.getElementById('rankProgressBar'),
  rankNext: document.getElementById('rankNext'),
  blocksCompleted: document.getElementById('blocksCompleted'),
  progressRing: document.getElementById('progressRing'),
  currentBlockNum: document.getElementById('currentBlockNum'),
  currentBlockProgress: document.getElementById('currentBlockProgress'),
  blockDots: document.getElementById('blockDots'),
  totalReplies: document.getElementById('totalReplies'),
  heatmap: document.getElementById('heatmap'),
  currentStreakStat: document.getElementById('currentStreakStat'),
  bestStreakStat: document.getElementById('bestStreakStat'),
  lifetimeBlocksStat: document.getElementById('lifetimeBlocksStat'),
  lifetimeRepliesStat: document.getElementById('lifetimeRepliesStat'),
  timerToggle: document.getElementById('timerToggle'),
  timerContent: document.getElementById('timerContent'),
  timerValue: document.getElementById('timerValue'),
  sessionBlocks: document.getElementById('sessionBlocks'),
  soundToggle: document.getElementById('soundToggle')
};

let timerInterval = null;

// Add SVG gradient definition
function addSvgGradient() {
  const svg = document.querySelector('.progress-ring');
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  defs.innerHTML = `
    <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#1d9bf0"/>
      <stop offset="100%" stop-color="#00ba7c"/>
    </linearGradient>
  `;
  svg.insertBefore(defs, svg.firstChild);

  // Apply gradient to the fill circle
  elements.progressRing.style.stroke = 'url(#progressGradient)';
}

// Update flame icon based on streak
function updateFlameIcon(streak) {
  const flame = elements.flameIcon;
  flame.className = 'flame';

  if (streak === 0) {
    flame.textContent = '';
    elements.streakBadge.style.opacity = '0.5';
  } else if (streak < 3) {
    flame.textContent = '';
    elements.streakBadge.style.opacity = '1';
  } else if (streak < 7) {
    flame.textContent = '';
  } else if (streak < 14) {
    flame.textContent = '';
  } else {
    flame.textContent = '';
  }
}

// Update progress ring
function updateProgressRing(blocks) {
  const circumference = 2 * Math.PI * 52; // r = 52
  const progress = blocks / BLOCKS_PER_DAY;
  const offset = circumference * (1 - progress);
  elements.progressRing.style.strokeDashoffset = offset;
}

// Update block dots
function updateBlockDots(repliesInCurrentBlock) {
  const dots = elements.blockDots.querySelectorAll('.dot');
  dots.forEach((dot, index) => {
    if (index < repliesInCurrentBlock) {
      dot.classList.add('filled');
    } else {
      dot.classList.remove('filled');
    }
  });
}

// Generate weekly heatmap
function generateHeatmap(weeklyData) {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const today = new Date();
  elements.heatmap.innerHTML = '';

  for (let i = 6; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateKey = date.toISOString().split('T')[0];
    const dayName = days[date.getDay()];
    const count = weeklyData[dateKey] || 0;

    // Determine level (0-4) based on replies
    let level = 0;
    if (count > 0) level = 1;
    if (count >= 25) level = 2;
    if (count >= 50) level = 3;
    if (count >= 100) level = 4;

    const dayEl = document.createElement('div');
    dayEl.className = 'heatmap-day';
    dayEl.innerHTML = `
      <span class="heatmap-label">${dayName}</span>
      <div class="heatmap-cell level-${level}" title="${count} replies"></div>
      <span class="heatmap-count">${count}</span>
    `;

    elements.heatmap.appendChild(dayEl);
  }
}

// Format time for timer display
function formatTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

// Update timer display
function updateTimer(sessionStartTime, sessionReplies) {
  if (!sessionStartTime) return;

  const elapsed = Date.now() - sessionStartTime;
  elements.timerValue.textContent = formatTime(elapsed);
  elements.sessionBlocks.textContent = Math.floor(sessionReplies / REPLIES_PER_BLOCK);

  // Check if 30 minutes have passed
  if (elapsed >= 30 * 60 * 1000) {
    const sessionBlocks = Math.floor(sessionReplies / REPLIES_PER_BLOCK);
    if (sessionBlocks >= 4) {
      elements.timerValue.style.color = '#00ba7c';
    } else {
      elements.timerValue.style.color = '#f91880';
    }
  }
}

// Load and display stats
async function loadStats() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_STATS' });

    if (!response) return;

    const { stats, rank, nextRank } = response;

    // Update streak
    elements.streakCount.textContent = stats.currentStreak;
    updateFlameIcon(stats.currentStreak);

    // Update rank
    elements.rankBadge.textContent = rank.name;

    if (nextRank) {
      const progress = ((stats.lifetimeBlocks - rank.minBlocks) / (nextRank.minBlocks - rank.minBlocks)) * 100;
      elements.rankProgressBar.style.width = `${Math.min(progress, 100)}%`;
      elements.rankNext.textContent = `Next: ${nextRank.name} (${nextRank.minBlocks} blocks)`;
    } else {
      elements.rankProgressBar.style.width = '100%';
      elements.rankNext.textContent = 'Max rank achieved!';
    }

    // Update today's progress
    elements.blocksCompleted.textContent = stats.todayBlocks;
    updateProgressRing(stats.todayBlocks);

    const repliesInCurrentBlock = stats.todayReplies % REPLIES_PER_BLOCK;
    const currentBlockNum = stats.todayBlocks + (repliesInCurrentBlock > 0 || stats.todayBlocks === 0 ? 1 : 0);
    elements.currentBlockNum.textContent = Math.min(currentBlockNum, BLOCKS_PER_DAY);
    elements.currentBlockProgress.textContent = `${repliesInCurrentBlock}/5 replies`;
    updateBlockDots(repliesInCurrentBlock);

    elements.totalReplies.textContent = stats.todayReplies;

    // Update heatmap
    generateHeatmap(stats.weeklyData || {});

    // Update stats
    elements.currentStreakStat.textContent = stats.currentStreak;
    elements.bestStreakStat.textContent = stats.bestStreak;
    elements.lifetimeBlocksStat.textContent = stats.lifetimeBlocks;
    elements.lifetimeRepliesStat.textContent = stats.lifetimeReplies;

    // Update toggles
    if (stats.soundEnabled) {
      elements.soundToggle.classList.add('active');
      elements.soundToggle.querySelector('.toggle-label').textContent = 'ON';
    } else {
      elements.soundToggle.classList.remove('active');
      elements.soundToggle.querySelector('.toggle-label').textContent = 'OFF';
    }

    if (stats.timerEnabled) {
      elements.timerToggle.classList.add('active');
      elements.timerToggle.querySelector('.toggle-label').textContent = 'ON';
      elements.timerContent.classList.add('active');

      // Start timer interval
      if (timerInterval) clearInterval(timerInterval);
      timerInterval = setInterval(() => {
        updateTimer(stats.sessionStartTime, stats.sessionReplies);
      }, 1000);
      updateTimer(stats.sessionStartTime, stats.sessionReplies);
    } else {
      elements.timerToggle.classList.remove('active');
      elements.timerToggle.querySelector('.toggle-label').textContent = 'OFF';
      elements.timerContent.classList.remove('active');

      if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
      }
    }

  } catch (e) {
    console.error('Error loading stats:', e);
  }
}

// Event listeners
elements.soundToggle.addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'TOGGLE_SOUND' });
  loadStats();
});

elements.timerToggle.addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'TOGGLE_TIMER' });
  loadStats();
});

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  addSvgGradient();
  loadStats();

  // Refresh stats periodically
  setInterval(loadStats, 5000);
});

// Clean up on close
window.addEventListener('unload', () => {
  if (timerInterval) {
    clearInterval(timerInterval);
  }
});
