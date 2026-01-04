// X Reply Grinder - Content Script with Floating Widget

(function() {
  'use strict';

  const BLOCKS_PER_DAY = 20;
  const REPLIES_PER_BLOCK = 5;

  // Rank definitions
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

  let widgetState = {
    expanded: false,
    minimized: false,
    position: { x: 20, y: 100 },
    isDragging: false,
    dragOffset: { x: 0, y: 0 },
    selectedDayOffset: 0, // 0 = today, -1 = yesterday, -2 = 2 days ago, etc.
    dailyHistory: {} // Cache of daily history data
  };

  // Load saved position
  async function loadPosition() {
    try {
      const result = await chrome.storage.local.get(['widgetPosition']);
      if (result.widgetPosition) {
        widgetState.position = result.widgetPosition;
      }
    } catch (e) {}
  }

  // Save position
  async function savePosition() {
    try {
      await chrome.storage.local.set({ widgetPosition: widgetState.position });
    } catch (e) {}
  }

  // Get rank info
  function getRank(lifetimeBlocks) {
    let currentRank = RANKS[0];
    for (const rank of RANKS) {
      if (lifetimeBlocks >= rank.minBlocks) {
        currentRank = rank;
      }
    }
    return currentRank;
  }

  function getNextRank(lifetimeBlocks) {
    for (const rank of RANKS) {
      if (lifetimeBlocks < rank.minBlocks) {
        return rank;
      }
    }
    return null;
  }

  // Create the widget HTML
  function createWidgetHTML() {
    return `
      <div id="xrg-widget">
        <!-- Compact Card -->
        <div class="xrg-compact">
          <div class="xrg-mini-ring">
            <svg viewBox="0 0 36 36">
              <circle class="xrg-mini-ring-bg" cx="18" cy="18" r="16"/>
              <circle class="xrg-mini-ring-fill" cx="18" cy="18" r="16"/>
            </svg>
            <span class="xrg-mini-ring-text">0</span>
          </div>
          <div class="xrg-compact-info">
            <div class="xrg-compact-block">Block 1: 0/5</div>
            <div class="xrg-compact-dots">
              <span class="xrg-compact-dot"></span>
              <span class="xrg-compact-dot"></span>
              <span class="xrg-compact-dot"></span>
              <span class="xrg-compact-dot"></span>
              <span class="xrg-compact-dot"></span>
            </div>
          </div>
          <div class="xrg-compact-streak inactive">
            <span>🔥</span>
            <span class="xrg-streak-num">0</span>
          </div>
          <button class="xrg-log-btn">+1</button>
        </div>

        <!-- Expanded Sidebar -->
        <div class="xrg-sidebar">
          <div class="xrg-sidebar-header">
            <div class="xrg-sidebar-title">
              <span>𝕏</span>
              <span>Reply Grinder</span>
            </div>
            <button class="xrg-close-btn">×</button>
          </div>

          <div class="xrg-sidebar-content">
            <!-- Rank -->
            <div class="xrg-rank-section">
              <div class="xrg-rank-badge">Reply Rookie</div>
              <div class="xrg-rank-progress">
                <div class="xrg-rank-progress-bar"></div>
              </div>
              <div class="xrg-rank-next">Next: Comment Cadet (20 blocks)</div>
            </div>

            <!-- Day Selector -->
            <div class="xrg-day-selector">
              <button class="xrg-day-nav xrg-day-prev" title="Previous day">‹</button>
              <div class="xrg-day-label">Today</div>
              <button class="xrg-day-nav xrg-day-next" title="Next day" disabled>›</button>
            </div>

            <!-- Progress Ring -->
            <div class="xrg-section-title"><span class="xrg-progress-day-title">Today</span>'s Progress</div>
            <div class="xrg-progress-section">
              <div class="xrg-progress-ring-container">
                <svg class="xrg-progress-ring" viewBox="0 0 120 120">
                  <defs>
                    <linearGradient id="xrg-progress-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stop-color="#1d9bf0"/>
                      <stop offset="100%" stop-color="#00ba7c"/>
                    </linearGradient>
                  </defs>
                  <circle class="xrg-progress-ring-bg" cx="60" cy="60" r="52"/>
                  <circle class="xrg-progress-ring-fill" cx="60" cy="60" r="52"/>
                </svg>
                <div class="xrg-progress-ring-text">
                  <span class="xrg-blocks-count">0</span>
                  <span class="xrg-blocks-label">/20 blocks</span>
                </div>
              </div>

              <!-- Current Block -->
              <div class="xrg-current-block">
                <div class="xrg-current-block-label">
                  <span>Block <span class="xrg-current-block-num">1</span></span>
                  <span class="xrg-current-block-progress">0/5 replies</span>
                </div>
                <div class="xrg-block-dots">
                  <span class="xrg-block-dot"></span>
                  <span class="xrg-block-dot"></span>
                  <span class="xrg-block-dot"></span>
                  <span class="xrg-block-dot"></span>
                  <span class="xrg-block-dot"></span>
                </div>
              </div>

              <!-- Total -->
              <div class="xrg-total-replies">
                <span class="xrg-total-label">Total replies today: </span>
                <span class="xrg-total-count">0</span>
                <span class="xrg-total-goal">/100</span>
              </div>
            </div>

            <!-- Log Button -->
            <button class="xrg-log-btn-large">
              <span>+1 Log Reply</span>
              <span class="xrg-shortcut-hint">⌘⇧R</span>
            </button>

            <!-- Manual Count Adjustment -->
            <div class="xrg-manual-adjust-section">
              <div class="xrg-section-title">Adjust Counts</div>
              <div class="xrg-manual-adjust-row">
                <label class="xrg-manual-label">Today's Replies:</label>
                <div class="xrg-manual-adjust-container">
                  <input
                    type="number"
                    class="xrg-manual-input xrg-manual-today"
                    placeholder="0"
                    min="0"
                    max="1000"
                  />
                  <button class="xrg-manual-set-btn xrg-set-today">Set</button>
                </div>
              </div>
              <div class="xrg-manual-adjust-row">
                <label class="xrg-manual-label">Lifetime Replies:</label>
                <div class="xrg-manual-adjust-container">
                  <input
                    type="number"
                    class="xrg-manual-input xrg-manual-lifetime"
                    placeholder="0"
                    min="0"
                    max="100000"
                  />
                  <button class="xrg-manual-set-btn xrg-set-lifetime">Set</button>
                </div>
              </div>
              <div class="xrg-manual-help">Adjust if starting counts are incorrect</div>
            </div>

            <!-- Session Timer -->
            <div class="xrg-timer-section">
              <div class="xrg-section-title">Session Timer</div>
              <div class="xrg-timer-controls">
                <button class="xrg-timer-btn xrg-timer-toggle">
                  <span class="xrg-timer-btn-text">Start Session</span>
                </button>
              </div>
              <div class="xrg-timer-display" style="display: none;">
                <div class="xrg-timer-time">00:00</div>
                <div class="xrg-timer-progress-bar">
                  <div class="xrg-timer-progress-fill"></div>
                </div>
                <div class="xrg-timer-target">Target: 4 blocks (20 replies) in 30 min</div>
                <div class="xrg-session-stats-grid">
                  <div class="xrg-session-stat">
                    <span class="xrg-session-stat-value xrg-session-blocks">0</span>
                    <span class="xrg-session-stat-label">Blocks</span>
                  </div>
                  <div class="xrg-session-stat">
                    <span class="xrg-session-stat-value xrg-session-replies">0</span>
                    <span class="xrg-session-stat-label">Replies</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Session History Section -->
            <div class="xrg-session-history-section">
              <div class="xrg-section-title">Today's Sessions</div>
              <div class="xrg-session-history-container">
                <div class="xrg-no-sessions">No sessions completed yet</div>
                <div class="xrg-session-list"></div>
              </div>
            </div>

            <!-- Heatmap -->
            <div class="xrg-heatmap-section">
              <div class="xrg-section-title">This Week</div>
              <div class="xrg-heatmap"></div>
            </div>

            <!-- Stats -->
            <div class="xrg-stats-section">
              <div class="xrg-stat-card">
                <span class="xrg-stat-value xrg-current-streak">0</span>
                <span class="xrg-stat-label">Current Streak</span>
              </div>
              <div class="xrg-stat-card">
                <span class="xrg-stat-value xrg-best-streak">0</span>
                <span class="xrg-stat-label">Best Streak</span>
              </div>
              <div class="xrg-stat-card">
                <span class="xrg-stat-value xrg-lifetime-blocks">0</span>
                <span class="xrg-stat-label">Lifetime Blocks</span>
              </div>
              <div class="xrg-stat-card">
                <span class="xrg-stat-value xrg-lifetime-replies">0</span>
                <span class="xrg-stat-label">Lifetime Replies</span>
              </div>
            </div>

            <!-- Settings -->
            <div class="xrg-settings-section">
              <div class="xrg-section-title">Settings</div>
              <div class="xrg-setting-row">
                <span>Sound effects</span>
                <button class="xrg-toggle-btn xrg-sound-toggle active">
                  <span class="xrg-toggle-label">ON</span>
                </button>
              </div>
              <div class="xrg-setting-row">
                <span>Debug Info</span>
                <button class="xrg-debug-btn">View Storage</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // Inject widget into page
  function injectWidget() {
    if (document.getElementById('xrg-widget')) return;

    const container = document.createElement('div');
    container.innerHTML = createWidgetHTML();
    document.body.appendChild(container.firstElementChild);

    const widget = document.getElementById('xrg-widget');
    updateWidgetPosition();
    setupEventListeners();
    refreshStats();

    // Update shortcut hint based on OS
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const shortcutHint = widget.querySelector('.xrg-shortcut-hint');
    if (shortcutHint) {
      shortcutHint.textContent = isMac ? '⌘⇧R' : 'Ctrl+Shift+R';
    }
  }

  // Update widget position
  function updateWidgetPosition() {
    const widget = document.getElementById('xrg-widget');
    if (!widget) return;

    widget.style.right = `${widgetState.position.x}px`;
    widget.style.top = `${widgetState.position.y}px`;
  }

  // Setup event listeners
  function setupEventListeners() {
    const widget = document.getElementById('xrg-widget');
    if (!widget) return;

    const compact = widget.querySelector('.xrg-compact');
    const sidebar = widget.querySelector('.xrg-sidebar');
    const closeBtn = widget.querySelector('.xrg-close-btn');
    const logBtn = widget.querySelector('.xrg-log-btn');
    const logBtnLarge = widget.querySelector('.xrg-log-btn-large');
    const soundToggle = widget.querySelector('.xrg-sound-toggle');
    const manualTodayInput = widget.querySelector('.xrg-manual-today');
    const manualLifetimeInput = widget.querySelector('.xrg-manual-lifetime');
    const setTodayBtn = widget.querySelector('.xrg-set-today');
    const setLifetimeBtn = widget.querySelector('.xrg-set-lifetime');
    const timerToggle = widget.querySelector('.xrg-timer-toggle');
    const debugBtn = widget.querySelector('.xrg-debug-btn');
    const dayPrevBtn = widget.querySelector('.xrg-day-prev');
    const dayNextBtn = widget.querySelector('.xrg-day-next');

    // Day navigation
    dayPrevBtn.addEventListener('click', () => {
      widgetState.selectedDayOffset--;
      updateDayNavigation();
      refreshStats();
    });

    dayNextBtn.addEventListener('click', () => {
      widgetState.selectedDayOffset++;
      updateDayNavigation();
      refreshStats();
    });

    // Click compact to expand
    compact.addEventListener('click', (e) => {
      if (widgetState.isDragging) return;
      if (e.target.closest('.xrg-log-btn')) return;

      widgetState.expanded = true;
      widget.classList.add('expanded');
    });

    // Close sidebar
    closeBtn.addEventListener('click', closeSidebar);

    // Log buttons
    logBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      logReply();
    });

    logBtnLarge.addEventListener('click', logReply);

    // Sound toggle
    soundToggle.addEventListener('click', async () => {
      await chrome.runtime.sendMessage({ type: 'TOGGLE_SOUND' });
      refreshStats();
    });

    // Manual count adjustment
    setTodayBtn.addEventListener('click', () => setManualTodayCount());
    manualTodayInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        setManualTodayCount();
      }
    });

    setLifetimeBtn.addEventListener('click', () => setManualLifetimeCount());
    manualLifetimeInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        setManualLifetimeCount();
      }
    });

    // Timer toggle
    timerToggle.addEventListener('click', async () => {
      console.log('XRG: Timer toggle clicked');
      const response = await chrome.runtime.sendMessage({ type: 'TOGGLE_TIMER' });
      console.log('XRG: Timer toggle response:', response);
      refreshStats();
    });

    // Debug button
    debugBtn.addEventListener('click', async () => {
      const result = await chrome.storage.local.get(['stats']);
      console.log('XRG: Storage Data:', result.stats);
      alert('Storage data logged to console (F12).\n\nKey values:\n' +
        `Today: ${result.stats?.todayReplies || 0} replies, ${result.stats?.todayBlocks || 0} blocks\n` +
        `Lifetime: ${result.stats?.lifetimeReplies || 0} replies, ${result.stats?.lifetimeBlocks || 0} blocks\n` +
        `Sessions completed: ${result.stats?.sessionsCompleted || 0}/5\n` +
        `Timer enabled: ${result.stats?.timerEnabled || false}`
      );
    });

    // Dragging
    compact.addEventListener('mousedown', startDrag);
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', endDrag);

    // Keyboard shortcut (backup - main one is via chrome.commands)
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'r') {
        e.preventDefault();
        logReply();
      }
    });
  }

  function closeSidebar() {
    const widget = document.getElementById('xrg-widget');
    widgetState.expanded = false;
    widget.classList.remove('expanded');
  }

  // Drag handlers
  function startDrag(e) {
    if (e.target.closest('.xrg-log-btn')) return;

    const widget = document.getElementById('xrg-widget');
    const rect = widget.getBoundingClientRect();

    widgetState.isDragging = true;
    widgetState.dragOffset = {
      x: window.innerWidth - rect.right + (e.clientX - rect.left),
      y: e.clientY - rect.top
    };

    widget.classList.add('dragging');
  }

  function drag(e) {
    if (!widgetState.isDragging) return;

    const newX = window.innerWidth - e.clientX - (widgetState.dragOffset.x - (e.clientX - (window.innerWidth - widgetState.position.x - widgetState.dragOffset.x)));
    const newY = e.clientY - widgetState.dragOffset.y;

    widgetState.position = {
      x: Math.max(0, Math.min(window.innerWidth - 220, window.innerWidth - e.clientX)),
      y: Math.max(0, Math.min(window.innerHeight - 100, newY))
    };

    updateWidgetPosition();
  }

  function endDrag() {
    if (widgetState.isDragging) {
      widgetState.isDragging = false;
      const widget = document.getElementById('xrg-widget');
      widget.classList.remove('dragging');
      savePosition();

      // Prevent click event from firing
      setTimeout(() => {
        widgetState.isDragging = false;
      }, 100);
    }
  }

  // Log a reply
  async function logReply() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'REPLY_DETECTED' });

      if (response) {
        const { stats, blockCompleted, newBlockNumber } = response;

        // Switch to today's view when logging
        widgetState.selectedDayOffset = 0;

        // Update UI
        refreshStats();

        // Visual feedback on button
        const logBtns = document.querySelectorAll('.xrg-log-btn, .xrg-log-btn-large');
        logBtns.forEach(btn => {
          btn.classList.add('success');
          setTimeout(() => btn.classList.remove('success'), 300);
        });

        // Show toast
        if (blockCompleted) {
          showToast(`🎉 Block ${newBlockNumber} Complete!`, true);
          createConfetti();

          // Play sound if enabled
          if (stats.soundEnabled) {
            playSound();
          }

          // Extra celebration for daily goal
          if (stats.todayBlocks >= BLOCKS_PER_DAY) {
            setTimeout(() => {
              showToast(`🏆 DAILY GOAL REACHED! Streak: ${stats.currentStreak}`, true);
              createConfetti();
            }, 2000);
          }
        } else {
          showToast(`+1 Reply logged (${stats.todayReplies % 5}/5)`);
        }
      }
    } catch (e) {
      console.error('XRG: Error logging reply', e);
    }
  }

  // Auto-end session at 30 minutes
  async function endSessionAuto() {
    try {
      await chrome.runtime.sendMessage({ type: 'END_SESSION' });
      showToast('Session completed! Great work on 30 minutes of grinding.', true);

      // Wait a moment then refresh to show updated session count
      setTimeout(() => {
        refreshStats();
      }, 500);
    } catch (e) {
      console.error('XRG: Error auto-ending session', e);
    }
  }

  // Set manual today count
  async function setManualTodayCount() {
    const widget = document.getElementById('xrg-widget');
    const manualInput = widget.querySelector('.xrg-manual-today');
    const value = parseInt(manualInput.value);

    if (isNaN(value) || value < 0 || value > 1000) {
      showToast('Please enter a valid count (0-1000)');
      return;
    }

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'SET_MANUAL_COUNT',
        count: value
      });

      if (response && response.success) {
        manualInput.value = '';
        widgetState.selectedDayOffset = 0; // Switch to today's view
        refreshStats();
        showToast(`Today's count set to ${value} replies`, true);
      }
    } catch (e) {
      console.error('XRG: Error setting manual count', e);
      showToast('Error setting count');
    }
  }

  // Set manual lifetime count
  async function setManualLifetimeCount() {
    const widget = document.getElementById('xrg-widget');
    const manualInput = widget.querySelector('.xrg-manual-lifetime');
    const value = parseInt(manualInput.value);

    if (isNaN(value) || value < 0 || value > 100000) {
      showToast('Please enter a valid count (0-100000)');
      return;
    }

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'SET_MANUAL_LIFETIME',
        count: value
      });

      if (response && response.success) {
        manualInput.value = '';
        widgetState.selectedDayOffset = 0; // Switch to today's view
        refreshStats();
        showToast(`Lifetime count set to ${value} replies`, true);
      }
    } catch (e) {
      console.error('XRG: Error setting lifetime count', e);
      showToast('Error setting count');
    }
  }

  // Get date key for selected day offset
  function getSelectedDateKey() {
    const today = new Date();
    const selectedDate = new Date(today);
    selectedDate.setDate(selectedDate.getDate() + widgetState.selectedDayOffset);
    return selectedDate.toISOString().split('T')[0];
  }

  // Format date for display
  function formatDateLabel(offset) {
    if (offset === 0) return 'Today';
    if (offset === -1) return 'Yesterday';

    const date = new Date();
    date.setDate(date.getDate() + offset);
    const month = date.toLocaleDateString('en-US', { month: 'short' });
    const day = date.getDate();
    return `${month} ${day}`;
  }

  // Update day navigation UI
  function updateDayNavigation() {
    const widget = document.getElementById('xrg-widget');
    if (!widget) return;

    const dayLabel = widget.querySelector('.xrg-day-label');
    const dayPrevBtn = widget.querySelector('.xrg-day-prev');
    const dayNextBtn = widget.querySelector('.xrg-day-next');
    const progressDayTitle = widget.querySelector('.xrg-progress-day-title');

    // Update label
    dayLabel.textContent = formatDateLabel(widgetState.selectedDayOffset);
    if (progressDayTitle) {
      progressDayTitle.textContent = widgetState.selectedDayOffset === 0 ? 'Today' : formatDateLabel(widgetState.selectedDayOffset);
    }

    // Enable/disable next button (can't go beyond today)
    dayNextBtn.disabled = widgetState.selectedDayOffset >= 0;

    // Enable/disable prev button based on available history (max 30 days back)
    const selectedDateKey = getSelectedDateKey();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const minDateKey = thirtyDaysAgo.toISOString().split('T')[0];
    dayPrevBtn.disabled = selectedDateKey <= minDateKey;
  }

  // Format time for display
  function formatTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  // Refresh stats display
  async function refreshStats() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_STATS' });
      if (!response) return;

      const { stats, sessionStats, rank, nextRank, dailyHistory } = response;
      const widget = document.getElementById('xrg-widget');
      if (!widget) return;

      // Cache daily history
      widgetState.dailyHistory = dailyHistory || {};

      // Determine which day's data to show
      let displayReplies, displayBlocks, displaySessionHistory;
      const selectedDateKey = getSelectedDateKey();

      if (widgetState.selectedDayOffset === 0) {
        // Show today's live data
        displayReplies = stats.todayReplies;
        displayBlocks = stats.todayBlocks;
        displaySessionHistory = stats.sessionHistory || [];
      } else {
        // Show historical data
        const historicalData = widgetState.dailyHistory[selectedDateKey];
        if (historicalData) {
          displayReplies = historicalData.replies || 0;
          displayBlocks = historicalData.blocks || 0;
          displaySessionHistory = historicalData.sessionHistory || [];
        } else {
          // No data for this day
          displayReplies = 0;
          displayBlocks = 0;
          displaySessionHistory = [];
        }
      }

      const repliesInBlock = displayReplies % REPLIES_PER_BLOCK;
      const currentBlockNum = displayBlocks + (repliesInBlock > 0 || displayBlocks === 0 ? 1 : 0);

      // Update day navigation
      updateDayNavigation();

      // Compact card updates
      widget.querySelector('.xrg-mini-ring-text').textContent = stats.todayBlocks;
      widget.querySelector('.xrg-compact-block').textContent = `Block ${Math.min(currentBlockNum, BLOCKS_PER_DAY)}: ${repliesInBlock}/5`;
      widget.querySelector('.xrg-streak-num').textContent = stats.currentStreak;

      // Update mini ring
      const miniRingFill = widget.querySelector('.xrg-mini-ring-fill');
      const miniCircumference = 2 * Math.PI * 16;
      const miniProgress = stats.todayBlocks / BLOCKS_PER_DAY;
      miniRingFill.style.strokeDasharray = miniCircumference;
      miniRingFill.style.strokeDashoffset = miniCircumference * (1 - miniProgress);

      // Update compact dots
      const compactDots = widget.querySelectorAll('.xrg-compact-dot');
      compactDots.forEach((dot, i) => {
        dot.classList.toggle('filled', i < repliesInBlock);
      });

      // Update streak badge
      const streakBadge = widget.querySelector('.xrg-compact-streak');
      streakBadge.classList.toggle('inactive', stats.currentStreak === 0);

      // Sidebar updates
      widget.querySelector('.xrg-rank-badge').textContent = rank.name;
      widget.querySelector('.xrg-blocks-count').textContent = displayBlocks;
      widget.querySelector('.xrg-current-block-num').textContent = Math.min(currentBlockNum, BLOCKS_PER_DAY);
      widget.querySelector('.xrg-current-block-progress').textContent = `${repliesInBlock}/5 replies`;
      widget.querySelector('.xrg-total-count').textContent = displayReplies;
      widget.querySelector('.xrg-current-streak').textContent = stats.currentStreak;
      widget.querySelector('.xrg-best-streak').textContent = stats.bestStreak;
      widget.querySelector('.xrg-lifetime-blocks').textContent = stats.lifetimeBlocks;
      widget.querySelector('.xrg-lifetime-replies').textContent = stats.lifetimeReplies;

      // Rank progress
      if (nextRank) {
        const progress = ((stats.lifetimeBlocks - rank.minBlocks) / (nextRank.minBlocks - rank.minBlocks)) * 100;
        widget.querySelector('.xrg-rank-progress-bar').style.width = `${Math.min(progress, 100)}%`;
        widget.querySelector('.xrg-rank-next').textContent = `Next: ${nextRank.name} (${nextRank.minBlocks} blocks)`;
      } else {
        widget.querySelector('.xrg-rank-progress-bar').style.width = '100%';
        widget.querySelector('.xrg-rank-next').textContent = 'Max rank achieved!';
      }

      // Progress ring
      const ringFill = widget.querySelector('.xrg-progress-ring-fill');
      const circumference = 2 * Math.PI * 52;
      const progress = displayBlocks / BLOCKS_PER_DAY;
      ringFill.style.strokeDasharray = circumference;
      ringFill.style.strokeDashoffset = circumference * (1 - progress);

      // Block dots
      const blockDots = widget.querySelectorAll('.xrg-block-dot');
      blockDots.forEach((dot, i) => {
        dot.classList.toggle('filled', i < repliesInBlock);
      });

      // Heatmap
      generateHeatmap(stats.weeklyData || {});

      // Sound toggle
      const soundToggle = widget.querySelector('.xrg-sound-toggle');
      soundToggle.classList.toggle('active', stats.soundEnabled);
      soundToggle.querySelector('.xrg-toggle-label').textContent = stats.soundEnabled ? 'ON' : 'OFF';

      // Update manual input placeholders
      const manualTodayInput = widget.querySelector('.xrg-manual-today');
      const manualLifetimeInput = widget.querySelector('.xrg-manual-lifetime');
      if (manualTodayInput) {
        manualTodayInput.placeholder = stats.todayReplies.toString();
      }
      if (manualLifetimeInput) {
        manualLifetimeInput.placeholder = stats.lifetimeReplies.toString();
      }

      // Update timer display
      const timerToggle = widget.querySelector('.xrg-timer-toggle');
      const timerDisplay = widget.querySelector('.xrg-timer-display');
      const timerBtnText = widget.querySelector('.xrg-timer-btn-text');

      if (stats.timerEnabled) {
        timerToggle.classList.add('active');
        timerBtnText.textContent = 'End Session';
        timerDisplay.style.display = 'block';

        // Update timer time
        const timerTime = widget.querySelector('.xrg-timer-time');
        timerTime.textContent = formatTime(sessionStats.currentSessionTime);

        // Update progress bar
        const progressFill = widget.querySelector('.xrg-timer-progress-fill');
        const progress = Math.min(100, (sessionStats.currentSessionTime / (30 * 60 * 1000)) * 100);
        progressFill.style.width = `${progress}%`;
        progressFill.classList.toggle('overtime', sessionStats.currentSessionTime > 30 * 60 * 1000);

        // Update session stats
        widget.querySelector('.xrg-session-blocks').textContent = sessionStats.currentSessionBlocks;
        widget.querySelector('.xrg-session-replies').textContent = sessionStats.currentSessionReplies;

        // Auto-complete session at 30 minutes
        if (sessionStats.currentSessionTime >= 30 * 60 * 1000 && !widget.dataset.sessionAutoCompleted) {
          widget.dataset.sessionAutoCompleted = 'true';
          await endSessionAuto();
        }
      } else {
        timerToggle.classList.remove('active');
        timerBtnText.textContent = 'Start Session';
        timerDisplay.style.display = 'none';
        delete widget.dataset.sessionAutoCompleted;
      }

      // Update session history
      updateSessionHistory(displaySessionHistory);

    } catch (e) {
      console.error('XRG: Error refreshing stats', e);
    }
  }

  // Update session history display
  function updateSessionHistory(sessionHistory) {
    const widget = document.getElementById('xrg-widget');
    const noSessions = widget.querySelector('.xrg-no-sessions');
    const sessionList = widget.querySelector('.xrg-session-list');

    if (!sessionHistory || sessionHistory.length === 0) {
      noSessions.style.display = 'block';
      sessionList.innerHTML = '';
      return;
    }

    noSessions.style.display = 'none';
    sessionList.innerHTML = '';

    // Show sessions in reverse order (most recent first)
    const sessions = [...sessionHistory].reverse();
    sessions.forEach((session, index) => {
      const sessionNum = sessionHistory.length - index;
      const duration = formatTime(session.duration);
      const startTime = new Date(session.startTime).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });

      const sessionItem = document.createElement('div');
      sessionItem.className = 'xrg-session-item';
      sessionItem.innerHTML = `
        <div class="xrg-session-info-left">
          <span class="xrg-session-number">Session ${sessionNum}</span>
          <span class="xrg-session-time">${startTime} • ${duration}</span>
        </div>
        <div class="xrg-session-info-right">
          <div class="xrg-session-replies-count">${session.replies}</div>
          <div class="xrg-session-replies-label">replies</div>
        </div>
      `;
      sessionList.appendChild(sessionItem);
    });
  }

  // Generate heatmap
  function generateHeatmap(weeklyData) {
    const widget = document.getElementById('xrg-widget');
    const heatmap = widget.querySelector('.xrg-heatmap');
    if (!heatmap) return;

    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const today = new Date();
    heatmap.innerHTML = '';

    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateKey = date.toISOString().split('T')[0];
      const dayName = days[date.getDay()];
      const count = weeklyData[dateKey] || 0;

      let level = 0;
      if (count > 0) level = 1;
      if (count >= 25) level = 2;
      if (count >= 50) level = 3;
      if (count >= 100) level = 4;

      const dayEl = document.createElement('div');
      dayEl.className = 'xrg-heatmap-day';
      dayEl.innerHTML = `
        <span class="xrg-heatmap-label">${dayName}</span>
        <div class="xrg-heatmap-cell level-${level}" title="${count} replies"></div>
        <span class="xrg-heatmap-count">${count}</span>
      `;
      heatmap.appendChild(dayEl);
    }
  }

  // Show toast notification
  function showToast(message, isBlockComplete = false) {
    let toast = document.querySelector('.xrg-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'xrg-toast';
      document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.classList.toggle('block-complete', isBlockComplete);

    // Trigger reflow
    toast.offsetHeight;
    toast.classList.add('show');

    setTimeout(() => {
      toast.classList.remove('show');
    }, 2500);
  }

  // Create confetti
  function createConfetti() {
    let container = document.getElementById('xrg-confetti-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'xrg-confetti-container';
      document.body.appendChild(container);
    }

    const colors = ['#1d9bf0', '#00ba7c', '#f91880', '#ffd400', '#7856ff', '#ff7a00'];

    for (let i = 0; i < 50; i++) {
      const confetti = document.createElement('div');
      confetti.className = 'xrg-confetti';

      const color = colors[Math.floor(Math.random() * colors.length)];
      const left = Math.random() * 100;
      const delay = Math.random() * 0.5;
      const size = 5 + Math.random() * 10;

      confetti.style.cssText = `
        left: ${left}%;
        background: ${color};
        width: ${size}px;
        height: ${size}px;
        border-radius: ${Math.random() > 0.5 ? '50%' : '2px'};
        animation-delay: ${delay}s;
      `;

      container.appendChild(confetti);
      setTimeout(() => confetti.remove(), 3500);
    }
  }

  // Play sound
  function playSound() {
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
      oscillator.frequency.setValueAtTime(1109, audioContext.currentTime + 0.1);
      oscillator.type = 'sine';

      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.5);
    } catch (e) {}
  }

  // Listen for keyboard shortcut from background
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'LOG_REPLY_SHORTCUT') {
      logReply();
    }
  });

  // Initialize
  async function init() {
    await loadPosition();
    injectWidget();

    // Refresh stats frequently to update timer
    setInterval(refreshStats, 1000);
  }

  // Wait for DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
