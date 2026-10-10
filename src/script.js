(function() {
  'use strict';

  const state = {
    nodes: new Map(),
    viewMode: localStorage.getItem('nodeViewMode') || 'grid',
    settings: {},
    pollTimer: null,
    pollInterval: 3000,
    isInitialRender: true,
    activeNodeUuid: null,
    modalTimeScale: 1, // ping hours (latency)
    modalLoadTimeScale: 1, // load hours
    charts: {},
    loadRequestId: 0,
    latencyRequestId: 0,
    modalCloseId: 0,
    publicSettings: {},
    isLoggedIn: false,
    authForced: false,
    authNeedsOtp: false,
    carrier: { byNode: new Map(), timer: null },
    resetRulesRaw: null,
    resetRules: new Map()
  };

  const elements = {
    container: document.getElementById('nodes-container'),
    statNodes: document.getElementById('stat-nodes'),
    statOnline: document.getElementById('stat-online'),
    statCpu: document.getElementById('stat-cpu'),
    statRam: document.getElementById('stat-ram'),
    statNetIn: document.getElementById('stat-net-in'),
    statNetOut: document.getElementById('stat-net-out'),
    modal: document.getElementById('node-modal'),
    modalContent: document.getElementById('modal-content'),
    modalClose: document.getElementById('modal-close'),
    adminButton: document.querySelector('.btn-admin'),
    authModal: document.getElementById('auth-modal'),
    authClose: document.getElementById('auth-close'),
    authForm: document.getElementById('auth-form'),
    authCredentials: document.getElementById('auth-credentials'),
    authUsername: document.getElementById('auth-username'),
    authPassword: document.getElementById('auth-password'),
    authOtp: document.getElementById('auth-otp'),
    authOtpCode: document.getElementById('auth-otp-code'),
    authBack: document.getElementById('auth-back'),
    authMessage: document.getElementById('auth-message'),
    authSubmit: document.getElementById('auth-submit'),
    authOauth: document.getElementById('auth-oauth')
  };

  let requestId = 0;

  const COLOR_SCHEMES = [
    'yellow-light', 'red-light', 'blue-light', 'green-light', 'purple-light',
    'solarized-light', 'github-light', 'gruvbox-light', 'catppuccin-light', 'tokyonight-light', 'chelsea-light',
    'tokyonight-dark', 'dracula-dark', 'monokai-dark', 'nord-dark', 'gruvbox-dark', 'catppuccin-dark',
    'psg-dark', 'samalive-dark'
  ];
  const SCHEME_STORAGE_KEY = 'komari1999.colorScheme';   // last applied (anti-flash on load)
  const USER_SCHEME_KEY = 'komari1999.userScheme';       // visitor's own choice, overrides the admin default

  // Swatch colours for the theme menu: [paper, accent, ink].
  const SCHEME_INFO = {
    'yellow-light': ['Yellow', '#ffffff', '#FFE600', '#000000'],
    'red-light': ['Red', '#ffffff', '#FF3333', '#000000'],
    'blue-light': ['Blue', '#ffffff', '#0d6eff', '#000000'],
    'green-light': ['Green', '#ffffff', '#00CC66', '#000000'],
    'purple-light': ['Purple', '#ffffff', '#9B5DE5', '#000000'],
    'solarized-light': ['Solarized', '#fdf6e3', '#bc9417', '#073642'],
    'github-light': ['GitHub', '#ffffff', '#54aeff', '#1f2328'],
    'gruvbox-light': ['Gruvbox', '#fbf1c7', '#d79921', '#282828'],
    'catppuccin-light': ['Catppuccin Latte', '#eff1f5', '#8839ef', '#4c4f69'],
    'tokyonight-light': ['Tokyo Night Day', '#e9e9ed', '#2564ba', '#3760bf'],
    'chelsea-light': ['Chelsea', '#ffffff', '#034694', '#0a1f4a'],
    'tokyonight-dark': ['Tokyo Night', '#24283b', '#7aa2f7', '#c0caf5'],
    'dracula-dark': ['Dracula', '#282a36', '#ff79c6', '#f8f8f2'],
    'monokai-dark': ['Monokai', '#272822', '#e6db74', '#f8f8f2'],
    'nord-dark': ['Nord', '#3b4252', '#88c0d0', '#eceff4'],
    'gruvbox-dark': ['Gruvbox', '#282828', '#fe8019', '#ebdbb2'],
    'catppuccin-dark': ['Catppuccin Mocha', '#1e1e2e', '#cba6f7', '#cdd6f4'],
    'psg-dark': ['PSG', '#004170', '#DA291C', '#ffffff'],
    'samalive-dark': ['samalive', '#1f333d', '#e0913a', '#dce8ec'],
  };

  function readStorage(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }

  function writeStorage(key, value) {
    try { value == null ? localStorage.removeItem(key) : localStorage.setItem(key, value); } catch (e) { /* unavailable */ }
  }

  function cssVar(name, fallback) {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
  }

  // Chart palette follows the active colour scheme (read when a chart is built).
  function pingColor(index) {
    return cssVar(`--ping-${(index % 8) + 1}`, '#FF3333');
  }

  // Apply the last used scheme before data arrives so dark themes do not flash white.
  try {
    const savedScheme = localStorage.getItem(USER_SCHEME_KEY) || localStorage.getItem(SCHEME_STORAGE_KEY);
    if (COLOR_SCHEMES.includes(savedScheme)) document.documentElement.dataset.scheme = savedScheme;
  } catch (e) { /* storage unavailable */ }

  // Helper: only scramble changed characters
  function scrambleTextIfChanged(element, finalText) {
    const prevText = element.dataset.prev || '';
    if (prevText === finalText) return;
    element.dataset.prev = finalText;
    scrambleText(element, finalText, prevText);
  }

  // Characters for scramble animation (monospace)
  const scrambleChars = '!@#$%^&*0123456789ABCDEF';

  function scrambleText(element, finalText, previousText = '', duration = 400) {
    const startTime = Date.now();
    // Pad previous text to same length from the start (align right)
    const prevPadded = previousText.padStart(finalText.length, ' ');

    function animate() {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      let result = '';
      for (let i = 0; i < finalText.length; i++) {
        // Reverse progress: right-to-left
        const charProgress = (finalText.length - 1 - i) / finalText.length;
        const isChanged = prevPadded[i] !== finalText[i];

        if (!isChanged) {
          result += finalText[i];
        } else if (charProgress < progress) {
          result += finalText[i];
        } else {
          if (scrambleChars.includes(finalText[i]) || finalText[i] === ' ') {
            result += scrambleChars[Math.floor(Math.random() * scrambleChars.length)];
          } else {
            result += finalText[i];
          }
        }
      }

      element.textContent = result;

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    }

    animate();
  }

  function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function formatUptime(seconds) {
    if (!seconds || seconds <= 0) return '-';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  }

  function formatPing(ms) {
    if (ms == null || ms < 0) return '-';
    return ms.toFixed(1) + ' ms';
  }

  function escapeHtml(value) {
    if (value == null) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getPingClass(ms) {
    if (ms == null) return '';
    if (ms < 100) return 'good';
    if (ms < 300) return 'medium';
    return 'bad';
  }

  function formatNetworkSpeed(bytesPerSec) {
    if (bytesPerSec == null) return '-';
    return formatBytes(bytesPerSec) + '/s';
  }

  function parseRecordTime(value) {
    if (value == null || value === '') return null;

    if (typeof value === 'number' || /^\d+(?:\.\d+)?$/.test(String(value))) {
      const numericValue = Number(value);
      if (!Number.isFinite(numericValue)) return null;
      return numericValue < 1e12 ? numericValue * 1000 : numericValue;
    }

    const normalizedValue = String(value).includes('T')
      ? String(value)
      : String(value).replace(' ', 'T');
    const timestamp = Date.parse(normalizedValue);
    return Number.isFinite(timestamp) ? timestamp : null;
  }

  function getPercentage(used, total) {
    if (!total || total === 0) return 0;
    return Math.round((used / total) * 100);
  }

  function getMetricClass(percentage) {
    if (percentage >= 80) return 'high';
    if (percentage >= 50) return 'medium';
    return 'low';
  }

  function getTrafficLimitLabel(type) {
    const labels = { max: '(max)', sum: '(sum)', min: '(min)', down: '(down)', up: '(up)' };
    return labels[type] || '(max)';
  }

  function getNetBarWidths(node) {
    const limit = node.traffic_limit || 0;
    const type = node.traffic_limit_type || 'max';
    const up = node.net_total_up || 0;
    const down = node.net_total_down || 0;

    if (limit <= 0) {
      return { upPct: 0, downPct: 0, upLeft: 0, downLeft: 0, upDim: false, downDim: false, upHide: false, downHide: false, upZIndex: 1, downZIndex: 2 };
    }

    let upPct = (up / limit * 100);
    let downPct = (down / limit * 100);
    let upDim = false;
    let downDim = false;
    let upHide = false;
    let downHide = false;
    let upLeft = 0;
    let downLeft = 0;
    let upZIndex = 1;
    let downZIndex = 2;

    switch (type) {
      case 'sum':
        // 拼接：in 从 0 开始，out 从 in 末尾开始
        upLeft = 0;
        downLeft = upPct;
        upZIndex = 1;
        downZIndex = 1;
        upDim = false;
        downDim = false;
        break;
      case 'max':
        // 较大的 opaque 在下层，较小的 dimmed 在上层
        if (upPct >= downPct) {
          upDim = false; downDim = true;
          upZIndex = 1; downZIndex = 2;
        } else {
          upDim = true; downDim = false;
          upZIndex = 2; downZIndex = 1;
        }
        break;
      case 'min':
        // 较小的 opaque 在下层，较大的 dimmed 在上层
        if (upPct >= downPct) {
          upDim = true; downDim = false;
          upZIndex = 2; downZIndex = 1;
        } else {
          upDim = false; downDim = true;
          upZIndex = 1; downZIndex = 2;
        }
        break;
      case 'up':
        upDim = false; downDim = true;
        upZIndex = 1; downZIndex = 2;
        break;
      case 'down':
        upDim = true; downDim = false;
        upZIndex = 2; downZIndex = 1;
        break;
      default:
        upDim = false;
        downDim = false;
    }

    return {
      upPct: Math.min(upPct, 100),
      downPct: Math.min(downPct, 100),
      upLeft, downLeft,
      upDim,
      downDim,
      upHide,
      downHide,
      upZIndex,
      downZIndex
    };
  }

  function getNetTotalByType(node) {
    const type = node.traffic_limit_type || 'max';
    const up = node.net_total_up || 0;
    const down = node.net_total_down || 0;

    switch (type) {
      case 'sum':
        return up + down;
      case 'max':
        return Math.max(up, down);
      case 'min':
        return Math.min(up, down);
      case 'down':
        return down;
      case 'up':
        return up;
      default:
        return up + down;
    }
  }

  // ===== Fork extras: CT/CU/CM latency, billing, traffic plan =====
  const MS_DAY = 86400000;
  const CARRIER_BAR_COUNT = 20;
  const CARRIER_REFRESH_MS = 60000;
  // Komari snaps bucket width up to this ladder (pkg/metric/interval.go). 24h / 20 = 72min would
  // become 2h (only 12 buckets -> 8 empty slots), so request the largest step that still fits in a slot.
  const STANDARD_STEPS_S = [1, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 10800, 21600, 43200, 86400];
  const CARRIERS = [
    { key: 'ct', label: 'CT', title: '电信 China Telecom', setting: 'carrierCtTasks', match: [/电信/, /china\s*telecom/i, /\btelecom\b/i, /\bctcc\b/i, /\bchinanet\b/i, /\bcn2\b/i] },
    { key: 'cu', label: 'CU', title: '联通 China Unicom', setting: 'carrierCuTasks', match: [/联通/, /china\s*unicom/i, /\bunicom\b/i, /\bcucc\b/i] },
    { key: 'cm', label: 'CM', title: '移动 China Mobile', setting: 'carrierCmTasks', match: [/移动/, /china\s*mobile/i, /\bmobile\b/i, /\bcmcc\b/i, /\bcmi\b/i, /\bcmin2\b/i] }
  ];

  function getSetting(key, fallback) {
    const value = state.settings ? state.settings[key] : undefined;
    return value === undefined || value === null || value === '' ? fallback : value;
  }

  function settingOn(key, fallback = true) {
    const value = getSetting(key, fallback);
    return value === true || value === 'true';
  }

  function canShowPrice() {
    return !(settingOn('hidePriceWhenLoggedOut', false) && !state.isLoggedIn);
  }

  function parseIdList(value) {
    let list = value;
    if (typeof list === 'string') {
      try { list = JSON.parse(list); } catch (e) { list = list.split(/[\s,]+/); }
    }
    return Array.isArray(list) ? list.map(Number).filter(Number.isFinite) : [];
  }

  // Pickers win when any is filled; otherwise classify by task name.
  function resolveCarrierTasks(tasks) {
    const byTask = new Map();
    const picked = CARRIERS.map(c => parseIdList(getSetting(c.setting, [])));
    if (picked.some(list => list.length)) {
      CARRIERS.forEach((c, i) => picked[i].forEach(id => byTask.set(id, c)));
    } else {
      (tasks || []).forEach(task => {
        const carrier = CARRIERS.find(c => c.match.some(re => re.test(task.name || '')));
        if (carrier) byTask.set(Number(task.id), carrier);
      });
    }
    return byTask;
  }

  function seriesTaskId(series) {
    const tags = series.tags || (series.points && series.points[0] && series.points[0].tags) || {};
    return Number(tags.task_id);
  }

  // Rollup "avg" of ping.latency_ms includes -1 for lost probes and ping.loss is a 0/1 indicator,
  // so true latency = (avg + loss) / (1 - loss) and valid samples = count * (1 - loss).
  function buildCarrierStats(seriesList, tasks, hours) {
    const carrierByTask = resolveCarrierTasks(tasks);
    const taskNames = new Map((tasks || []).map(t => [Number(t.id), t.name]));
    const end = Date.now();
    const start = end - hours * 3600000;
    const slotMs = (end - start) / CARRIER_BAR_COUNT;
    const perTask = new Map();

    (seriesList || []).forEach(series => {
      const taskId = seriesTaskId(series);
      if (!carrierByTask.has(taskId) || !series.entity_id) return;
      const isLoss = series.metric_key === 'ping.loss';
      if (!isLoss && series.metric_key !== 'ping.latency_ms') return;
      const key = `${series.entity_id}|${taskId}`;
      if (!perTask.has(key)) {
        perTask.set(key, { uuid: series.entity_id, taskId, slots: Array.from({ length: CARRIER_BAR_COUNT }, () => ({ a: 0, an: 0, l: 0, ln: 0 })) });
      }
      const slots = perTask.get(key).slots;
      (series.points || []).forEach(point => {
        const t = Date.parse(point.time);
        if (point.value == null || !Number.isFinite(t) || t < start - slotMs || t > end) return;
        const slot = slots[Math.min(CARRIER_BAR_COUNT - 1, Math.max(0, Math.floor((t - start) / slotMs)))];
        const n = point.count > 0 ? point.count : 1;
        if (isLoss) { slot.l += point.value * n; slot.ln += n; } else { slot.a += point.value * n; slot.an += n; }
      });
    });

    const byNode = new Map();
    perTask.forEach(({ uuid, taskId, slots }) => {
      const carrier = carrierByTask.get(taskId);
      if (!byNode.has(uuid)) byNode.set(uuid, new Map());
      const carriers = byNode.get(uuid);
      if (!carriers.has(carrier.key)) {
        carriers.set(carrier.key, { carrier, tasks: new Set(), slots: Array.from({ length: CARRIER_BAR_COUNT }, () => ({ latW: 0, valid: 0, lossW: 0, total: 0 })) });
      }
      const agg = carriers.get(carrier.key);
      agg.tasks.add(taskNames.get(taskId) || `Task ${taskId}`);
      slots.forEach((s, i) => {
        if (!s.an && !s.ln) return;
        const avg = s.an ? s.a / s.an : null;
        const loss = s.ln ? Math.min(1, Math.max(0, s.l / s.ln)) : (avg != null && avg < 0 ? 1 : 0);
        const total = s.ln || s.an;
        const target = agg.slots[i];
        target.lossW += loss * total;
        target.total += total;
        if (avg != null && loss < 1) {
          const latency = s.ln ? (avg + loss) / (1 - loss) : avg;
          const valid = s.an * (1 - loss);
          if (latency >= 0 && valid > 0) { target.latW += latency * valid; target.valid += valid; }
        }
      });
    });

    const result = new Map();
    byNode.forEach((carriers, uuid) => {
      const list = CARRIERS.filter(c => carriers.has(c.key)).map(c => {
        const agg = carriers.get(c.key);
        let latW = 0, valid = 0, lossW = 0, total = 0;
        const slots = agg.slots.map((s, i) => {
          latW += s.latW; valid += s.valid; lossW += s.lossW; total += s.total;
          if (!s.total) return null;
          return { start: start + slotMs * i, end: start + slotMs * (i + 1), lat: s.valid ? s.latW / s.valid : null, loss: s.lossW / s.total * 100 };
        });
        return { ...c, taskNames: Array.from(agg.tasks), latency: valid ? latW / valid : null, loss: total ? lossW / total * 100 : null, slots };
      }).filter(c => c.loss != null);
      if (list.length) result.set(uuid, list);
    });
    return result;
  }

  async function fetchCarrierPing() {
    if (!settingOn('carrierPingEnabled') || state.nodes.size === 0) {
      if (state.carrier.byNode.size) {
        state.carrier.byNode = new Map();
        refreshAllExtras();
      }
      return;
    }
    const hours = Math.min(720, Math.max(1, Number(getSetting('carrierPingHours', 24)) || 24));
    const slotSeconds = hours * 3600 / CARRIER_BAR_COUNT;
    const step = STANDARD_STEPS_S.filter(v => v <= slotSeconds).pop() || 1;
    try {
      const [tasks, result] = await Promise.all([
        rpcCall('public:getPublicPingTasks', {}).catch(() => []),
        rpcCall('public:queryMetrics', {
          metric_keys: ['ping.latency_ms', 'ping.loss'],
          entity_ids: Array.from(state.nodes.keys()),
          hours,
          max_points: Math.ceil(hours * 3600 / step),
          aggregation: 'avg'
        })
      ]);
      state.carrier.byNode = buildCarrierStats(result && result.series, Array.isArray(tasks) ? tasks : [], hours);
      refreshAllExtras();
    } catch (e) {
      console.warn('[Komari Theme] Carrier latency unavailable:', e);
    }
  }

  function startCarrierPolling() {
    if (state.carrier.timer) clearInterval(state.carrier.timer);
    fetchCarrierPing();
    state.carrier.timer = setInterval(fetchCarrierPing, CARRIER_REFRESH_MS);
  }

  function latencyTone(ms) {
    return ms <= 60 ? 1 : ms <= 100 ? 2 : ms <= 160 ? 3 : ms <= 200 ? 4 : 5;
  }

  function lossTone(pct) {
    return pct <= 1 ? 1 : pct <= 3 ? 2 : pct <= 6 ? 3 : pct <= 9 ? 4 : 5;
  }

  function formatClock(ts) {
    const d = new Date(ts);
    return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  function buildCarrierHtml(uuid) {
    if (!settingOn('carrierPingEnabled') || state.carrier.byNode.size === 0) return '';
    const found = state.carrier.byNode.get(uuid) || [];
    const carriers = CARRIERS.map(c => found.find(f => f.key === c.key) ||
      { ...c, taskNames: ['No Ping task for this node'], latency: null, loss: null, slots: Array(CARRIER_BAR_COUNT).fill(null) });
    return `<div class="x-carriers">${carriers.map(c => {
      const segs = c.slots.map(s => {
        if (!s) return '<i class="x-seg x-seg-empty" title="No samples"></i>';
        const latClass = s.lat == null ? 'lat-5' : `lat-${latencyTone(s.lat)}`;
        const lossClass = s.loss > 1 ? ` loss-${lossTone(s.loss)}` : '';
        const tip = `${c.label} ${formatClock(s.start)} – ${formatClock(s.end)}\n${s.lat == null ? 'no reply' : Math.round(s.lat) + ' ms'} · loss ${s.loss.toFixed(1)}%`;
        return `<i class="x-seg ${latClass}${lossClass}" title="${escapeHtml(tip)}"></i>`;
      }).join('');
      const latText = c.latency == null ? '--' : `${Math.round(c.latency)}ms`;
      const latClass = c.latency == null ? 'x-t0' : `x-t${latencyTone(c.latency)}`;
      const lossClass = c.loss == null ? 'x-t0' : `x-t${lossTone(c.loss)}`;
      return `<div class="x-carrier" data-k="${c.key}">
        <span class="x-carrier-label x-${c.key}" title="${escapeHtml(`${c.title}\n${c.taskNames.join(' / ')}`)}">${c.label}</span>
        <span class="x-carrier-num x-lat ${latClass}">${latText}</span>
        <span class="x-track"><span class="x-strip">${segs}</span></span>
        <span class="x-carrier-num x-loss ${lossClass}">${c.loss == null ? '--' : c.loss.toFixed(1) + '%'}</span>
      </div>`;
    }).join('')}</div>`;
  }

  function getBillingInfo(node, now = Date.now()) {
    const expiry = node.expired_at ? Date.parse(node.expired_at) : NaN;
    if (!Number.isFinite(expiry) || new Date(expiry).getUTCFullYear() < 1971) return null;
    const diff = expiry - now;
    const days = diff > 0 ? Math.ceil(diff / MS_DAY) : 0;
    const status = diff <= 0 ? 'expired' : days > 36500 ? 'long' : days <= 5 ? 'crit' : days <= 10 ? 'warn' : 'ok';
    const price = Number(node.price) || 0;
    const cycle = Number(node.billing_cycle) || 0;
    let value = null;
    if (price > 0) value = status === 'expired' ? 0 : (status === 'long' || cycle <= 0) ? price : price * days / cycle;
    return { expiry, days, status, price, cycle, value, free: price === -1 };
  }

  function formatMoney(amount, currency) {
    return `${currency || ''}${amount.toFixed(2)}`;
  }

  function parseResetRules() {
    const raw = String(getSetting('trafficResetDays', ''));
    if (raw === state.resetRulesRaw) return state.resetRules;
    const rules = new Map();
    raw.split(/\r?\n/).forEach(line => {
      const text = line.trim();
      if (!text || text.startsWith('#')) return;
      const match = text.match(/^(.+?)\s*=\s*(\d{1,2})(?:\s*@\s*([+-]?\d+(?:\.\d+)?))?$/);
      if (!match) return;
      const day = Number(match[2]);
      if (day < 1 || day > 31) return;
      rules.set(match[1].trim(), { day, offset: match[3] != null ? Number(match[3]) : null });
    });
    state.resetRulesRaw = raw;
    state.resetRules = rules;
    return rules;
  }

  // Same rule as komari-agent: a day missing from the month rolls over to the 1st of the next month.
  function resetInstant(year, month, day, offsetMs) {
    const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const ts = day <= lastDay ? Date.UTC(year, month, day) : Date.UTC(year, month + 1, 1);
    return ts - offsetMs;
  }

  function getTrafficPlan(node, now = Date.now()) {
    const rule = parseResetRules().get(node.name) || {};
    const day = rule.day || 1;
    const offsetH = rule.offset != null ? rule.offset : (Number(getSetting('trafficResetUtcOffset', 0)) || 0);
    const offsetMs = offsetH * 3600000;
    const local = new Date(now + offsetMs);
    let next = resetInstant(local.getUTCFullYear(), local.getUTCMonth(), day, offsetMs);
    if (next <= now) next = resetInstant(local.getUTCFullYear(), local.getUTCMonth() + 1, day, offsetMs);
    const daysLeft = Math.max(1, Math.ceil((next - now) / MS_DAY));
    const limit = node.traffic_limit || 0;
    const used = limit > 0 ? getNetTotalByType(node) : (node.net_total_up || 0) + (node.net_total_down || 0);
    const remaining = limit > 0 ? Math.max(0, limit - used) : null;
    return { day, offsetH, custom: Boolean(rule.day), next, daysLeft, limit, used, remaining, perDay: remaining == null ? null : remaining / daysLeft };
  }

  function ordinal(n) {
    const suffix = (n % 100 >= 11 && n % 100 <= 13) ? 'TH' : ({ 1: 'ST', 2: 'ND', 3: 'RD' }[n % 10] || 'TH');
    return `${n}${suffix}`;
  }

  function formatOffset(h) {
    return `UTC${h >= 0 ? '+' : ''}${h}`;
  }

  function xCell(key, label, value, cls = '', title = '') {
    return `<div class="x-cell${cls ? ' ' + cls : ''}" data-k="${key}"${title ? ` title="${escapeHtml(title)}"` : ''}><span class="x-label">${escapeHtml(label)}</span><span class="x-value">${escapeHtml(value)}</span></div>`;
  }

  function buildExtrasHtml(node) {
    // Every card gets the same slots; missing data shows a placeholder so cards stay aligned.
    const cells = [];
    if (settingOn('showBilling')) {
      const b = getBillingInfo(node);
      if (b) {
        const value = b.status === 'expired' ? 'EXPIRED' : b.status === 'long' ? '∞' : `${b.days}D`;
        const cls = b.status === 'expired' || b.status === 'crit' ? 'x-crit' : b.status === 'warn' ? 'x-warn' : '';
        cells.push(xCell('expires', 'EXPIRES', value, cls, b.status === 'long' ? 'Long-term' : new Date(b.expiry).toLocaleDateString()));
      } else {
        cells.push(xCell('expires', 'EXPIRES', '—', 'x-empty', 'No expiry date set'));
      }
      if (b && canShowPrice() && (b.value != null || b.free)) {
        cells.push(xCell('value', 'VALUE', b.free ? 'FREE' : formatMoney(b.value, node.currency), '',
          b.free ? '' : `${formatMoney(b.price, node.currency)} / ${b.cycle > 0 ? b.cycle + 'D' : 'once'}`));
      } else {
        cells.push(xCell('value', 'VALUE', '—', 'x-empty', canShowPrice() ? 'No price set' : 'Hidden'));
      }
    }
    if (settingOn('showTrafficPlan')) {
      const t = getTrafficPlan(node);
      cells.push(xCell('reset', `RESET ${ordinal(t.day)}`, `${t.daysLeft}D`, '',
        `Next reset ${new Date(t.next).toLocaleString()} (VPS ${formatOffset(t.offsetH)})${t.custom ? '' : ' · default'}`));
      if (t.perDay != null) {
        cells.push(xCell('perday', 'PER DAY', formatBytes(Math.floor(t.perDay)), t.remaining === 0 ? 'x-crit' : '',
          `${formatBytes(t.remaining)} left of ${formatBytes(t.limit)} for ${t.daysLeft} day(s)`));
      } else {
        cells.push(xCell('perday', 'PER DAY', '∞', '', 'No traffic limit'));
      }
    }
    const kv = cells.length ? `<div class="x-kv">${cells.join('')}</div>` : '';
    return kv + buildCarrierHtml(node.uuid);
  }

  // Pixel-exact strips. CSS layout works in 1/64 px units, which cannot land every line on a device
  // pixel at fractional zoom (125%, 175%...), so the strip is painted on a canvas in device pixels.
  // The transparent .x-seg spans stay on top for hover tooltips (and are the no-canvas fallback).
  // A device-pixel length whose CSS size is exact in layout units (1/64 px), so the canvas is
  // composited 1:1. `accept` adds extra constraints (e.g. parity for a centred divider).
  function exactDevicePixels(target, dpr, accept = () => true, direction = -1) {
    const start = Math.round(target);
    for (let k = 0; k < 64; k++) {
      for (const w of direction < 0 ? [start - k] : [start - k, start + k]) {
        if (w <= 0) continue;
        const units = w / dpr * 64;
        if (Math.abs(units - Math.round(units)) < 1e-6 && accept(w)) return w;
      }
    }
    return Math.max(1, Math.floor(target));
  }

  // Let the browser resolve a CSS colour (vars, color-mix) in the element's context, as rgb() for canvas.
  function resolveColor(context, value, fallback) {
    const probe = document.createElement('span');
    probe.style.color = value;
    probe.style.display = 'none';
    context.appendChild(probe);
    const computed = getComputedStyle(probe).color;
    probe.remove();
    const nums = (computed.match(/[\d.]+/g) || []).map(Number);
    if (nums.length < 3) return fallback;
    const [r, g, b] = computed.startsWith('color(') ? nums.slice(0, 3).map(v => Math.round(v * 255)) : nums.slice(0, 3);
    return `rgb(${r}, ${g}, ${b})`;
  }

  function snapStrip(track, width) {
    const strip = track.querySelector('.x-strip');
    if (!strip || !(width > 0)) return;
    const dpr = window.devicePixelRatio || 1;
    const frameW = Math.max(1, Math.round(2 * dpr));                     // outer frame: 2 CSS px
    const sepW = Math.max(1, Math.round(1 * dpr));                       // inner lines: 1 CSS px
    const W = exactDevicePixels(Math.floor(width * dpr), dpr);
    // Height chosen so a loss slot splits into two equal halves around a centred divider.
    const H = exactDevicePixels(16 * dpr, dpr, h => (h - 2 * frameW - sepW) % 2 === 0, 0);
    let canvas = track.querySelector('canvas');
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.className = 'x-strip-canvas';
      canvas.setAttribute('aria-hidden', 'true');
      track.insertBefore(canvas, strip);
    }
    canvas.width = W;
    canvas.height = H;
    // Centre the strip in its column (whole device pixels), so leftover space is split evenly.
    const inset = Math.floor((Math.floor(width * dpr) - W) / 2) / dpr;
    canvas.style.left = strip.style.marginLeft = `${inset}px`;
    canvas.style.width = strip.style.width = `${W / dpr}px`;
    canvas.style.height = strip.style.height = `${H / dpr}px`;
    track.style.height = `${H / dpr}px`;

    const css = getComputedStyle(strip);
    const tone = name => css.getPropertyValue(name).trim();
    const frame = resolveColor(strip, 'var(--black)', '#000');    // outer frame = ink, like other boxes
    const ink = resolveColor(strip, 'var(--strip-line)', frame);  // thin inner lines, one step softer
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = frame;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = ink;
    ctx.fillRect(frameW, frameW, W - 2 * frameW, H - 2 * frameW);

    const segs = Array.from(strip.children);
    const n = segs.length || CARRIER_BAR_COUNT;
    const colour = W - 2 * frameW - (n - 1) * sepW;
    const base = Math.max(1, Math.floor(colour / n));
    const spare = Math.max(0, colour - base * n);
    const top = frameW, height = H - 2 * frameW, half = (height - sepW) / 2;
    let x = frameW;
    segs.forEach((seg, i) => {
      const w = base + Math.floor((i + 1) * spare / n) - Math.floor(i * spare / n);
      const lat = /lat-(\d)/.exec(seg.className), loss = /loss-(\d)/.exec(seg.className);
      if (lat) {
        ctx.fillStyle = tone(`--sig-${lat[1]}`);
        ctx.fillRect(x, top, w, loss ? half : height);
        if (loss) {
          const level = Math.min(5, Math.max(3, Number(loss[1]) + 1));   // loss-2 -> sig-3 ... loss-4/5 -> sig-5
          ctx.fillStyle = tone(`--sig-${level}`);
          ctx.fillRect(x, top + half + sepW, w, half);                     // divider = the gap colour between
        }
      } else {
        ctx.fillStyle = tone('--bg') || '#f5f5f5';
        ctx.fillRect(x, top, w, height);
        ctx.fillStyle = tone('--hatch') || 'rgba(0,0,0,.15)';
        const step = Math.max(3, Math.round(3 * dpr));
        for (let yy = 0; yy < height; yy++) {
          for (let xx = (step - (yy % step)) % step; xx < w; xx += step) ctx.fillRect(x + xx, top + yy, 1, 1);
        }
      }
      x += w + sepW;
    });
    strip.classList.add('is-canvas');
    alignCanvas(canvas);
  }

  // A canvas whose top-left is not on a whole device pixel gets resampled (blurred) when composited;
  // shift it by the fractional remainder. Positions move on scroll/resize, so this is re-run then.
  function alignCanvas(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const left = (rect.left - (canvas._ox || 0)) * dpr, top = (rect.top - (canvas._oy || 0)) * dpr;
    canvas._ox = (Math.round(left) - left) / dpr;
    canvas._oy = (Math.round(top) - top) / dpr;
    canvas.style.transform = `translate(${canvas._ox}px, ${canvas._oy}px)`;
  }

  let alignQueued = false;
  function alignAllCanvases() {
    if (alignQueued) return;
    alignQueued = true;
    requestAnimationFrame(() => {
      alignQueued = false;
      document.querySelectorAll('.x-strip-canvas').forEach(alignCanvas);
    });
  }
  window.addEventListener('scroll', alignAllCanvases, { passive: true });
  window.addEventListener('resize', alignAllCanvases);

  const stripObserver = 'ResizeObserver' in window
    ? new ResizeObserver(entries => entries.forEach(e => snapStrip(e.target, e.contentRect.width)))
    : null;

  function snapAllStrips() {
    document.querySelectorAll('.x-track').forEach(track => snapStrip(track, track.getBoundingClientRect().width));
  }

  // Subtle seamless page patterns, drawn per tile in device pixels so every dot/line is identical.
  const PAGE_PATTERNS = {
    dots:     { size: 16, draw: (ctx, T, u) => ctx.fillRect(0, 0, u, u) },
    grid:     { size: 24, draw: (ctx, T, u) => { ctx.fillRect(0, 0, T, u); ctx.fillRect(0, u, u, T - u); } },
    cross:    { size: 24, draw: (ctx, T, u) => { const c = Math.floor((T - u) / 2), a = 2 * u; ctx.fillRect(c - a, c, 2 * a + u, u); ctx.fillRect(c, c - a, u, a); ctx.fillRect(c, c + u, u, a); } },
    diagonal: { size: 12, draw: (ctx, T, u) => { for (let i = 0; i < T; i++) ctx.fillRect(i, T - 1 - i, u, 1); } },
  };

  function renderPagePattern() {
    const name = String(getSetting('pageBackground', 'none'));
    const pattern = PAGE_PATTERNS[name];
    const root = document.documentElement;
    if (!pattern) {
      root.style.removeProperty('--page-pattern');
      return;
    }
    const dpr = window.devicePixelRatio || 1;
    const u = Math.max(1, Math.round(dpr));
    const T = exactDevicePixels(pattern.size * dpr, dpr, t => t % u === 0, 0);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = T;
    const ctx = canvas.getContext('2d');
    const dark = (root.dataset.scheme || '').endsWith('-dark');
    ctx.globalAlpha = dark ? 0.07 : 0.08;
    ctx.fillStyle = getComputedStyle(root).getPropertyValue('--black').trim() || '#000';
    pattern.draw(ctx, T, u);
    root.style.setProperty('--page-pattern', `url(${canvas.toDataURL()})`);
    root.style.setProperty('--page-pattern-size', `${T / dpr}px ${T / dpr}px`);
  }

  // Moving the window to a screen with another scale factor changes devicePixelRatio, not sizes.
  (function watchPixelRatio() {
    if (!window.matchMedia) return;
    const mq = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    const onChange = () => { snapAllStrips(); renderPagePattern(); watchPixelRatio(); };
    if (mq.addEventListener) mq.addEventListener('change', onChange, { once: true });
  })();

  function renderExtras(root, node) {
    const box = root && root.querySelector('.node-extras');
    if (!box) return;
    const html = buildExtrasHtml(node);
    if (box.dataset.html === html) return;
    box.dataset.html = html;
    if (stripObserver) box.querySelectorAll('.x-track').forEach(track => stripObserver.unobserve(track));
    box.innerHTML = html;
    if (stripObserver) box.querySelectorAll('.x-track').forEach(track => stripObserver.observe(track));
    box.hidden = !html;
  }

  function refreshAllExtras() {
    if (!elements.container) return;
    state.nodes.forEach((node, uuid) => {
      const el = elements.container.querySelector(`[data-uuid="${uuid}"]`);
      if (el) renderExtras(el, node);
    });
  }

  function buildModalBillingHtml(node) {
    const item = (label, value) => `<div class="info-item"><span class="info-label">${escapeHtml(label)}</span><span class="info-value">${escapeHtml(value)}</span></div>`;
    const items = [];
    if (settingOn('showBilling')) {
      const b = getBillingInfo(node);
      if (canShowPrice() && (node.price > 0 || node.price === -1)) {
        items.push(item('Price', node.price === -1 ? 'Free' : `${formatMoney(node.price, node.currency)} / ${node.billing_cycle > 0 ? node.billing_cycle + ' days' : 'once'}`));
      }
      if (b) {
        items.push(item('Expires', b.status === 'long' ? 'Long-term' : new Date(b.expiry).toLocaleDateString()));
        items.push(item('Days Left', b.status === 'expired' ? 'Expired' : b.status === 'long' ? '∞' : `${b.days}`));
        if (canShowPrice() && b.value != null) items.push(item('Remaining Value', formatMoney(b.value, node.currency)));
      }
    }
    if (settingOn('showTrafficPlan')) {
      const t = getTrafficPlan(node);
      items.push(item('Traffic Reset', `Day ${t.day} · VPS ${formatOffset(t.offsetH)}${t.custom ? '' : ' (default)'}`));
      items.push(item('Next Reset', `${new Date(t.next).toLocaleString()} (${t.daysLeft}d)`));
      if (t.remaining != null) {
        items.push(item('Traffic Left', `${formatBytes(t.remaining)} / ${formatBytes(t.limit)}`));
        items.push(item('Per Day', formatBytes(Math.floor(t.perDay))));
      }
    }
    if (!items.length) return '';
    return `
        <div class="modal-info-section modal-billing-section">
          <h3 class="modal-info-section-title">BILLING &amp; TRAFFIC</h3>
          <div class="modal-info-grid modal-billing-grid">${items.join('')}</div>
        </div>`;
  }

  // ===== Fork: country flags + pixel world map =====
  // Komari stores the region as a flag emoji built from an ISO 3166 code (utils/geoip); admins may also type a code.
  function regionCode(region) {
    const text = String(region || '').trim();
    const points = Array.from(text).map(ch => ch.codePointAt(0));
    if (points.length >= 2 && points.slice(0, 2).every(cp => cp >= 0x1F1E6 && cp <= 0x1F1FF)) {
      return String.fromCharCode(points[0] - 0x1F1E6 + 65, points[1] - 0x1F1E6 + 65);
    }
    return /^[A-Za-z]{2}$/.test(text) ? text.toUpperCase() : '';
  }

  function flagEmoji(code) {
    return code ? String.fromCodePoint(...[...code].map(ch => 0x1F1E6 + ch.charCodeAt(0) - 65)) : '';
  }

  function flagHtml(node) {
    const code = regionCode(node.region);
    if (code) return `<span class="node-flag" title="${code}">${flagEmoji(code)}</span>`;
    return node.region ? `<span class="node-flag" title="${escapeHtml(node.region)}">${escapeHtml(node.region)}</span>` : '';
  }

  // Pixel map. Land, links and pins live on a strip holding two copies of the world (2W wide), drawn
  // only when size, data or colours change. The strip is moved by a compositor-driven Web Animation,
  // so motion is smooth at the display rate (or the configured fps) and never stalls on main-thread
  // work. Every cell shares the same sub-pixel phase while moving, so all cells look identical; when
  // paused the strip snaps to a whole device pixel and is perfectly crisp.
  const worldMap = {
    signature: '', pins: [], links: [], geo: null, anim: null, hovering: false, dragging: false,
    bound: false, timingKey: '', paintKey: '',
  };

  function mapPoint(lon, lat) {
    const m = window.KOMARI_WORLDMAP;
    return [(lon - m.lon0) / m.cell, Math.min(m.rows, Math.max(0, (m.lat0 - lat) / m.cell))];
  }

  function landCells() {
    const m = window.KOMARI_WORLDMAP;
    if (worldMap.cells) return worldMap.cells;
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const cells = [];
    let index = 0;
    for (const ch of m.mask) {
      const value = alphabet.indexOf(ch);
      for (let bit = 5; bit >= 0; bit--, index++) {
        if ((value >> bit) & 1 && index < m.cols * m.rows) cells.push([index % m.cols, Math.floor(index / m.cols)]);
      }
    }
    return (worldMap.cells = cells);
  }

  // Smallest device length >= target whose CSS size is exact in layout units (1/64 px).
  function exactAtLeast(target, dpr) {
    for (let w = Math.ceil(target); w < Math.ceil(target) + 64; w++) {
      const units = w / dpr * 64;
      if (Math.abs(units - Math.round(units)) < 1e-6) return w;
    }
    return Math.ceil(target);
  }

  function mapTiming() {
    const seconds = Number(getSetting('mapSpinSeconds', 120)) || 0;
    const fps = Number(getSetting('mapFps', 60));
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    return { seconds: reduce ? 0 : Math.max(0, seconds), fps: Number.isFinite(fps) ? Math.max(0, fps) : 60 };
  }

  // Fraction of one revolution currently shown (0..1), read from the running animation.
  function mapPhase() {
    const a = worldMap.anim;
    if (!a || !a.effect) return worldMap.phase || 0;
    const d = a.effect.getTiming().duration;
    return d > 0 ? (((a.currentTime || 0) % d) + d) % d / d : 0;
  }

  function layoutWorldMap() {
    const m = window.KOMARI_WORLDMAP;
    const box = document.querySelector('.map-box');
    const stage = document.querySelector('.map-stage');
    if (!m || !box || !stage) return null;
    const dpr = window.devicePixelRatio || 1;
    const rect = box.getBoundingClientRect();
    if (!(rect.width > 0)) return null;
    const boxW = Math.floor(rect.width * dpr), boxH = Math.floor(rect.height * dpr);
    // Nearest whole pitch: the map may be a few px larger than the box and is cropped at the edges.
    const P = Math.max(2, Math.round(Math.min(boxW / m.cols, boxH / m.rows)));
    const W = P * m.cols, H = P * m.rows;
    stage.style.width = `${W / dpr}px`;
    stage.style.height = `${H / dpr}px`;
    // Put the stage on whole device pixels through layout itself (not a transform): Chrome does not
    // pixel-snap a layer whose transform is animating, so any fractional offset would blur the map.
    // Chrome places an animated layer on a whole CSS pixel, so pick a CSS-integer position that is also
    // a whole device pixel (e.g. multiples of 4 CSS px at 125%), as close to centred as possible.
    const snap = target => {
      for (let k = 0; k < 64; k++) {
        for (const v of [Math.round(target) - k, Math.round(target) + k]) {
          if (Math.abs(v * dpr - Math.round(v * dpr)) < 1e-6) return v;
        }
      }
      return Math.round(target);
    };
    stage.style.transform = '';
    stage.style.left = `${snap(rect.left + Math.floor((boxW - W) / 2) / dpr) - rect.left}px`;
    stage.style.top = `${snap(rect.top + Math.floor((boxH - H) / 2) / dpr) - rect.top}px`;
    const bx = rect.left * dpr, by = rect.top * dpr;
    worldMap.geo = { dpr, P, W, H, bx, by };
    return worldMap.geo;
  }

  function paintWorldMap() {
    const geo = worldMap.geo;
    const strip = document.querySelector('.map-strip');
    if (!geo || !strip) return;
    const m = window.KOMARI_WORLDMAP;
    const { dpr, P, W, H } = geo;
    const ink = resolveColor(strip, 'var(--black)', '#000');
    const key = `${dpr}|${P}|${ink}|${worldMap.signature}`;
    if (key === worldMap.paintKey) return;
    worldMap.paintKey = key;

    strip.style.width = `${(2 * W) / dpr}px`;
    strip.style.height = `${H / dpr}px`;

    // Land: two copies, every cell an identical integer square.
    const canvas = strip.querySelector('.map-canvas');
    const bw = exactAtLeast(2 * W, dpr), bh = exactAtLeast(H, dpr);
    canvas.width = bw;
    canvas.height = bh;
    canvas.style.width = `${bw / dpr}px`;
    canvas.style.height = `${bh / dpr}px`;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, bw, bh);
    const gap = Math.max(1, Math.round(P * 0.24));
    const size = P - gap, inset = Math.floor(gap / 2);
    ctx.fillStyle = ink;
    ctx.globalAlpha = 0.26;
    for (const [x, y] of landCells()) {
      ctx.fillRect(x * P + inset, y * P + inset, size, size);
      ctx.fillRect(x * P + inset + W, y * P + inset, size, size);
    }

    // Links: SVG in CSS px, dash flow animated in CSS (its own layer, so the land is never repainted).
    const u = 1 / dpr;
    const svg = strip.querySelector('.map-links');
    svg.setAttribute('viewBox', `0 0 ${(2 * W) * u} ${H * u}`);
    svg.setAttribute('width', `${(2 * W) * u}`);
    svg.setAttribute('height', `${H * u}`);
    const dash = Math.max(2, Math.round(P)) * u, space = Math.max(1, Math.round(0.7 * P)) * u;
    svg.style.setProperty('--dash-period', `${dash + space}px`);
    const paths = [];
    for (const link of worldMap.links) {
      for (const shift of [-W, 0, W, 2 * W]) {
        const [ax, ay, cx, cy, bx, by] = link.pts.map((v, i) => (v * P + (i % 2 === 0 ? shift : 0)) * u);
        if (Math.max(ax, bx, cx) < -P * u || Math.min(ax, bx, cx) > 2 * W * u + P * u) continue;
        paths.push(`<path class="map-link${link.live ? '' : ' is-offline'}" d="M${ax.toFixed(2)} ${ay.toFixed(2)}Q${cx.toFixed(2)} ${cy.toFixed(2)} ${bx.toFixed(2)} ${by.toFixed(2)}" stroke-width="${(Math.max(1, Math.round(0.35 * P)) * u).toFixed(3)}" stroke-dasharray="${dash.toFixed(3)} ${space.toFixed(3)}"></path>`);
      }
    }
    svg.innerHTML = paths.join('');

    // Pins: two copies, on whole device pixels within the strip.
    strip.querySelector('.map-pins').innerHTML = worldMap.pins.map(pin => [0, W].map(shift =>
      `<span class="${pin.cls}" style="left:${(Math.round(pin.x * P) + shift) / dpr}px;top:${Math.round(pin.y * P) / dpr}px" title="${escapeHtml(pin.tip)}">${pin.label}</span>`
    ).join('')).join('');
  }

  // (Re)build the strip animation for the current width/speed/fps, keeping the current phase.
  function syncMapAnimation(force) {
    const geo = worldMap.geo;
    const strip = document.querySelector('.map-strip');
    if (!geo || !strip || !strip.animate) return;
    const { seconds, fps } = mapTiming();
    const key = `${geo.W}|${geo.dpr}|${seconds}|${fps}`;
    if (!force && key === worldMap.timingKey && worldMap.anim) return;
    const phase = mapPhase();
    if (worldMap.anim) worldMap.anim.cancel();
    worldMap.timingKey = key;
    const span = geo.W / geo.dpr;
    // Content moves west -> east: the strip slides right by one world width per revolution.
    const duration = (seconds || 120) * 1000;
    worldMap.easing = seconds > 0 && fps > 0 ? `steps(${Math.max(1, Math.round(seconds * fps))}, end)` : 'linear';
    worldMap.anim = strip.animate(
      [{ transform: `translate3d(${-span}px, 0, 0)` }, { transform: 'translate3d(0, 0, 0)' }],
      { duration, iterations: Infinity, easing: worldMap.easing }
    );
    worldMap.anim.currentTime = phase * duration;
    updateMapMotion();
  }

  // Run while spinning; otherwise pause on a whole device pixel (crisp).
  function updateMapMotion() {
    const a = worldMap.anim, geo = worldMap.geo;
    const strip = document.querySelector('.map-strip');
    if (!a || !geo || !strip) return;
    const run = mapTiming().seconds > 0 && !worldMap.hovering && !worldMap.dragging;
    if (run) {
      a.effect.updateTiming({ easing: worldMap.easing });
      strip.classList.remove('is-still');
      if (a.playState !== 'running') a.play();
    } else {
      if (a.playState === 'running') a.pause();
      snapMapPhase(mapPhase());
      strip.classList.add('is-still');
    }
  }

  function snapMapPhase(phase) {
    const a = worldMap.anim, geo = worldMap.geo;
    if (!a || !geo) return;
    const d = a.effect.getTiming().duration;
    const px = Math.round((((phase % 1) + 1) % 1) * geo.W);
    a.effect.updateTiming({ easing: 'linear' });
    a.currentTime = px / geo.W * d;
  }

  function renderWorldMap() {
    const box = document.getElementById('stats-map');
    const header = document.querySelector('.header');
    const m = window.KOMARI_WORLDMAP;
    const enabled = Boolean(box && m) && settingOn('showWorldMap');
    if (!box) return;
    box.hidden = !enabled;
    if (header) header.classList.toggle('has-map', enabled);
    if (!enabled) return;
    bindWorldMap();

    const groups = new Map();
    state.nodes.forEach(node => {
      const code = regionCode(node.region);
      if (!code || !m.anchors[code]) return;
      if (!groups.has(code)) groups.set(code, { code, names: [], online: 0 });
      const group = groups.get(code);
      group.names.push(node.name || 'Unknown');
      if (node.online !== false) group.online += 1;
    });

    const hubCode = String(getSetting('mapHub', 'CN')).trim().toUpperCase();
    const hub = m.anchors[hubCode] ? mapPoint(...m.anchors[hubCode]) : null;
    const signature = JSON.stringify([hubCode, Array.from(groups.values())]);
    if (signature !== worldMap.signature) {
      worldMap.signature = signature;
      const links = [], pins = [];
      groups.forEach(group => {
        const point = mapPoint(...m.anchors[group.code]);
        const live = group.online > 0;
        if (hub && group.code !== hubCode) {
          // Take the shorter way round: across the date line when that is closer.
          let [x1, y1] = point, [x2, y2] = hub;
          if (Math.abs(x2 - x1) > m.cols / 2) x2 += x2 > x1 ? -m.cols : m.cols;
          const lift = Math.min(6, Math.hypot(x2 - x1, y2 - y1) * 0.22);
          links.push({ live, pts: [x1, y1, (x1 + x2) / 2, Math.min(y1, y2) - lift, x2, y2] });
        }
        pins.push({ x: point[0], y: point[1], cls: `map-pin${live ? '' : ' is-offline'}`,
          tip: `${group.code} · ${group.names.join(', ')}${live ? '' : ' (offline)'}`,
          label: `${flagEmoji(group.code)}${group.names.length > 1 ? `<b>${group.names.length}</b>` : ''}` });
      });
      if (hub && !groups.has(hubCode)) pins.push({ x: hub[0], y: hub[1], cls: 'map-pin map-hub', tip: `${hubCode} · hub`, label: flagEmoji(hubCode) });
      worldMap.links = links;
      worldMap.pins = pins;
    }
    if (layoutWorldMap()) {
      paintWorldMap();
      syncMapAnimation(false);
      updateMapMotion();
    }
  }

  function bindWorldMap() {
    const box = document.querySelector('.map-box');
    if (!box || worldMap.bound) return;
    worldMap.bound = true;

    if ('ResizeObserver' in window) {
      new ResizeObserver(() => { if (layoutWorldMap()) { paintWorldMap(); syncMapAnimation(false); } }).observe(box);
    }

    let startX = 0, startPhase = 0;
    box.addEventListener('pointerenter', () => { worldMap.hovering = true; updateMapMotion(); });
    box.addEventListener('pointerleave', () => { worldMap.hovering = false; updateMapMotion(); });
    box.addEventListener('pointerdown', e => {
      worldMap.dragging = true;
      startX = e.clientX;
      updateMapMotion();
      startPhase = mapPhase();
      box.classList.add('is-dragging');
      box.setPointerCapture(e.pointerId);
    });
    box.addEventListener('pointermove', e => {
      if (!worldMap.dragging || !worldMap.geo) return;
      // Dragging right moves the content right, i.e. forward in the animation.
      snapMapPhase(startPhase + (e.clientX - startX) * worldMap.geo.dpr / worldMap.geo.W);
    });
    const endDrag = () => {
      if (!worldMap.dragging) return;
      worldMap.dragging = false;
      box.classList.remove('is-dragging');
      updateMapMotion();
    };
    box.addEventListener('pointerup', endDrag);
    box.addEventListener('pointercancel', endDrag);
  }

  function adminScheme() {
    const legacyAccent = state.settings.accentColor ? `${state.settings.accentColor}-light` : null;
    const requested = state.settings.colorScheme || legacyAccent;
    return COLOR_SCHEMES.includes(requested) ? requested : 'yellow-light';
  }

  function userScheme() {
    const value = readStorage(USER_SCHEME_KEY);
    return COLOR_SCHEMES.includes(value) ? value : null;
  }

  function currentScheme() {
    return userScheme() || adminScheme();
  }

  // ===== Theme menu (visitor override of the admin colour scheme) =====
  // Swatch = the scheme's paper (left half) | accent (right half) inside a 2px frame in the menu's ink.
  // Painted on a canvas in device pixels so both halves are always exactly equal at any zoom.
  function swatchHtml(scheme) {
    const [, paper, accent] = SCHEME_INFO[scheme] || SCHEME_INFO['yellow-light'];
    return `<span class="theme-swatch" data-paper="${paper}" data-accent="${accent}" aria-hidden="true"><canvas></canvas></span>`;
  }

  function paintSwatches(root) {
    const dpr = window.devicePixelRatio || 1;
    const frame = Math.max(1, Math.round(2 * dpr));
    // Smallest size >= 18 CSS px that is exact in layout units and leaves an even inner width.
    let size = Math.round(18 * dpr);
    for (let k = 0; k < 64; k++, size++) {
      const units = size / dpr * 64;
      if (Math.abs(units - Math.round(units)) < 1e-6 && (size - 2 * frame) % 2 === 0) break;
    }
    const ink = resolveColor(root, 'var(--black)', '#000');
    root.querySelectorAll('.theme-swatch').forEach(sw => {
      const canvas = sw.firstElementChild;
      canvas.width = canvas.height = size;
      canvas.style.width = canvas.style.height = `${size / dpr}px`;
      sw.style.width = sw.style.height = `${size / dpr}px`;
      const ctx = canvas.getContext('2d');
      const half = (size - 2 * frame) / 2;
      ctx.fillStyle = ink;
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = sw.dataset.paper;
      ctx.fillRect(frame, frame, half, size - 2 * frame);
      ctx.fillStyle = sw.dataset.accent;
      ctx.fillRect(frame + half, frame, half, size - 2 * frame);
      alignByLayout(canvas);
    });
  }

  // Put an absolutely positioned element on a point that is both a whole CSS pixel and a whole device
  // pixel, using layout offsets (no transform). Measured: this is the only placement Chrome paints
  // 1:1 at fractional zoom (125%, 150%...) inside the fixed theme menu.
  function alignByLayout(el) {
    const dpr = window.devicePixelRatio || 1;
    el.style.left = el.style.top = '0px';
    const r = el.getBoundingClientRect();
    const snap = v => {
      for (let k = 0; k < 64; k++) {
        for (const x of [Math.round(v) - k, Math.round(v) + k]) if (Math.abs(x * dpr - Math.round(x * dpr)) < 1e-6) return x;
      }
      return Math.round(v);
    };
    el.style.left = `${snap(r.left) - r.left}px`;
    el.style.top = `${snap(r.top) - r.top}px`;
  }

  function themeItemHtml(choice, label, scheme) {
    return `<button class="theme-item" type="button" role="menuitemradio" aria-checked="false" data-choice="${choice}">${swatchHtml(scheme)}<span class="theme-item-label">${escapeHtml(label)}</span></button>`;
  }

  function buildThemeMenu() {
    if (document.getElementById('theme-menu')) return document.getElementById('theme-menu');
    const menu = document.createElement('div');
    menu.id = 'theme-menu';
    menu.className = 'theme-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', 'Theme');
    menu.hidden = true;
    const group = suffix => COLOR_SCHEMES.filter(k => k.endsWith(suffix)).map(k => themeItemHtml(k, SCHEME_INFO[k][0], k)).join('');
    menu.innerHTML = `
      <div class="theme-menu-head">THEME</div>
      <div class="theme-menu-default"></div>
      <div class="theme-menu-cols">
        <div class="theme-menu-group" role="group" aria-label="Light"><div class="theme-menu-label">LIGHT</div>${group('-light')}</div>
        <div class="theme-menu-group" role="group" aria-label="Dark"><div class="theme-menu-label">DARK</div>${group('-dark')}</div>
      </div>`;
    document.body.appendChild(menu);
    menu.addEventListener('scroll', () => menu.querySelectorAll('.theme-swatch canvas').forEach(alignByLayout), { passive: true });
    menu.addEventListener('click', e => {
      const item = e.target.closest('.theme-item');
      if (!item) return;
      writeStorage(USER_SCHEME_KEY, item.dataset.choice === 'default' ? null : item.dataset.choice);
      applySettings();
      closeThemeMenu(true);
    });
    menu.addEventListener('keydown', e => {
      const items = Array.from(menu.querySelectorAll('.theme-item'));
      const i = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
      } else if (e.key === 'Home' || e.key === 'End') {
        e.preventDefault();
        items[e.key === 'Home' ? 0 : items.length - 1].focus();
      } else if (e.key === 'Escape' || e.key === 'Tab') {
        if (e.key === 'Escape') e.preventDefault();
        closeThemeMenu(e.key === 'Escape');
      }
    });
    return menu;
  }

  function syncThemeMenu() {
    const menu = document.getElementById('theme-menu');
    if (!menu) return;
    const admin = adminScheme(), user = userScheme();
    menu.querySelector('.theme-menu-default').innerHTML =
      themeItemHtml('default', `Default · ${SCHEME_INFO[admin][0]}${admin.endsWith('-dark') ? ' (dark)' : ''}`, admin);
    menu.querySelectorAll('.theme-item').forEach(item => {
      const on = user ? item.dataset.choice === user : item.dataset.choice === 'default';
      item.setAttribute('aria-checked', String(on));
    });
  }

  function positionThemeMenu() {
    const menu = document.getElementById('theme-menu');
    const button = document.querySelector('.btn-theme');
    if (!menu || menu.hidden || !button) return;
    const r = button.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    // Right-align with the button, but keep the whole menu on screen (8px margin) on narrow screens.
    const right = Math.min(Math.max(8, Math.round(vw - r.right)), Math.max(8, vw - menu.offsetWidth - 8));
    menu.style.top = `${Math.round(r.bottom + 10)}px`;
    menu.style.right = `${right}px`;
  }

  function openThemeMenu() {
    const menu = buildThemeMenu();
    syncThemeMenu();
    menu.hidden = false;
    positionThemeMenu();
    paintSwatches(menu);
    document.querySelector('.btn-theme').setAttribute('aria-expanded', 'true');
    document.querySelector('.btn-theme').classList.add('active');
    (menu.querySelector('.theme-item[aria-checked="true"]') || menu.querySelector('.theme-item')).focus();
  }

  function closeThemeMenu(returnFocus) {
    const menu = document.getElementById('theme-menu');
    const button = document.querySelector('.btn-theme');
    if (!menu || menu.hidden) return;
    menu.hidden = true;
    if (button) {
      button.setAttribute('aria-expanded', 'false');
      button.classList.remove('active');
      if (returnFocus) button.focus();
    }
  }

  function bindThemeMenu() {
    const button = document.querySelector('.btn-theme');
    if (!button) return;
    button.addEventListener('click', () => {
      const menu = document.getElementById('theme-menu');
      if (menu && !menu.hidden) closeThemeMenu(false); else openThemeMenu();
    });
    document.addEventListener('pointerdown', e => {
      if (!e.target.closest('#theme-menu, .btn-theme')) closeThemeMenu(false);
    });
    window.addEventListener('resize', () => {
      positionThemeMenu();
      const menu = document.getElementById('theme-menu');
      if (menu && !menu.hidden) paintSwatches(menu);
    });
    window.addEventListener('scroll', () => closeThemeMenu(false), { passive: true });
  }

  function applySettings() {
    const scheme = currentScheme();
    const cardStyle = state.settings.cardStyle || 'thick';
    const showUptime = state.settings.showUptime !== false;

    document.documentElement.dataset.scheme = scheme;
    writeStorage(SCHEME_STORAGE_KEY, scheme);
    syncThemeMenu();

    document.body.classList.remove('card-style-thin', 'card-style-double');
    if (cardStyle === 'thin') {
      document.body.classList.add('card-style-thin');
    } else if (cardStyle === 'double') {
      document.body.classList.add('card-style-double');
    }

    document.querySelectorAll('.node-footer').forEach(el => {
      el.style.display = showUptime ? '' : 'none';
    });

    refreshAllExtras();
    renderWorldMap();
    renderPagePattern();
    requestAnimationFrame(snapAllStrips);
  }

  async function rpcCall(method, params) {
    const id = ++requestId;
    const request = {
      jsonrpc: '2.0',
      method: method,
      params: params || {},
      id: id
    };

    const res = await fetch('/api/rpc2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request)
    });

    if (!res.ok) {
      throw new Error(`RPC error: ${res.status}`);
    }

    const response = await res.json();
    if (response.error) {
      throw new Error(`RPC error: ${response.error.message}`);
    }
    return response.result;
  }

  async function fetchPublicSettings() {
    try {
      const res = await fetch('/api/public');
      if (res.ok) {
        const response = await res.json();
        const publicSettings = response?.data && typeof response.data === 'object'
          ? response.data
          : response;
        state.publicSettings = publicSettings || {};
        const siteName = typeof publicSettings?.sitename === 'string' && publicSettings.sitename.trim()
          ? publicSettings.sitename.trim()
          : 'Komari Monitor';
        const siteNameElement = document.getElementById('site-name');
        if (siteNameElement) siteNameElement.textContent = siteName;
        document.title = siteName;

        if (publicSettings?.theme_settings) {
          state.settings = publicSettings.theme_settings;
          applySettings();
        }
      }
    } catch (e) {
      console.warn('[Komari Theme] Could not fetch theme settings:', e);
    }
  }

  async function fetchAuthState() {
    try {
      const me = await rpcCall('public:getMe', {});
      state.isLoggedIn = me?.logged_in === true;
    } catch (error) {
      state.isLoggedIn = false;
      console.warn('[Komari Theme] Could not determine login state:', error);
    }
    updateAuthButton();
    return state.isLoggedIn;
  }

  function updateAuthButton() {
    if (!elements.adminButton) return;
    const label = elements.adminButton.querySelector('span');
    if (state.isLoggedIn) {
      elements.adminButton.hidden = false;
      elements.adminButton.href = '/admin';
      elements.adminButton.title = 'Admin Panel';
      if (label) label.textContent = 'Admin';
      return;
    }

    const showLogin = state.publicSettings?.private_site || state.settings.showLoginButton !== false;
    elements.adminButton.hidden = !showLogin;
    elements.adminButton.href = '#login';
    elements.adminButton.title = 'Login';
    if (label) label.textContent = 'Login';
  }

  function setAuthStep(needsOtp) {
    state.authNeedsOtp = needsOtp;
    elements.authCredentials.hidden = needsOtp;
    elements.authOtp.hidden = !needsOtp;
    elements.authSubmit.textContent = needsOtp ? 'VERIFY' : 'LOGIN';
    elements.authMessage.textContent = '';
    if (needsOtp) {
      elements.authOtpCode.value = '';
      elements.authOtpCode.focus();
    }
  }

  function openAuthModal(forced = false) {
    state.authForced = forced;
    setAuthStep(false);
    elements.authClose.hidden = forced;
    elements.authOauth.hidden = !state.publicSettings?.oauth_enable;
    elements.authModal.classList.add('active');
    elements.authModal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => elements.authUsername.focus());
  }

  function closeAuthModal() {
    if (state.authForced) return;
    elements.authModal.classList.remove('active');
    elements.authModal.setAttribute('aria-hidden', 'true');
    elements.authForm.reset();
    elements.authMessage.textContent = '';
    document.body.style.overflow = '';
  }

  async function submitLogin(event) {
    event.preventDefault();
    const username = elements.authUsername.value.trim();
    const password = elements.authPassword.value;
    const otp = elements.authOtpCode.value.trim();
    if (!username || !password || (state.authNeedsOtp && !/^\d{6}$/.test(otp))) {
      elements.authMessage.textContent = state.authNeedsOtp ? 'ENTER A VALID 6-DIGIT CODE.' : 'USERNAME AND PASSWORD ARE REQUIRED.';
      return;
    }

    elements.authSubmit.disabled = true;
    elements.authSubmit.textContent = state.authNeedsOtp ? 'VERIFYING...' : 'AUTHENTICATING...';
    elements.authMessage.textContent = '';
    const body = { username, password };
    if (state.authNeedsOtp) body['2fa_code'] = otp;

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body)
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result?.status === 'error') {
        const message = String(result?.message || `Login failed (${response.status})`);
        if (!state.authNeedsOtp && /2fa|two.?factor/i.test(message)) {
          setAuthStep(true);
          return;
        }
        throw new Error(message);
      }

      await fetchAuthState();
      if (!state.isLoggedIn) throw new Error('The server did not create a login session.');
      state.authForced = false;
      elements.authModal.classList.remove('active');
      elements.authModal.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
      await fetchNodesAndStatus();
      startPolling();
      startCarrierPolling();
    } catch (error) {
      elements.authMessage.textContent = state.authNeedsOtp
        ? 'INVALID VERIFICATION CODE. TRY AGAIN.'
        : 'LOGIN FAILED. CHECK YOUR CREDENTIALS.';
      console.error('[Komari Theme] Login failed:', error);
    } finally {
      elements.authSubmit.disabled = false;
      elements.authSubmit.textContent = state.authNeedsOtp ? 'VERIFY' : 'LOGIN';
    }
  }

  async function fetchNodesAndStatus() {
    try {
      const [clients, statuses] = await Promise.all([
        rpcCall('common:getNodes', {}),
        rpcCall('common:getNodesLatestStatus', {})
      ]);

      if (clients && typeof clients === 'object') {
        Object.keys(clients).forEach(uuid => {
          const client = clients[uuid];
          const status = statuses && statuses[uuid];

          state.nodes.set(uuid, {
            uuid: uuid,
            name: client.name || 'Unknown',
            os: client.os || '',
            cpu_name: client.cpu_name || '',
            cpu_cores: client.cpu_cores || 0,
            arch: client.arch || '',
            mem_total: client.mem_total || 0,
            disk_total: client.disk_total || 0,
            swap_total: client.swap_total || 0,
            region: client.region || '',
            group: client.group || '',
            tags: client.tags || '',
            hidden: client.hidden || false,
            weight: client.weight || 0,
            traffic_limit: client.traffic_limit || 0,
            traffic_limit_type: client.traffic_limit_type || 'max',
            virtualization: client.virtualization || '',
            kernel_version: client.kernel_version || '',
            gpu_name: client.gpu_name || '',
            price: Number(client.price) || 0,
            billing_cycle: Number(client.billing_cycle) || 0,
            currency: client.currency || '',
            expired_at: client.expired_at || null,
            online: status ? status.online : false,
            cpu: status ? (status.cpu || 0) : 0,
            ram: status ? (status.ram || 0) : 0,
            ram_total: status ? (status.ram_total || client.mem_total || 0) : (client.mem_total || 0),
            disk: status ? (status.disk || 0) : 0,
            disk_total: status ? (status.disk_total || client.disk_total || 0) : (client.disk_total || 0),
            swap: status ? (status.swap || 0) : 0,
            swap_total: status ? (status.swap_total || client.swap_total || 0) : (client.swap_total || 0),
            load: status ? (status.load || 0) : 0,
            load5: status ? (status.load5 || 0) : 0,
            load15: status ? (status.load15 || 0) : 0,
            net_in: status ? (status.net_in || 0) : 0,
            net_out: status ? (status.net_out || 0) : 0,
            net_total_up: status ? (status.net_total_up || 0) : 0,
            net_total_down: status ? (status.net_total_down || 0) : 0,
            uptime: status ? (status.uptime || 0) : 0,
            process: status ? (status.process || 0) : 0,
            connections: status ? (status.connections || 0) : 0,
            connections_udp: status ? (status.connections_udp || 0) : 0,
            temp: status ? (status.temp || 0) : 0,
            gpu: status ? (status.gpu || 0) : 0,
            last_report: status ? (status.time || '') : '',
            time: status ? (status.time || '') : '',
          });
        });
      }

      const clientUuids = new Set(Object.keys(clients || {}));
      state.nodes.forEach((_, uuid) => {
        if (!clientUuids.has(uuid)) {
          state.nodes.delete(uuid);
        }
      });

      if (state.isInitialRender) {
        render();
        state.isInitialRender = false;
      } else {
        updateAllCards();
      }
      updateStats();
      renderWorldMap();
      alignAllCanvases();

      if (state.activeNodeUuid) {
        updateModalLiveInfo();
      }
    } catch (e) {
      console.error('[Komari Theme] Error fetching data:', e);
      renderError();
    }
  }

  function createNodeCard(node) {
    const cpu = node.cpu || 0;
    const ramPct = node.ram_total ? getPercentage(node.ram, node.ram_total) : 0;
    const diskPct = node.disk_total ? getPercentage(node.disk, node.disk_total) : 0;
    const isOnline = node.online !== false && node.name !== undefined;

    const cpuText = `${cpu.toFixed(1)}%`;
    const ramText = `${formatBytes(node.ram || 0)} / ${formatBytes(node.ram_total || 0)}`;
    const diskText = `${formatBytes(node.disk || 0)} / ${formatBytes(node.disk_total || 0)}`;
    const netTotal = node.traffic_limit > 0 ? getNetTotalByType(node) : (node.net_total_up || 0) + (node.net_total_down || 0);
    const netTotalText = formatBytes(netTotal) + (node.traffic_limit ? ' / ' + formatBytes(node.traffic_limit) : '');
    const netTypeLabel = getTrafficLimitLabel(node.traffic_limit_type || 'max');
    const { upPct, downPct, upDim, downDim, upHide, downHide, upLeft, downLeft, upZIndex, downZIndex } = getNetBarWidths(node);
    
    // speed logic
    const downSpeedText = isOnline ? `↓ ${formatNetworkSpeed(node.net_in || 0)}` : '↓ -';
    const upSpeedText = isOnline ? `↑ ${formatNetworkSpeed(node.net_out || 0)}` : '↑ -';
    
    const uptimeText = isOnline ? formatUptime(node.uptime) : '-';
    const upTotalText = `↑ ${formatBytes(node.net_total_up || 0)}`;
    const downTotalText = `↓ ${formatBytes(node.net_total_down || 0)}`;

    const card = document.createElement('div');
    card.className = `node-card${isOnline ? '' : ' offline'}`;
    card.dataset.uuid = node.uuid;
    card.style.cursor = 'pointer';

    card.innerHTML = `
      <div class="node-header">
        <div>
          <div class="node-name" title="${escapeHtml(node.name || 'Unknown')}">${flagHtml(node)}${escapeHtml(node.name || 'Unknown')}</div>
          <div class="node-info">
            <span class="node-info-line" title="${escapeHtml(node.os || '')}">${escapeHtml(node.os || '—')}</span>
            <span class="node-info-line" title="${escapeHtml(node.cpu_name || '')}">${escapeHtml(node.cpu_name || '—')}</span>
          </div>
        </div>
        <div class="node-status${isOnline ? '' : ' offline'}"></div>
      </div>
      <div class="metrics">
        <div class="metric">
          <div class="metric-header">
            <span>CPU</span>
            <span class="metric-value" data-prev="${cpuText}">${cpuText}</span>
          </div>
          <div class="metric-bar">
            <div class="metric-fill ${getMetricClass(cpu)}" style="width: ${Math.min(cpu, 100)}%"></div>
          </div>
        </div>
        <div class="metric">
          <div class="metric-header">
            <span>RAM</span>
            <span class="metric-value" data-prev="${ramText}">${ramText}</span>
          </div>
          <div class="metric-bar">
            <div class="metric-fill ${getMetricClass(ramPct)}" style="width: ${ramPct}%"></div>
          </div>
        </div>
        <div class="metric">
          <div class="metric-header">
            <span>DISK</span>
            <span class="metric-value" data-prev="${diskText}">${diskText}</span>
          </div>
          <div class="metric-bar">
            <div class="metric-fill ${getMetricClass(diskPct)}" style="width: ${diskPct}%"></div>
          </div>
        </div>
        <div class="metric">
          <div class="metric-header">
            <span>NETWORK${node.traffic_limit > 0 ? ' ' + netTypeLabel : ''}</span>
            <span class="metric-value" data-prev="${netTotalText}">${netTotalText}</span>
          </div>
          <div class="metric-bar net-bar${node.traffic_limit > 0 ? '' : ' unlimited'}">
            ${(node.traffic_limit > 0) ? `
            <div class="metric-fill net-in${upDim ? ' dimmed' : ''}${upHide ? ' hidden' : ''}" style="width: ${upPct.toFixed(1)}%; left: ${upLeft.toFixed(1)}%; z-index: ${upZIndex}"></div>
            <div class="metric-fill net-out${downDim ? ' dimmed' : ''}${downHide ? ' hidden' : ''}" style="width: ${downPct.toFixed(1)}%; left: ${downLeft.toFixed(1)}%; z-index: ${downZIndex}"></div>
            ` : `
            <div class="metric-fill net-in" style="width: 0%"></div>
            <div class="metric-fill net-out" style="width: 0%"></div>
            `}
          </div>
          <div class="net-totals">
            <span class="net-total-item" data-prev="${upTotalText}">${upTotalText}</span>
            <span class="net-total-item" data-prev="${downTotalText}">${downTotalText}</span>
          </div>
        </div>
      </div>
      <div class="node-extras" hidden></div>
      <div class="node-spacer"></div>
      <div class="node-footer">
        <div class="footer-stat">
          <span data-prev="${upSpeedText}">${upSpeedText}</span>
          UP SPEED
        </div>
        <div class="footer-stat">
          <span data-prev="${downSpeedText}">${downSpeedText}</span>
          DOWN SPEED
        </div>
        <div class="footer-stat">
          <span data-prev="${uptimeText}">${uptimeText}</span>
          UPTIME
        </div>
      </div>
    `;

    renderExtras(card, node);

    card.addEventListener('click', (e) => {
      if (e.target.tagName === 'A') return;
      openNodeModal(node.uuid);
    });

    return card;
  }

  function updateNodeCard(node) {
    const existingCard = document.querySelector(`[data-uuid="${node.uuid}"]`);
    if (!existingCard) return;

    const cpu = node.cpu || 0;
    const ramPct = node.ram_total ? getPercentage(node.ram, node.ram_total) : 0;
    const diskPct = node.disk_total ? getPercentage(node.disk, node.disk_total) : 0;
    const isOnline = node.online !== false && node.name !== undefined;

    existingCard.className = `node-card${isOnline ? '' : ' offline'}`;
    const statusDot = existingCard.querySelector('.node-status');
    if (statusDot) statusDot.classList.toggle('offline', !isOnline);

    // Update CPU
    const cpuValue = existingCard.querySelector('.metric:nth-child(1) .metric-value');
    const cpuFill = existingCard.querySelector('.metric:nth-child(1) .metric-fill');
    const newCpuText = `${cpu.toFixed(1)}%`;
    if (cpuValue) scrambleTextIfChanged(cpuValue, newCpuText);
    if (cpuFill) {
      const newWidth = `${Math.min(cpu, 100)}%`;
      if (cpuFill.style.width !== newWidth) {
        cpuFill.style.width = newWidth;
        cpuFill.classList.remove('high', 'medium', 'low');
        cpuFill.classList.add(getMetricClass(cpu));
      }
    }

    // Update RAM
    const ramValue = existingCard.querySelector('.metric:nth-child(2) .metric-value');
    const ramFill = existingCard.querySelector('.metric:nth-child(2) .metric-fill');
    const newRamText = `${formatBytes(node.ram || 0)} / ${formatBytes(node.ram_total || 0)}`;
    if (ramValue) scrambleTextIfChanged(ramValue, newRamText);
    if (ramFill) {
      const newWidth = `${ramPct}%`;
      if (ramFill.style.width !== newWidth) {
        ramFill.style.width = newWidth;
        ramFill.classList.remove('high', 'medium', 'low');
        ramFill.classList.add(getMetricClass(ramPct));
      }
    }

    // Update Disk
    const diskValue = existingCard.querySelector('.metric:nth-child(3) .metric-value');
    const diskFill = existingCard.querySelector('.metric:nth-child(3) .metric-fill');
    const newDiskText = `${formatBytes(node.disk || 0)} / ${formatBytes(node.disk_total || 0)}`;
    if (diskValue) scrambleTextIfChanged(diskValue, newDiskText);
    if (diskFill) {
      const newWidth = `${diskPct}%`;
      if (diskFill.style.width !== newWidth) {
        diskFill.style.width = newWidth;
        diskFill.classList.remove('high', 'medium', 'low');
        diskFill.classList.add(getMetricClass(diskPct));
      }
    }

    // Update Network total
    const netTotalValue = existingCard.querySelector('.metric:nth-child(4) .metric-value');
    const netTotal = node.traffic_limit > 0 ? getNetTotalByType(node) : (node.net_total_up || 0) + (node.net_total_down || 0);
    const newNetTotalText = formatBytes(netTotal) + (node.traffic_limit ? ' / ' + formatBytes(node.traffic_limit) : '');
    if (netTotalValue) scrambleTextIfChanged(netTotalValue, newNetTotalText);

    // Update network bar
    const netBar = existingCard.querySelector('.metric:nth-child(4) .net-bar');
    if (netBar) {
      const netIn = existingCard.querySelector('.net-in');
      const netOut = existingCard.querySelector('.net-out');
      const { upPct, downPct, upDim, downDim, upHide, downHide, upLeft, downLeft, upZIndex, downZIndex } = getNetBarWidths(node);
      if (node.traffic_limit > 0) {
        netBar.classList.remove('unlimited');
        if (netIn) {
          netIn.style.width = `${upPct.toFixed(1)}%`;
          netIn.style.left = `${upLeft.toFixed(1)}%`;
          netIn.style.zIndex = upZIndex;
          netIn.classList.toggle('dimmed', upDim);
          netIn.classList.toggle('hidden', upHide);
        }
        if (netOut) {
          netOut.style.width = `${downPct.toFixed(1)}%`;
          netOut.style.left = `${downLeft.toFixed(1)}%`;
          netOut.style.zIndex = downZIndex;
          netOut.classList.toggle('dimmed', downDim);
          netOut.classList.toggle('hidden', downHide);
        }
      } else {
        netBar.classList.add('unlimited');
        if (netIn) netIn.style.width = '0%';
        if (netOut) netOut.style.width = '0%';
      }
    }

    const netTotals = existingCard.querySelectorAll('.net-total-item');
    if (netTotals.length === 2) {
      scrambleTextIfChanged(netTotals[0], `↑ ${formatBytes(node.net_total_up || 0)}`);
      scrambleTextIfChanged(netTotals[1], `↓ ${formatBytes(node.net_total_down || 0)}`);
    }

    const netUp = existingCard.querySelector('.footer-stat:nth-child(1) span');
    const netDown = existingCard.querySelector('.footer-stat:nth-child(2) span');
    const uptime = existingCard.querySelector('.footer-stat:nth-child(3) span');
    
    const newDownSpeedText = isOnline ? `↓ ${formatNetworkSpeed(node.net_in || 0)}` : '↓ -';
    const newUpSpeedText = isOnline ? `↑ ${formatNetworkSpeed(node.net_out || 0)}` : '↑ -';
    const newUptimeText = isOnline ? formatUptime(node.uptime) : '-';

    if (netUp) scrambleTextIfChanged(netUp, newUpSpeedText);
    if (netDown) scrambleTextIfChanged(netDown, newDownSpeedText);
    if (uptime) scrambleTextIfChanged(uptime, newUptimeText);

    renderExtras(existingCard, node);
  }

  function createNodeListItem(node) {
    const cpu = node.cpu || 0;
    const ramPct = node.ram_total ? getPercentage(node.ram, node.ram_total) : 0;
    const diskPct = node.disk_total ? getPercentage(node.disk, node.disk_total) : 0;
    const isOnline = node.online !== false && node.name !== undefined;

    const cpuText = `${cpu.toFixed(1)}%`;
    const ramText = `${formatBytes(node.ram || 0)} / ${formatBytes(node.ram_total || 0)}`;
    const diskText = `${formatBytes(node.disk || 0)} / ${formatBytes(node.disk_total || 0)}`;
    const netTotal = node.traffic_limit > 0 ? getNetTotalByType(node) : (node.net_total_up || 0) + (node.net_total_down || 0);
    const netTotalText = formatBytes(netTotal) + (node.traffic_limit ? ' / ' + formatBytes(node.traffic_limit) : '');
    const { upPct, downPct, upDim, downDim, upHide, downHide, upLeft, downLeft, upZIndex, downZIndex } = getNetBarWidths(node);

    const downSpeedText = isOnline ? `${formatNetworkSpeed(node.net_in || 0)}` : '-';
    const upSpeedText = isOnline ? `${formatNetworkSpeed(node.net_out || 0)}` : '-';
    const uptimeText = isOnline ? formatUptime(node.uptime) : '-';

    const row = document.createElement('div');
    row.className = `node-row${isOnline ? '' : ' offline'}`;
    row.dataset.uuid = node.uuid;
    row.style.cursor = 'pointer';

    row.innerHTML = `
      <div class="row-head">
        <div class="row-status${isOnline ? '' : ' offline'}"></div>
        <div class="row-name">
          <div class="row-node-name">${flagHtml(node)}${escapeHtml(node.name || 'Unknown')}</div>
          <div class="row-node-info">${escapeHtml(node.os || '')}${node.cpu_name ? ' · ' + escapeHtml(node.cpu_name) : ''}</div>
        </div>
        <div class="row-uptime">
          <span class="row-uptime-label">UPTIME</span>
          <span class="row-uptime-value" data-prev="${uptimeText}">${uptimeText}</span>
        </div>
      </div>
      <div class="row-metrics">
        <div class="row-metric row-cpu">
          <div class="row-metric-header">
            <span class="row-metric-label">CPU</span>
            <span class="row-metric-value" data-prev="${cpuText}">${cpuText}</span>
          </div>
          <div class="row-metric-bar"><div class="row-fill ${getMetricClass(cpu)}" style="width: ${Math.min(cpu, 100)}%"></div></div>
        </div>
        <div class="row-metric row-ram">
          <div class="row-metric-header">
            <span class="row-metric-label">RAM</span>
            <span class="row-metric-value" data-prev="${ramText}">${ramText}</span>
          </div>
          <div class="row-metric-bar"><div class="row-fill ${getMetricClass(ramPct)}" style="width: ${ramPct}%"></div></div>
        </div>
        <div class="row-metric row-disk">
          <div class="row-metric-header">
            <span class="row-metric-label">DISK</span>
            <span class="row-metric-value" data-prev="${diskText}">${diskText}</span>
          </div>
          <div class="row-metric-bar"><div class="row-fill ${getMetricClass(diskPct)}" style="width: ${diskPct}%"></div></div>
        </div>
        <div class="row-metric row-net">
          <div class="row-metric-header">
            <span class="row-metric-label">NET${node.traffic_limit > 0 ? ' ' + escapeHtml(getTrafficLimitLabel(node.traffic_limit_type || 'max')) : ''}</span>
            <span class="row-metric-value" data-prev="${netTotalText}">${netTotalText}</span>
          </div>
          <div class="row-metric-bar net-bar${node.traffic_limit > 0 ? '' : ' unlimited'}">
            ${(node.traffic_limit > 0) ? `
            <div class="row-fill net-in${upDim ? ' dimmed' : ''}${upHide ? ' hidden' : ''}" style="width: ${upPct.toFixed(1)}%; left: ${upLeft.toFixed(1)}%; z-index: ${upZIndex}"></div>
            <div class="row-fill net-out${downDim ? ' dimmed' : ''}${downHide ? ' hidden' : ''}" style="width: ${downPct.toFixed(1)}%; left: ${downLeft.toFixed(1)}%; z-index: ${downZIndex}"></div>
            ` : `
            <div class="row-fill net-in" style="width: 0%"></div>
            <div class="row-fill net-out" style="width: 0%"></div>
            `}
          </div>
        </div>
      </div>
      <div class="row-speeds">
        <div class="row-speed row-up">
          <span class="row-speed-label"><span class="row-arrow">↑</span></span>
          <span class="row-speed-value" data-prev="${upSpeedText}">${upSpeedText}</span>
        </div>
        <div class="row-speed row-down">
          <span class="row-speed-label"><span class="row-arrow">↓</span></span>
          <span class="row-speed-value" data-prev="${downSpeedText}">${downSpeedText}</span>
        </div>
      </div>
      <div class="node-extras" hidden></div>
    `;

    renderExtras(row, node);

    row.addEventListener('click', (e) => {
      if (e.target.tagName === 'A') return;
      openNodeModal(node.uuid);
    });

    return row;
  }

  function updateNodeListItem(row, node) {
    const cpu = node.cpu || 0;
    const ramPct = node.ram_total ? getPercentage(node.ram, node.ram_total) : 0;
    const diskPct = node.disk_total ? getPercentage(node.disk, node.disk_total) : 0;
    const isOnline = node.online !== false && node.name !== undefined;

    row.className = `node-row${isOnline ? '' : ' offline'}`;
    const rowStatus = row.querySelector('.row-status');
    if (rowStatus) rowStatus.classList.toggle('offline', !isOnline);

    const updateMetric = (key, value, pct, fillClass) => {
      const valueEl = row.querySelector(`.row-${key} .row-metric-value`);
      const fillEl = row.querySelector(`.row-${key} .row-fill`);
      if (valueEl) scrambleTextIfChanged(valueEl, value);
      if (fillEl) {
        const newWidth = `${key === 'cpu' ? Math.min(pct, 100) : pct}%`;
        if (fillEl.style.width !== newWidth) {
          fillEl.style.width = newWidth;
          fillEl.classList.remove('high', 'medium', 'low');
          fillEl.classList.add(fillClass);
        }
      }
    };

    updateMetric('cpu', `${cpu.toFixed(1)}%`, cpu, getMetricClass(cpu));
    updateMetric('ram', `${formatBytes(node.ram || 0)} / ${formatBytes(node.ram_total || 0)}`, ramPct, getMetricClass(ramPct));
    updateMetric('disk', `${formatBytes(node.disk || 0)} / ${formatBytes(node.disk_total || 0)}`, diskPct, getMetricClass(diskPct));

    const netTotal = node.traffic_limit > 0 ? getNetTotalByType(node) : (node.net_total_up || 0) + (node.net_total_down || 0);
    const netTotalText = formatBytes(netTotal) + (node.traffic_limit ? ' / ' + formatBytes(node.traffic_limit) : '');
    const netValueEl = row.querySelector('.row-net .row-metric-value');
    if (netValueEl) scrambleTextIfChanged(netValueEl, netTotalText);

    const netBar = row.querySelector('.row-net .net-bar');
    if (netBar) {
      const netIn = netBar.querySelector('.net-in');
      const netOut = netBar.querySelector('.net-out');
      const { upPct, downPct, upDim, downDim, upHide, downHide, upLeft, downLeft, upZIndex, downZIndex } = getNetBarWidths(node);
      if (node.traffic_limit > 0) {
        netBar.classList.remove('unlimited');
        if (netIn) {
          netIn.style.width = `${upPct.toFixed(1)}%`;
          netIn.style.left = `${upLeft.toFixed(1)}%`;
          netIn.style.zIndex = upZIndex;
          netIn.classList.toggle('dimmed', upDim);
          netIn.classList.toggle('hidden', upHide);
        }
        if (netOut) {
          netOut.style.width = `${downPct.toFixed(1)}%`;
          netOut.style.left = `${downLeft.toFixed(1)}%`;
          netOut.style.zIndex = downZIndex;
          netOut.classList.toggle('dimmed', downDim);
          netOut.classList.toggle('hidden', downHide);
        }
      } else {
        netBar.classList.add('unlimited');
        if (netIn) netIn.style.width = '0%';
        if (netOut) netOut.style.width = '0%';
      }
    }

    const upValue = row.querySelector('.row-up .row-speed-value');
    const downValue = row.querySelector('.row-down .row-speed-value');
    const upSpan = row.querySelector('.row-uptime-value');
    if (upValue) scrambleTextIfChanged(upValue, isOnline ? formatNetworkSpeed(node.net_out || 0) : '-');
    if (downValue) scrambleTextIfChanged(downValue, isOnline ? formatNetworkSpeed(node.net_in || 0) : '-');
    if (upSpan) scrambleTextIfChanged(upSpan, isOnline ? formatUptime(node.uptime) : '-');

    renderExtras(row, node);
  }

  function render() {
    if (state.nodes.size === 0) {
      elements.container.innerHTML = `
        <div class="empty-state">
          <h2>NO NODES</h2>
          <p>No monitoring targets found.</p>
        </div>
      `;
      return;
    }

    elements.container.innerHTML = '';
    elements.container.className = `nodes-container${state.viewMode === 'list' ? ' list-view' : ''}`;

    const sortedNodes = Array.from(state.nodes.values()).sort((a, b) => a.weight - b.weight);

    sortedNodes.forEach(node => {
      const item = state.viewMode === 'list' ? createNodeListItem(node) : createNodeCard(node);
      elements.container.appendChild(item);
    });
  }

  function updateAllCards() {
    if (state.nodes.size === 0) return;
    state.nodes.forEach((node, uuid) => {
      const el = document.querySelector(`[data-uuid="${uuid}"]`);
      if (!el) return;
      if (el.classList.contains('node-row')) {
        updateNodeListItem(el, node);
      } else {
        updateNodeCard(node);
      }
    });
  }

  function updateStats() {
    let totalCpu = 0;
    let totalRam = 0;
    let onlineCount = 0;
    let ramCount = 0;
    let totalNetIn = 0;
    let totalNetOut = 0;

    state.nodes.forEach(node => {
      if (node.online !== false) {
        onlineCount++;
        totalCpu += node.cpu || 0;
        totalNetIn += node.net_in || 0;
        totalNetOut += node.net_out || 0;
        if (node.ram_total > 0) {
          totalRam += ((node.ram || 0) / node.ram_total) * 100;
          ramCount++;
        }
      }
    });

    const nodeCount = state.nodes.size;
    const avgCpu = nodeCount > 0 ? (totalCpu / nodeCount) : 0;
    const avgRam = ramCount > 0 ? (totalRam / ramCount) : 0;
    const netInText = (totalNetIn > 0 ? formatNetworkSpeed(totalNetIn) : '0 B/s').replace(' ', '\n');
    const netOutText = (totalNetOut > 0 ? formatNetworkSpeed(totalNetOut) : '0 B/s').replace(' ', '\n');

    const nodesText = nodeCount.toString();
    const onlineText = onlineCount.toString();
    const cpuText = avgCpu.toFixed(0) + '%';
    const ramText = avgRam.toFixed(0) + '%';

    if (state.isInitialRender) {
      elements.statNodes.dataset.prev = nodesText;
      elements.statOnline.dataset.prev = onlineText;
      elements.statCpu.dataset.prev = cpuText;
      elements.statRam.dataset.prev = ramText;
      elements.statNetIn.dataset.prev = netInText;
      elements.statNetOut.dataset.prev = netOutText;

      elements.statNodes.textContent = nodesText;
      elements.statOnline.textContent = onlineText;
      elements.statCpu.textContent = cpuText;
      elements.statRam.textContent = ramText;
      elements.statNetIn.textContent = netInText;
      elements.statNetOut.textContent = netOutText;
    } else {
      scrambleTextIfChanged(elements.statNodes, nodesText);
      scrambleTextIfChanged(elements.statOnline, onlineText);
      scrambleTextIfChanged(elements.statCpu, cpuText);
      scrambleTextIfChanged(elements.statRam, ramText);
      scrambleTextIfChanged(elements.statNetIn, netInText);
      scrambleTextIfChanged(elements.statNetOut, netOutText);
    }
  }

  function renderError() {
    elements.container.innerHTML = `
      <div class="empty-state">
        <h2>CONNECTION ERROR</h2>
        <p>Could not connect to Komari Monitor API.</p>
      </div>
    `;
  }

  function setViewMode(mode) {
    state.viewMode = mode;
    localStorage.setItem('nodeViewMode', mode);
    document.querySelectorAll('.btn-view[data-view]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === mode);
    });
    elements.container.className = `nodes-container${mode === 'list' ? ' list-view' : ''}`;
    render();
  }

  // --- Modal & Charts ---

  async function openNodeModal(uuid) {
    state.modalCloseId++;
    state.activeNodeUuid = uuid;
    state.modalTimeScale = 1; // Reset to 1h on open
    const node = state.nodes.get(uuid);
    if (!node) return;

    const netSpeedDown = formatNetworkSpeed(node.net_in || 0);
    const netSpeedUp = formatNetworkSpeed(node.net_out || 0);
    const memoryPercent = getPercentage(node.ram || 0, node.ram_total || 0);
    const swapPercent = getPercentage(node.swap || 0, node.swap_total || 0);
    const diskPercent = getPercentage(node.disk || 0, node.disk_total || 0);

    elements.modalContent.innerHTML = `
      <div class="modal-node-header">
        <div class="modal-node-title">
          <h2 class="modal-node-name">${node.name}</h2>
          <span class="modal-node-status-tag ${node.online ? 'online' : 'offline'}">${node.online ? 'Online' : 'Offline'}</span>
        </div>
        <div class="modal-node-meta">${node.os || ''} · ${node.arch || ''} · ${node.region || ''}</div>
      </div>

      <div class="modal-info-row">
        <div class="modal-info-section">
          <h3 class="modal-info-section-title">HARDWARE</h3>
          <div class="modal-info-grid">
            <div class="info-item"><span class="info-label">CPU</span><span class="info-value">${node.cpu_name || '-'} (${node.cpu_cores || 0} Cores)</span></div>
            <div class="info-item"><span class="info-label">Architecture</span><span class="info-value">${node.arch || '-'}</span></div>
            <div class="info-item"><span class="info-label">Virtualization</span><span class="info-value">${node.virtualization || '-'}</span></div>
            <div class="info-item"><span class="info-label">GPU</span><span class="info-value">${node.gpu_name || '-'}</span></div>
          </div>
        </div>

        <div class="modal-info-section">
          <h3 class="modal-info-section-title">SYSTEM</h3>
          <div class="modal-info-grid">
            <div class="info-item"><span class="info-label">OS</span><span class="info-value">${node.os || '-'}</span></div>
            <div class="info-item"><span class="info-label">Kernel</span><span class="info-value">${node.kernel_version || '-'}</span></div>
            <div class="info-item"><span class="info-label">Uptime</span><span class="info-value" id="modal-uptime">${formatUptime(node.uptime)}</span></div>
            <div class="info-item"><span class="info-label">Last Report</span><span class="info-value" id="modal-last-report">${node.last_report ? new Date(node.last_report).toLocaleString() : '-'}</span></div>
          </div>
        </div>

        <div class="modal-info-section modal-storage-section">
          <h3 class="modal-info-section-title">STORAGE</h3>
          <div class="storage-stack">
            <div class="storage-meter">
              <div class="storage-meter-header">
                <span class="storage-meter-label">MEMORY</span>
                <span class="storage-meter-value">${formatBytes(node.ram || 0)} / ${formatBytes(node.ram_total || 0)}</span>
              </div>
              <div class="storage-meter-track"><span class="storage-meter-fill ${getMetricClass(memoryPercent)}" style="width: ${memoryPercent}%"></span></div>
              <span class="storage-meter-percent">${memoryPercent}% USED</span>
            </div>
            <div class="storage-meter${node.swap_total > 0 ? '' : ' unlimited'}">
              <div class="storage-meter-header">
                <span class="storage-meter-label">SWAP</span>
                <span class="storage-meter-value">${node.swap_total > 0 ? `${formatBytes(node.swap || 0)} / ${formatBytes(node.swap_total)}` : 'NOT CONFIGURED'}</span>
              </div>
              <div class="storage-meter-track">${node.swap_total > 0 ? `<span class="storage-meter-fill ${getMetricClass(swapPercent)}" style="width: ${swapPercent}%"></span>` : ''}</div>
              <span class="storage-meter-percent">${node.swap_total > 0 ? `${swapPercent}% USED` : 'UNLIMITED'}</span>
            </div>
            <div class="storage-meter">
              <div class="storage-meter-header">
                <span class="storage-meter-label">DISK</span>
                <span class="storage-meter-value">${formatBytes(node.disk || 0)} / ${formatBytes(node.disk_total || 0)}</span>
              </div>
              <div class="storage-meter-track"><span class="storage-meter-fill ${getMetricClass(diskPercent)}" style="width: ${diskPercent}%"></span></div>
              <span class="storage-meter-percent">${diskPercent}% USED</span>
            </div>
          </div>
        </div>

        <div class="modal-info-section modal-network-section">
          <h3 class="modal-info-section-title">NETWORK</h3>
          <div class="network-channels">
            <div class="network-channel up">
              <div class="network-channel-direction"><span class="network-channel-arrow">↑</span><span>UPLOAD</span></div>
              <span class="network-channel-speed">${netSpeedUp}</span>
              <div class="network-channel-total"><span>TOTAL SENT</span><strong>${formatBytes(node.net_total_up || 0)}</strong></div>
            </div>
            <div class="network-channel down">
              <div class="network-channel-direction"><span class="network-channel-arrow">↓</span><span>DOWNLOAD</span></div>
              <span class="network-channel-speed">${netSpeedDown}</span>
              <div class="network-channel-total"><span>TOTAL RECEIVED</span><strong>${formatBytes(node.net_total_down || 0)}</strong></div>
            </div>
          </div>
          <div class="network-connections">
            <span>CONNECTIONS</span>
            <strong>${node.connections || 0} TCP · ${node.connections_udp || 0} UDP</strong>
          </div>
        </div>
        ${buildModalBillingHtml(node)}
      </div>

      <section class="modal-chart-section modal-load-section">
        <div class="modal-load-title-container">
          <h3 class="modal-load-title">LOAD OVERVIEW</h3>
          <div class="modal-timescale-selector load-timescale">
            <button class="btn-timescale active" data-hours="1">1H</button>
            <button class="btn-timescale" data-hours="6">6H</button>
            <button class="btn-timescale" data-hours="24">24H</button>
            <button class="btn-timescale" data-hours="72">3D</button>
            <button class="btn-timescale" data-hours="168">7D</button>
            <button class="btn-timescale" data-hours="720">30D</button>
          </div>
        </div>
        <div class="modal-load-grid">
        <div class="load-chart-card">
          <div class="load-chart-label">CPU</div>
          <div class="load-chart-value" id="modal-cpu-val">${(node.cpu || 0).toFixed(1)}%</div>
          <div id="chart-cpu" class="load-chart-container"></div>
        </div>
        <div class="load-chart-card">
          <div class="load-chart-label">Memory</div>
          <div class="load-chart-value" id="modal-ram-val">${(node.ram_total > 0 ? (node.ram / node.ram_total * 100) : 0).toFixed(1)}%</div>
          <div id="chart-ram" class="load-chart-container"></div>
        </div>
        <div class="load-chart-card">
          <div class="load-chart-label">Disk</div>
          <div class="load-chart-value" id="modal-disk-val">${(node.disk_total > 0 ? (node.disk / node.disk_total * 100) : 0).toFixed(1)}%</div>
          <div id="chart-disk" class="load-chart-container"></div>
        </div>
        <div class="load-chart-card">
          <div class="load-chart-label">Network</div>
          <div class="load-chart-value load-network-value" id="modal-net-val">
            <span class="load-network-up">↑ <span id="modal-net-up-val">${netSpeedUp}</span></span>
            <span class="load-network-separator">/</span>
            <span class="load-network-down">↓ <span id="modal-net-down-val">${netSpeedDown}</span></span>
          </div>
          <div id="chart-net" class="load-chart-container"></div>
        </div>
        <div class="load-chart-card">
          <div class="load-chart-label">Connections</div>
          <div class="load-chart-value" id="modal-conn-val">${node.connections || 0}</div>
          <div id="chart-conn" class="load-chart-container"></div>
        </div>
        <div class="load-chart-card">
          <div class="load-chart-label">Processes</div>
          <div class="load-chart-value" id="modal-proc-val">${node.process || 0}</div>
          <div id="chart-proc" class="load-chart-container"></div>
        </div>
        </div>
      </section>

      <section class="modal-chart-section modal-latency-section">
        <div class="modal-latency-header">
          <h3 class="modal-section-title">LATENCY</h3>
          <div class="modal-timescale-selector latency-timescale">
            <button class="btn-timescale active" data-hours="1">1H</button>
            <button class="btn-timescale" data-hours="6">6H</button>
            <button class="btn-timescale" data-hours="12">12H</button>
            <button class="btn-timescale" data-hours="24">24H</button>
          </div>
        </div>
        <div class="modal-latency-tasks" id="modal-latency-tasks"></div>
        <div id="chart-ping" class="chart-container"></div>
      </section>
    `;

    // Timescale events for LOAD
    elements.modalContent.querySelectorAll('.load-timescale .btn-timescale').forEach(btn => {
      btn.addEventListener('click', () => {
        const hours = parseInt(btn.dataset.hours);
        if (state.modalLoadTimeScale === hours) return;
        state.modalLoadTimeScale = hours;
        elements.modalContent.querySelectorAll('.load-timescale .btn-timescale').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        refreshLoadCharts(uuid);
      });
    });

    // Timescale events for LATENCY
    elements.modalContent.querySelectorAll('.latency-timescale .btn-timescale').forEach(btn => {
      btn.addEventListener('click', () => {
        const hours = parseInt(btn.dataset.hours);
        if (state.modalTimeScale === hours) return;
        state.modalTimeScale = hours;
        elements.modalContent.querySelectorAll('.latency-timescale .btn-timescale').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        refreshLatencyChart(uuid);
      });
    });

    document.body.style.overflow = 'hidden';
    elements.modal.classList.add('active');
    requestAnimationFrame(() => {
      refreshLoadCharts(uuid);
      refreshLatencyChart(uuid);
    });
  }

  function setChartLoading(sectionSelector, isLoading) {
    const section = elements.modalContent.querySelector(sectionSelector);
    if (!section) return;

    section.classList.toggle('is-loading', isLoading);
    let overlay = section.querySelector('.chart-loading-overlay');

    if (isLoading) {
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'chart-loading-overlay';
        overlay.setAttribute('role', 'status');
        overlay.setAttribute('aria-label', 'Loading chart data');
        overlay.innerHTML = `
          <div class="chart-loading-panel">
            <div class="chart-loading-pixels" aria-hidden="true">
              ${Array.from({ length: 25 }, (_, index) => `<span class="chart-loading-pixel" style="--pixel-index: ${index}"></span>`).join('')}
            </div>
            <span class="chart-loading-text">RESOLVING DATA...</span>
          </div>
        `;
        section.appendChild(overlay);
      }
      overlay.classList.remove('is-leaving');
      requestAnimationFrame(() => overlay.classList.add('is-visible'));
    } else if (overlay) {
      overlay.classList.remove('is-visible');
      overlay.classList.add('is-leaving');
      setTimeout(() => {
        if (!section.classList.contains('is-loading')) overlay.remove();
      }, 250);
    }
  }

  async function refreshLoadCharts(uuid) {
    const requestId = ++state.loadRequestId;
    setChartLoading('.modal-load-section', true);

    try {
      const records = await fetchLoadHistory(uuid, state.modalLoadTimeScale);
      const history = records
        .map(record => ({ ...record, timestamp: parseRecordTime(record.time ?? record.updated_at) }))
        .filter(record => record.timestamp != null)
        .sort((a, b) => a.timestamp - b.timestamp);
      if (requestId !== state.loadRequestId || state.activeNodeUuid !== uuid) return;
      renderLoadCharts(history);
    } catch (error) {
      if (requestId === state.loadRequestId) console.warn('Error refreshing load charts:', error);
    } finally {
      if (requestId === state.loadRequestId) setChartLoading('.modal-load-section', false);
    }
  }

  async function refreshLatencyChart(uuid) {
    const requestId = ++state.latencyRequestId;
    setChartLoading('.modal-latency-section', true);

    try {
      const response = await rpcCall('common:getRecords', { uuid, type: 'ping', hours: state.modalTimeScale });
      if (requestId !== state.latencyRequestId || state.activeNodeUuid !== uuid) return;
      renderLatencyChart(response?.records || [], response?.tasks || []);
    } catch (error) {
      if (requestId === state.latencyRequestId) console.warn('Error refreshing latency chart:', error);
    } finally {
      if (requestId === state.latencyRequestId) setChartLoading('.modal-latency-section', false);
    }
  }

  async function fetchLoadHistory(uuid, hours) {
    try {
      const response = await fetch(`/api/records/load?uuid=${encodeURIComponent(uuid)}&hours=${hours}`);
      if (!response.ok) throw new Error(`Load history error: ${response.status}`);
      const payload = await response.json();
      return payload?.data?.records || payload?.records || [];
    } catch (error) {
      console.warn('[Komari Theme] Falling back to recent load records:', error);
      const limit = Math.min(1000, Math.max(60, hours * 60));
      const result = await rpcCall('common:getNodeRecentStatus', { uuid, limit });
      return result?.records || [];
    }
  }

  function closeNodeModal() {
    const closeId = ++state.modalCloseId;
    state.activeNodeUuid = null;
    state.loadRequestId++;
    state.latencyRequestId++;
    elements.modal.classList.remove('active');
    document.body.style.overflow = '';

    setTimeout(() => {
      if (closeId === state.modalCloseId && !elements.modal.classList.contains('active')) {
        disposeCharts();
      }
    }, 280);
  }

  function disposeCharts() {
    Object.values(state.charts).forEach(chart => {
      if (chart && typeof chart.dispose === 'function' && !chart.isDisposed()) chart.dispose();
    });
    state.charts = {};
  }

  function disposeChart(key) {
    const chart = state.charts[key];
    if (chart && typeof chart.dispose === 'function' && !chart.isDisposed()) chart.dispose();
    delete state.charts[key];
  }

  function formatChartTime(timestamp, hours, includeSeconds = false) {
    const date = new Date(timestamp);
    if (hours >= 24) {
      return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    }
    const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    return includeSeconds ? `${time}:${String(date.getSeconds()).padStart(2, '0')}` : time;
  }

  function createSeries(name, color, data, areaOpacity = 0.16, connectNulls = false) {
    return {
    name,
    type: 'line',
    data,
    showSymbol: false,
    smooth: true,
    connectNulls,
    lineStyle: { width: 2, color },
    itemStyle: { color },
    areaStyle: areaOpacity ? { opacity: areaOpacity, color } : undefined,
    emphasis: { focus: 'series' }
    };
  }

  function createChartOption(series, hours, formatter, yMax, showLegend = false, splitNumber = 4) {
    const timestamps = series.flatMap(item => item.data.map(point => point[0])).filter(Number.isFinite);
    const dataMin = timestamps.length ? Math.min(...timestamps) : null;
    const dataMax = timestamps.length ? Math.max(...timestamps) : null;
    const ink = cssVar('--black', '#000');
    const paper = cssVar('--white', '#fff');
    const muted = cssVar('--chart-label', '#555');
    const gridLine = cssVar('--grid-line', 'rgba(0, 0, 0, 0.12)');
    return {
    animation: false,
    backgroundColor: 'transparent',
    textStyle: { fontFamily: 'Space Grotesk, sans-serif' },
    color: series.map(item => item.itemStyle.color),
    grid: { top: showLegend ? 38 : 16, right: 18, bottom: 34, left: 58, containLabel: false },
    legend: {
      show: showLegend,
      top: 6,
      right: 12,
      textStyle: { color: ink, fontWeight: 700, fontSize: 11 }
    },
    tooltip: {
      trigger: 'axis',
      confine: true,
      backgroundColor: paper,
      borderColor: ink,
      borderWidth: 2,
      padding: 0,
      textStyle: { color: ink, fontWeight: 700 },
      axisPointer: { type: 'line', lineStyle: { color: ink, type: 'dashed' } },
      formatter: params => {
        if (!params.length) return '';
        const timestamp = params[0].value[0];
        const rows = params
          .filter(item => item.seriesType !== 'scatter' && item.value[1] != null)
          .map(item => `${item.marker}${item.seriesName}: ${formatter(item.value[1])}`);
        return `<div style="background:${ink};color:${paper};padding:6px 10px;font-weight:700">${formatChartTime(timestamp, hours, true)}</div><div style="padding:8px 10px;line-height:1.7">${rows.join('<br>')}</div>`;
      }
    },
    xAxis: {
      type: 'time',
      boundaryGap: false,
      min: dataMin == null ? undefined : dataMin,
      max: dataMax == null ? undefined : dataMax,
      splitNumber,
      z: 10,
      axisLine: { show: true, lineStyle: { color: ink, width: 2 } },
      axisTick: { show: false },
      splitLine: { show: true, lineStyle: { color: gridLine, type: 'dashed' } },
      axisLabel: {
        color: muted,
        fontSize: 10,
        fontWeight: 700,
        hideOverlap: true,
        formatter: value => formatChartTime(value, hours)
      }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: yMax,
      splitNumber,
      z: 10,
      axisLabel: { color: muted, fontSize: 10, fontWeight: 700, formatter },
      axisLine: { show: true, lineStyle: { color: ink, width: 2 } },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: gridLine, type: 'dashed' } }
    },
    series,
    media: [
      {
        query: { maxWidth: 600 },
        option: {
          legend: { show: false },
          grid: { top: 12, right: 10, bottom: 28, left: 46 }
        }
      }
    ]
    };
  }

  function mountChart(key, selector, option) {
    const element = document.querySelector(selector);
    if (!element) return;
    const chart = echarts.init(element, null, { renderer: 'canvas' });
    chart.setOption(option, { notMerge: true });
    state.charts[key] = chart;
  };


  function renderLoadCharts(history) {
    ['cpu', 'ram', 'disk', 'net', 'conn', 'proc'].forEach(disposeChart);
    if (typeof echarts === 'undefined') return;

    const toPoint = (record, value) => [record.timestamp, value];
    const netDownData = history.map(h => toPoint(h, h.net_in ?? 0));
    const netUpData = history.map(h => toPoint(h, h.net_out ?? 0));
    const cpuData = history.map(h => toPoint(h, h.cpu ?? 0));
    const liveNode = state.nodes.get(state.activeNodeUuid) || {};
    const ramTotalOf = h => h.ram_total > 0 ? h.ram_total : (liveNode.ram_total || 0);
    const diskTotalOf = h => h.disk_total > 0 ? h.disk_total : (liveNode.disk_total || 0);
    const ramData = history.map(h => toPoint(h, ramTotalOf(h) > 0 ? (h.ram / ramTotalOf(h) * 100) : 0));
    const diskData = history.map(h => toPoint(h, diskTotalOf(h) > 0 ? (h.disk / diskTotalOf(h) * 100) : 0));
    const connData = history.map(h => toPoint(h, h.connections ?? 0));
    const procData = history.map(h => toPoint(h, h.process ?? 0));
    const percentFormatter = value => `${Number(value).toFixed(0)}%`;
    const integerFormatter = value => Number(value).toFixed(0);
    mountChart('cpu', '#chart-cpu', createChartOption([createSeries('CPU', cssVar('--chart-cpu', '#E0C900'), cpuData)], state.modalLoadTimeScale, percentFormatter, 100, false, 5));
    mountChart('ram', '#chart-ram', createChartOption([createSeries('RAM', cssVar('--chart-ram', '#9B5DE5'), ramData)], state.modalLoadTimeScale, percentFormatter, 100, false, 5));
    mountChart('disk', '#chart-disk', createChartOption([createSeries('Disk', cssVar('--chart-disk', '#00A854'), diskData)], state.modalLoadTimeScale, percentFormatter, 100, false, 5));
    mountChart('net', '#chart-net', createChartOption([
      createSeries('Down', cssVar('--chart-down', '#0066FF'), netDownData),
      createSeries('Up', cssVar('--chart-up', '#00A854'), netUpData)
    ], state.modalLoadTimeScale, formatBytes, null, true));
    mountChart('conn', '#chart-conn', createChartOption([createSeries('Connections', cssVar('--chart-conn', '#FF3333'), connData)], state.modalLoadTimeScale, integerFormatter));
    mountChart('proc', '#chart-proc', createChartOption([createSeries('Processes', cssVar('--chart-proc', '#0066FF'), procData)], state.modalLoadTimeScale, integerFormatter));


  }

  function computeTaskStats(pingRecords, pingTasks) {
    const nameById = {};
    (pingTasks || []).forEach(task => { nameById[task.id] = task.name; });

    const grouped = new Map();
    (pingRecords || []).forEach(record => {
      const taskId = record.task_id ?? 'Default';
      const timestamp = parseRecordTime(record.time ?? record.updated_at);
      if (timestamp == null) return;
      if (!grouped.has(taskId)) grouped.set(taskId, []);
      grouped.get(taskId).push({ timestamp, value: record.value });
    });

    const order = [];
    (pingTasks || []).forEach(task => { if (grouped.has(task.id) && !order.includes(task.id)) order.push(task.id); });
    grouped.forEach((_, id) => { if (!order.includes(id)) order.push(id); });

    return order.map(taskId => {
      const recs = grouped.get(taskId).slice().sort((a, b) => a.timestamp - b.timestamp);
      const total = recs.length;
      const lossCount = recs.filter(r => typeof r.value === 'number' && r.value < 0).length;
      const loss = total > 0 ? (lossCount / total) * 100 : 0;
      // Last successful probe; a lost final sample should not blank the headline number.
      const latestValid = recs.slice().reverse().find(r => typeof r.value === 'number' && r.value >= 0);
      const latest = latestValid ? latestValid.value : null;

      const validValues = recs
        .map(r => r.value)
        .filter(v => typeof v === 'number' && v >= 0);

      const stats = validValues.length ? {
        min: Math.min(...validValues),
        max: Math.max(...validValues),
        avg: validValues.reduce((sum, v) => sum + v, 0) / validValues.length,
        p50: percentile(validValues, 50),
        p99: percentile(validValues, 99),
      } : { min: null, max: null, avg: null, p50: null, p99: null };

      return {
        id: taskId,
        name: nameById[taskId] || (taskId === 'Default' ? 'Ping' : `Task ${taskId}`),
        latest,
        loss,
        ...stats,
        total
      };
    });
  }

  function percentile(values, p) {
    if (!values.length) return null;
    const sorted = values.slice().sort((a, b) => a - b);
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)));
    return sorted[idx];
  }

  function renderLatencyTasks(stats, colorByTaskId) {
    const container = document.getElementById('modal-latency-tasks');
    if (!container) return;
    if (!stats.length) { container.innerHTML = ''; return; }

    container.innerHTML = stats.map((task, index) => {
      const color = colorByTaskId.get(String(task.id)) || pingColor(index);
      const lossText = `${task.loss.toFixed(1)}% LOSS`;
      const lossClass = task.loss > 0 ? 'has-loss' : '';
      const latestText = formatPing(task.latest);
      const detailRows = [];
      if (task.min != null) detailRows.push(['MIN', `${task.min.toFixed(0)} ms`]);
      if (task.avg != null) detailRows.push(['AVG', `${task.avg.toFixed(0)} ms`]);
      if (task.max != null) detailRows.push(['MAX', `${task.max.toFixed(0)} ms`]);
      if (task.p50 != null) detailRows.push(['P50', `${task.p50.toFixed(0)} ms`]);
      if (task.p99 != null) detailRows.push(['P99', `${task.p99.toFixed(0)} ms`]);
      const detailHtml = detailRows.length
        ? `<div class="latency-task-detail-wrap"><div class="latency-task-detail">${detailRows.map(([k, v]) =>
            `<div class="info-item"><span class="info-label">${k}</span><span class="info-value">${escapeHtml(v)}</span></div>`
          ).join('')}</div></div>`
        : '';

      return `
        <div class="latency-task-card" data-series-index="${index}" style="--task-color: ${color};">
          <div class="latency-task-row">
            <div class="latency-task-strip"></div>
            <div class="latency-task-body">
              <div class="latency-task-header">
                <span class="latency-task-name" title="${escapeHtml(task.name)}">${escapeHtml(task.name)}</span>
              </div>
              <div class="latency-task-stats">
                <span class="latency-task-latest">${escapeHtml(latestText)}</span>
                <span class="latency-task-sep">·</span>
                <span class="latency-task-loss ${lossClass}">${escapeHtml(lossText)}</span>
              </div>
            </div>
          </div>
          ${detailHtml}
        </div>
      `;
    }).join('');
  }

  function bindLatencyTaskInteractions(chart) {
    const container = document.getElementById('modal-latency-tasks');
    if (!container || !chart) return;
    const cards = Array.from(container.querySelectorAll('.latency-task-card'));
    const usesHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    let activeIndex = null;

    const setActive = index => {
      activeIndex = index;
      container.classList.toggle('has-active', index != null);
      cards.forEach(card => {
        card.classList.toggle('is-active', Number(card.dataset.seriesIndex) === index);
      });
      chart.dispatchAction({ type: 'downplay', seriesIndex: 'all' });
      if (index != null) chart.dispatchAction({ type: 'highlight', seriesIndex: index });
    };

    cards.forEach(card => {
      const index = Number(card.dataset.seriesIndex);
      if (usesHover) {
        card.addEventListener('mouseenter', () => setActive(index));
        card.addEventListener('mouseleave', () => setActive(null));
      } else {
        card.addEventListener('click', () => setActive(activeIndex === index ? null : index));
      }
    });

    chart.on('mouseover', params => {
      if (params.componentType === 'series') setActive(params.seriesIndex);
    });
    chart.on('globalout', () => {
      if (usesHover) setActive(null);
    });
  }

  function renderLatencyChart(pingRecords, pingTasks) {
    disposeChart('ping');
    if (typeof echarts === 'undefined') return;

    const stats = computeTaskStats(pingRecords, pingTasks);
    const colorByTaskId = new Map(stats.map((task, index) => [
      String(task.id),
      pingColor(index)
    ]));
    renderLatencyTasks(stats, colorByTaskId);

    const nameById = {};
    (pingTasks || []).forEach(task => { nameById[task.id] = task.name; });
    const pingGroups = {};
    (pingRecords || []).forEach(record => {
      const taskId = record.task_id || 'Default';
      const timestamp = parseRecordTime(record.time ?? record.updated_at);
      if (timestamp == null) return;
      if (!pingGroups[taskId]) {
        pingGroups[taskId] = {
          name: nameById[record.task_id] || (taskId === 'Default' ? 'Ping' : `Task ${taskId}`),
          data: []
        };
      }
      const value = (record.value == null || record.value < 0) ? null : record.value;
      pingGroups[taskId].data.push([timestamp, value]);
    });

    const orderedTaskIds = stats
      .map(task => String(task.id))
      .filter(taskId => pingGroups[taskId]);
    Object.keys(pingGroups).forEach(taskId => {
      if (!orderedTaskIds.includes(taskId)) orderedTaskIds.push(taskId);
    });
    const lineSeries = orderedTaskIds.map((taskId, index) => createSeries(
      pingGroups[taskId].name,
      colorByTaskId.get(taskId) || pingColor(index),
      pingGroups[taskId].data.sort((a, b) => a[0] - b[0]),
      0.08,
      true
    ));
    // Lost probes: short ticks on the x axis in the task colour (index stays aligned with the task cards).
    const lossSeries = orderedTaskIds.map((taskId, index) => ({
      name: `${pingGroups[taskId].name} loss`,
      type: 'scatter',
      silent: true,
      symbol: 'rect',
      symbolSize: [2, 9],
      symbolOffset: [0, -4],
      itemStyle: { color: lineSeries[index].itemStyle.color },
      tooltip: { show: false },
      data: pingGroups[taskId].data.filter(point => point[1] == null).map(point => [point[0], 0])
    })).filter(series => series.data.length);
    const pingSeries = lineSeries.concat(lossSeries);
    if (pingSeries.length) {
      mountChart('ping', '#chart-ping', createChartOption(pingSeries, state.modalTimeScale, value => `${Number(value).toFixed(1)} ms`, null, false));
      bindLatencyTaskInteractions(state.charts.ping);
    }
  }

  function updateModalLiveInfo() {
    if (!state.activeNodeUuid) return;
    const node = state.nodes.get(state.activeNodeUuid);
    if (!node) return;

    const uptimeEl = document.getElementById('modal-uptime');
    if (uptimeEl) {
      const isOnline = node.online !== false && node.name !== undefined;
      uptimeEl.textContent = isOnline ? formatUptime(node.uptime) : '-';
    }

    const lastReportEl = document.getElementById('modal-last-report');
    if (lastReportEl) {
      lastReportEl.textContent = node.last_report ? new Date(node.last_report).toLocaleString() : '-';
    }

    // Animate value changes in Load Overview cards.
    const cpuVal = document.getElementById('modal-cpu-val');
    if (cpuVal) scrambleTextIfChanged(cpuVal, (node.cpu || 0).toFixed(1) + '%');
    const ramVal = document.getElementById('modal-ram-val');
    if (ramVal) scrambleTextIfChanged(ramVal, (node.ram_total > 0 ? (node.ram / node.ram_total * 100) : 0).toFixed(1) + '%');
    const diskVal = document.getElementById('modal-disk-val');
    if (diskVal) scrambleTextIfChanged(diskVal, (node.disk_total > 0 ? (node.disk / node.disk_total * 100) : 0).toFixed(1) + '%');
    const netUpVal = document.getElementById('modal-net-up-val');
    if (netUpVal) scrambleTextIfChanged(netUpVal, formatNetworkSpeed(node.net_out || 0));
    const netDownVal = document.getElementById('modal-net-down-val');
    if (netDownVal) scrambleTextIfChanged(netDownVal, formatNetworkSpeed(node.net_in || 0));
    const connVal = document.getElementById('modal-conn-val');
    if (connVal) scrambleTextIfChanged(connVal, String(node.connections || 0));
    const procVal = document.getElementById('modal-proc-val');
    if (procVal) scrambleTextIfChanged(procVal, String(node.process || 0));
  }

  function startPolling() {
    if (state.pollTimer) {
      clearInterval(state.pollTimer);
    }
    state.pollTimer = setInterval(fetchNodesAndStatus, state.pollInterval);
  }

  function stopPolling() {
    if (state.pollTimer) {
      clearInterval(state.pollTimer);
      state.pollTimer = null;
    }
  }

  function init() {
    bindThemeMenu();
    document.querySelectorAll('.btn-view[data-view]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === state.viewMode);
      btn.addEventListener('click', () => setViewMode(btn.dataset.view));
    });

    elements.adminButton.addEventListener('click', event => {
      if (state.isLoggedIn) return;
      event.preventDefault();
      openAuthModal(false);
    });
    elements.authClose.addEventListener('click', closeAuthModal);
    elements.authModal.addEventListener('click', event => {
      if (event.target === elements.authModal) closeAuthModal();
    });
    elements.authForm.addEventListener('submit', submitLogin);
    elements.authBack.addEventListener('click', () => setAuthStep(false));

    elements.modalClose.addEventListener('click', closeNodeModal);
    elements.modal.addEventListener('click', (e) => {
      if (e.target === elements.modal) closeNodeModal();
    });

    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      if (elements.authModal.classList.contains('active')) {
        event.preventDefault();
        closeAuthModal();
      } else if (elements.modal.classList.contains('active')) {
        event.preventDefault();
        closeNodeModal();
      }
    });

    window.addEventListener('resize', () => {
      Object.values(state.charts).forEach(chart => {
        if (chart && typeof chart.resize === 'function' && !chart.isDisposed()) chart.resize();
      });
    });

    // Header scroll hide/show - shows on any upscroll
    const header = document.querySelector('.header');
    if (header) {
      let lastScrollY = 0;

      function handleScroll() {
        const currentScrollY = window.scrollY;

        if (currentScrollY < lastScrollY) {
          // Scrolling up - show header
          header.style.transform = 'translateY(0)';
        } else if (currentScrollY > 100) {
          // Scrolling down past threshold - hide header
          header.style.transform = 'translateY(-100%)';
        }

        lastScrollY = currentScrollY;
      }

      window.addEventListener('scroll', handleScroll, { passive: true });

      // Keep main content clear of the fixed header whenever its height changes (map on/off, resize, wrap).
      const mainEl = document.querySelector('.main');
      if (mainEl) {
        const syncPadding = () => { mainEl.style.paddingTop = (header.offsetHeight + 24) + 'px'; };
        syncPadding();
        if ('ResizeObserver' in window) new ResizeObserver(syncPadding).observe(header);
      }
    }

    fetchPublicSettings().then(async () => {
      await fetchAuthState();
      if (state.publicSettings?.private_site && !state.isLoggedIn) {
        stopPolling();
        openAuthModal(true);
        return;
      }
      await fetchNodesAndStatus();
      startPolling();
      startCarrierPolling();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
