// Unified Debug Logging Utility
// Works in both main thread and Web Worker contexts
// Usage: const log = _debug.create('ModuleName');
//        log.info('message', ...args);

(function() {
    'use strict';

    const _global = typeof window !== 'undefined' ? window : self;
    const isWorker = typeof window === 'undefined';

    // ===== LEVEL DEFINITIONS =====

    const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

    // ===== MODULE COLOR MAP =====

    const MODULE_COLORS = {
        DeckFinder:   { bg: '#2563eb', fg: '#fff' },
        DeckBuilder:  { bg: '#059669', fg: '#fff' },
        Worker:       { bg: '#d97706', fg: '#fff' },
        DeckFinderUI: { bg: '#7c3aed', fg: '#fff' },
        DeckBuilderUI:{ bg: '#0891b2', fg: '#fff' },
        DataUtils:    { bg: '#dc2626', fg: '#fff' }
    };

    const LEVEL_STYLES = {
        debug: { color: '#6b7280' },
        info:  { color: '#2563eb' },
        warn:  { color: '#d97706' },
        error: { color: '#dc2626' }
    };

    // Hash-based fallback color for unknown modules
    function hashColor(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
        const hue = Math.abs(hash) % 360;
        return { bg: `hsl(${hue}, 65%, 45%)`, fg: '#fff' };
    }

    function getModuleColor(name) {
        return MODULE_COLORS[name] || hashColor(name);
    }

    // ===== CONFIG =====

    const STORAGE_KEY = '_debug';
    let _config = {
        enabled: {},   // moduleName -> boolean
        allEnabled: false,
        level: 'warn'  // default: only warn and error
    };

    function loadConfig() {
        if (isWorker) return;
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                _config.enabled = parsed.enabled || {};
                _config.allEnabled = !!parsed.allEnabled;
                _config.level = parsed.level || 'warn';
            }
        } catch (e) { /* ignore */ }

        // URL param overrides: ?debug=Module1,Module2&debugLevel=debug
        try {
            const params = new URLSearchParams(location.search);
            const debugParam = params.get('debug');
            if (debugParam) {
                _config.allEnabled = false;
                _config.enabled = {};
                debugParam.split(',').forEach(m => {
                    _config.enabled[m.trim()] = true;
                });
            }
            const levelParam = params.get('debugLevel');
            if (levelParam && LEVELS[levelParam] !== undefined) {
                _config.level = levelParam;
            }
        } catch (e) { /* workers don't have location.search */ }
    }

    function saveConfig() {
        if (isWorker) return;
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                enabled: _config.enabled,
                allEnabled: _config.allEnabled,
                level: _config.level
            }));
        } catch (e) { /* ignore */ }
    }

    // ===== TIMESTAMP =====

    function timestamp() {
        const d = new Date();
        return d.toTimeString().split(' ')[0] + '.' + String(d.getMilliseconds()).padStart(3, '0');
    }

    // ===== LOGGER =====

    const _loggers = {};

    class Logger {
        constructor(name) {
            this.name = name;
            this._color = getModuleColor(name);
            this._timers = {};
        }

        get _enabled() {
            return _config.allEnabled || !!_config.enabled[this.name];
        }

        _shouldLog(level) {
            if (!this._enabled) return false;
            return LEVELS[level] >= LEVELS[_config.level];
        }

        _log(level, method, args) {
            if (!this._shouldLog(level)) return;

            const ts = timestamp();

            if (isWorker) {
                // Plain text fallback in workers
                console[method](`[${this.name}] [${ts}] [${level.toUpperCase()}]`, ...args);
                return;
            }

            const levelStyle = LEVEL_STYLES[level];
            console[method](
                `%c ${this.name} %c ${ts} %c`,
                `background:${this._color.bg};color:${this._color.fg};padding:1px 6px;border-radius:3px;font-weight:bold`,
                `color:${levelStyle.color};font-weight:normal`,
                'color:inherit',
                ...args
            );
        }

        debug(...args) { this._log('debug', 'log', args); }
        info(...args)  { this._log('info', 'log', args); }
        warn(...args)  { this._log('warn', 'warn', args); }
        error(...args) { this._log('error', 'error', args); }

        group(label) {
            if (!this._enabled) return;
            if (isWorker) {
                console.group(`[${this.name}] ${label}`);
            } else {
                console.group(
                    `%c ${this.name} %c ${label}`,
                    `background:${this._color.bg};color:${this._color.fg};padding:1px 6px;border-radius:3px;font-weight:bold`,
                    'color:inherit'
                );
            }
        }

        groupEnd() {
            if (!this._enabled) return;
            console.groupEnd();
        }

        time(label) {
            if (!this._enabled) return;
            this._timers[label] = performance.now();
        }

        timeEnd(label) {
            if (!this._enabled) return;
            const start = this._timers[label];
            if (start === undefined) return;
            const elapsed = (performance.now() - start).toFixed(2);
            delete this._timers[label];
            this._log('info', 'log', [`${label}: ${elapsed}ms`]);
        }
    }

    // ===== PUBLIC API =====

    const _debug = {
        create(name) {
            if (!_loggers[name]) {
                _loggers[name] = new Logger(name);
            }
            return _loggers[name];
        },

        enable(name) {
            _config.enabled[name] = true;
            saveConfig();
        },

        disable(name) {
            delete _config.enabled[name];
            saveConfig();
        },

        enableAll() {
            _config.allEnabled = true;
            saveConfig();
        },

        disableAll() {
            _config.allEnabled = false;
            _config.enabled = {};
            saveConfig();
        },

        setLevel(level) {
            if (LEVELS[level] !== undefined) {
                _config.level = level;
                saveConfig();
            }
        },

        status() {
            const modules = Object.keys(_loggers);
            const rows = modules.map(name => ({
                Module: name,
                Enabled: _config.allEnabled || !!_config.enabled[name],
                Level: _config.level
            }));
            console.table(rows);
            console.log('All enabled:', _config.allEnabled);
            console.log('Min level:', _config.level);
        },

        getConfig() {
            return {
                enabled: { ..._config.enabled },
                allEnabled: _config.allEnabled,
                level: _config.level
            };
        },

        applyConfig(cfg) {
            if (!cfg) return;
            _config.enabled = cfg.enabled || {};
            _config.allEnabled = !!cfg.allEnabled;
            _config.level = cfg.level || 'warn';
        }
    };

    // Load persisted config on init
    loadConfig();

    _global._debug = _debug;
})();
