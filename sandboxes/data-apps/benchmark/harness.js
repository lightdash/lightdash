/**
 * Browser-side mock Lightdash host for the render gate.
 *
 * Loaded into the harness page by mockHost.ts with `__BENCH_CONFIG__`
 * replaced by `{ projectUuid, explores, charts }`. Speaks the query-sdk
 * postMessage protocol (see packages/query-sdk/src/postMessageTransport.ts):
 * posts `lightdash:sdk:ready`, answers `lightdash:sdk:fetch` with the
 * UNWRAPPED `results` payload (mirroring useAppSdkBridge), and serves
 * deterministic synthesized rows so identical queries produce identical
 * data across runs and variants.
 *
 * Everything observable is exposed on `window.__bench` for the Playwright
 * driver: issued queries (with field validation against the catalog),
 * blocked fetches, and an activity timestamp used for settle detection.
 */
'use strict';

var CONFIG = __BENCH_CONFIG__;

var state = {
    queries: [],
    blocked: [],
    exports: [],
    externalFetches: [],
    fetchCount: 0,
    activityAt: Date.now(),
};
window.__bench = state;

function touch() {
    state.activityAt = Date.now();
}

// ---------------------------------------------------------------------------
// Deterministic pseudo-randomness (FNV-1a hash + mulberry32-style scramble)
// ---------------------------------------------------------------------------

function hashStr(s) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < s.length; i += 1) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

function rand01(seed) {
    var t = (seed + 0x6d2b79f5) >>> 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// ---------------------------------------------------------------------------
// Dimension domains
// ---------------------------------------------------------------------------

var MONTH_NAMES = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

// Fixed end of the synthetic timeline so screenshots are reproducible.
var END_YEAR = 2026;
var END_MONTH = 5; // June (0-indexed)
var END_DAY = 15;

function isoDate(d) {
    return d.toISOString().slice(0, 10);
}

function dateDomain(interval, isTimestamp) {
    var points = [];
    var i;
    var d;
    if (interval === 'year') {
        for (i = 4; i >= 0; i -= 1) {
            d = new Date(Date.UTC(END_YEAR - i, 0, 1));
            points.push({
                raw: isoDate(d),
                formatted: String(END_YEAR - i),
                idx: 4 - i,
            });
        }
    } else if (interval === 'quarter') {
        for (i = 7; i >= 0; i -= 1) {
            d = new Date(Date.UTC(END_YEAR, END_MONTH - i * 3, 1));
            var q = Math.floor(d.getUTCMonth() / 3) + 1;
            points.push({
                raw: isoDate(new Date(Date.UTC(d.getUTCFullYear(), (q - 1) * 3, 1))),
                formatted: 'Q' + q + ' ' + d.getUTCFullYear(),
                idx: 7 - i,
            });
        }
    } else if (interval === 'month') {
        for (i = 11; i >= 0; i -= 1) {
            d = new Date(Date.UTC(END_YEAR, END_MONTH - i, 1));
            points.push({
                raw: isoDate(d),
                formatted: MONTH_NAMES[d.getUTCMonth()] + ' ' + d.getUTCFullYear(),
                idx: 11 - i,
            });
        }
    } else if (interval === 'week') {
        for (i = 15; i >= 0; i -= 1) {
            d = new Date(Date.UTC(END_YEAR, END_MONTH, END_DAY - i * 7));
            points.push({ raw: isoDate(d), formatted: isoDate(d), idx: 15 - i });
        }
    } else {
        // day / raw
        for (i = 29; i >= 0; i -= 1) {
            d = new Date(Date.UTC(END_YEAR, END_MONTH, END_DAY - i));
            var raw = isTimestamp
                ? d.toISOString().replace(/\.\d+Z$/, 'Z')
                : isoDate(d);
            points.push({ raw: raw, formatted: isoDate(d), idx: 29 - i });
        }
    }
    return points;
}

var PERSON_NAMES = [
    'Ava Thompson', 'Liam Chen', 'Sofia Reyes', 'Noah Patel',
    'Emma Fischer', 'Lucas Moreau', 'Mia Novak', 'Oliver Haddad',
];
var GENERIC_CATEGORIES = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo'];

function stringDomain(fieldId, meta) {
    var values;
    if (meta && meta.values && meta.values.length) {
        values = meta.values;
    } else if (/name/.test(fieldId)) {
        values = PERSON_NAMES;
    } else {
        values = GENERIC_CATEGORIES;
    }
    return values.map(function mapValue(v) {
        return { raw: v, formatted: v, idx: null };
    });
}

function dimensionDomain(fieldId, meta) {
    var type = meta ? meta.type : 'string';
    if (type === 'date' || type === 'timestamp') {
        var interval = meta && meta.interval ? meta.interval : 'day';
        if (interval === 'raw') interval = 'day';
        return dateDomain(interval, type === 'timestamp');
    }
    if (type === 'number') {
        var out = [];
        for (var n = 1; n <= 12; n += 1) {
            out.push({ raw: n * 100 + (hashStr(fieldId) % 97), formatted: null, idx: null });
        }
        out.forEach(function fmt(p) {
            p.formatted = String(p.raw);
        });
        return out;
    }
    if (type === 'boolean') {
        return [
            { raw: true, formatted: 'True', idx: null },
            { raw: false, formatted: 'False', idx: null },
        ];
    }
    return stringDomain(fieldId, meta);
}

// ---------------------------------------------------------------------------
// Metric synthesis
// ---------------------------------------------------------------------------

function metricSpec(meta) {
    var format = meta ? meta.format : null;
    var metricType = meta ? meta.metricType : null;
    if (format === 'percent') return { lo: 0.42, hi: 0.97, kind: 'percent' };
    if (format === 'usd') {
        if (metricType === 'average') return { lo: 60, hi: 480, kind: 'usd' };
        return { lo: 24000, hi: 180000, kind: 'usd' };
    }
    if (metricType === 'count' || metricType === 'count_distinct') {
        return { lo: 80, hi: 2600, kind: 'int' };
    }
    return { lo: 100, hi: 5000, kind: 'num' };
}

function metricValue(fieldId, comboKey, dateIdx, dateMax, spec) {
    var r = rand01(hashStr(fieldId + '|' + comboKey));
    var x;
    if (dateIdx !== null && dateMax > 0) {
        // Gentle upward trend plus seasonal wobble so time series look real.
        var t = dateIdx / dateMax;
        x = 0.25 + 0.35 * r + 0.3 * t + 0.1 * Math.sin(dateIdx * 2.1 + r * 6);
    } else {
        x = 0.3 + 0.5 * r;
    }
    x = Math.min(1, Math.max(0.02, x));
    var v = spec.lo + (spec.hi - spec.lo) * x;

    if (spec.kind === 'percent') {
        var pct = Math.round(v * 1000) / 1000;
        return { raw: pct, formatted: Math.round(pct * 100) + '%' };
    }
    if (spec.kind === 'usd') {
        var usd = Math.round(v);
        return { raw: usd, formatted: '$' + usd.toLocaleString('en-US') };
    }
    if (spec.kind === 'int') {
        var count = Math.round(v);
        return { raw: count, formatted: count.toLocaleString('en-US') };
    }
    var num = Math.round(v * 100) / 100;
    return { raw: num, formatted: num.toLocaleString('en-US') };
}

// ---------------------------------------------------------------------------
// Query synthesis + validation
// ---------------------------------------------------------------------------

function declaredFieldIds(query) {
    var out = {};
    (query.tableCalculations || []).forEach(function eachTc(tc) {
        if (tc && tc.name) out[tc.name] = true;
    });
    (query.additionalMetrics || []).forEach(function eachAm(am) {
        if (!am) return;
        if (am.name && am.table) out[am.table + '_' + am.name] = true;
        if (am.name) out[am.name] = true;
        if (am.uuid) out[am.uuid] = true;
    });
    (query.customDimensions || []).forEach(function eachCd(cd) {
        if (!cd) return;
        if (cd.id) out[cd.id] = true;
        if (cd.name) out[cd.name] = true;
    });
    return out;
}

function synthesizeRows(exploreName, dimensions, metrics, limit, sorts) {
    var explore = CONFIG.explores[exploreName] || null;
    var fields = explore ? explore.fields : {};
    var cap = Math.min(Math.max(1, limit || 500), 500);

    var domains = dimensions.map(function eachDim(d) {
        return dimensionDomain(d, fields[d]);
    });

    var combos = [[]];
    for (var i = 0; i < domains.length; i += 1) {
        var next = [];
        for (var c = 0; c < combos.length && next.length <= 5000; c += 1) {
            for (var p = 0; p < domains[i].length; p += 1) {
                next.push(combos[c].concat([domains[i][p]]));
            }
        }
        combos = next;
    }
    combos = combos.slice(0, cap);

    var rows = combos.map(function eachCombo(combo) {
        var row = {};
        var comboKey = combo
            .map(function key(point) {
                return String(point.raw);
            })
            .join('~');
        var dateIdx = null;
        var dateMax = 0;
        combo.forEach(function eachPoint(point, idx) {
            if (point.idx !== null && dateIdx === null) {
                dateIdx = point.idx;
                dateMax = domains[idx].length - 1;
            }
            row[dimensions[idx]] = {
                value: { raw: point.raw, formatted: point.formatted },
            };
        });
        metrics.forEach(function eachMetric(m) {
            row[m] = {
                value: metricValue(m, comboKey, dateIdx, dateMax, metricSpec(fields[m])),
            };
        });
        return row;
    });

    (sorts || [])
        .slice()
        .reverse()
        .forEach(function eachSort(s) {
            if (!s || !s.fieldId) return;
            rows.sort(function cmp(a, b) {
                var av = a[s.fieldId] ? a[s.fieldId].value.raw : null;
                var bv = b[s.fieldId] ? b[s.fieldId].value.raw : null;
                var base = av === bv ? 0 : av === null ? -1 : bv === null ? 1 : av < bv ? -1 : 1;
                return s.descending ? -base : base;
            });
        });

    var allIds = dimensions.concat(metrics);
    var columns = {};
    var fieldsMeta = {};
    allIds.forEach(function eachId(id) {
        var meta = fields[id];
        var isMetric = meta ? meta.kind === 'metric' : metrics.indexOf(id) !== -1;
        var type = meta ? meta.type : isMetric ? 'number' : 'string';
        columns[id] = { reference: id, type: type };
        fieldsMeta[id] = {
            fieldType: isMetric ? 'metric' : 'dimension',
            type: type,
            label: meta && meta.label ? meta.label : id,
        };
    });

    return { rows: rows, columns: columns, fieldsMeta: fieldsMeta };
}

var queryCounter = 0;
var queryStore = {};

function startQuery(record, exploreName, dimensions, metrics, limit, sorts) {
    var explore = CONFIG.explores[exploreName];
    var declared = record.declared || {};
    delete record.declared;
    var requested = dimensions.concat(metrics);
    record.exploreName = exploreName || null;
    record.dimensions = dimensions;
    record.metrics = metrics;
    record.limit = limit || null;
    record.unknownExplore = !explore;
    record.invalidFields = !explore
        ? []
        : requested.filter(function unknownField(id) {
              return !explore.fields[id] && !declared[id];
          });

    var synth = synthesizeRows(exploreName, dimensions, metrics, limit, sorts);
    queryCounter += 1;
    var queryUuid = 'bench-query-' + queryCounter;
    queryStore[queryUuid] = synth;
    record.rowCount = synth.rows.length;
    state.queries.push(record);

    return {
        queryUuid: queryUuid,
        metricQuery: {
            exploreName: exploreName,
            dimensions: dimensions,
            metrics: metrics,
            limit: limit,
        },
        fields: synth.fieldsMeta,
    };
}

function inferExploreForField(fieldId) {
    var best = null;
    Object.keys(CONFIG.explores).forEach(function eachExplore(name) {
        if (fieldId && fieldId.indexOf(name + '_') === 0) {
            if (!best || name.length > best.length) best = name;
        }
    });
    return best || Object.keys(CONFIG.explores)[0] || null;
}

function pollResult(queryUuid, page, pageSize) {
    var synth = queryStore[queryUuid];
    if (!synth) return { error: 'Unknown query ' + queryUuid };
    var size = pageSize || 500;
    var current = page || 1;
    var start = (current - 1) * size;
    var slice = synth.rows.slice(start, start + size);
    var hasMore = start + size < synth.rows.length;
    return {
        result: {
            status: 'ready',
            queryUuid: queryUuid,
            columns: synth.columns,
            rows: slice,
            totalResults: synth.rows.length,
            ...(hasMore ? { nextPage: current + 1 } : {}),
        },
    };
}

// ---------------------------------------------------------------------------
// Route handling — mirrors the prod bridge allowlist
// ---------------------------------------------------------------------------

var QUERY_POST = /^\/api\/v2\/projects\/[^/]+\/query\/metric-query$/;
var UNDERLYING_POST = /^\/api\/v2\/projects\/[^/]+\/query\/underlying-data$/;
var CHART_POST = /^\/api\/v2\/projects\/[^/]+\/query\/chart$/;
var DOWNLOAD_POST = /^\/api\/v2\/projects\/[^/]+\/query\/([^/?]+)\/schedule-download$/;
var QUERY_GET = /^\/api\/v2\/projects\/[^/]+\/query\/([^/?]+)(\?.*)?$/;
var JOB_GET = /^\/api\/v1\/schedulers\/job\/[^/]+\/status$/;

function handleSdkFetch(method, path, body) {
    var upper = (method || '').toUpperCase();

    if (upper === 'POST' && QUERY_POST.test(path)) {
        var q = (body && body.query) || {};
        return {
            result: startQuery(
                { kind: 'metric', declared: declaredFieldIds(q) },
                q.exploreName,
                q.dimensions || [],
                q.metrics || [],
                q.limit,
                q.sorts || [],
            ),
        };
    }

    if (upper === 'POST' && UNDERLYING_POST.test(path)) {
        var metricId = (body && body.underlyingDataItemId) || '';
        var exploreName = inferExploreForField(metricId);
        var explore = exploreName ? CONFIG.explores[exploreName] : null;
        var dims = [];
        if (explore) {
            Object.keys(explore.fields).forEach(function eachField(id) {
                var meta = explore.fields[id];
                if (meta.kind === 'dimension' && meta.interval === null && dims.length < 6) {
                    dims.push(id);
                }
            });
        }
        var underlyingMetrics = explore && explore.fields[metricId] ? [metricId] : [];
        return {
            result: startQuery(
                { kind: 'underlying', declared: {} },
                exploreName,
                dims,
                underlyingMetrics,
                (body && body.limit) || 10,
                [],
            ),
        };
    }

    if (upper === 'POST' && CHART_POST.test(path)) {
        var chartUuid = body && body.chartUuid;
        var chart = chartUuid ? CONFIG.charts[chartUuid] : null;
        if (!chart) {
            state.queries.push({
                kind: 'chart',
                exploreName: null,
                dimensions: [],
                metrics: [],
                limit: null,
                unknownExplore: false,
                unknownChart: true,
                invalidFields: [],
                rowCount: 0,
            });
            return { error: 'Chart not found: ' + chartUuid };
        }
        var mq = chart.metricQuery || {};
        var response = startQuery(
            { kind: 'chart', declared: {} },
            chart.exploreName,
            mq.dimensions || [],
            mq.metrics || [],
            (body && body.limit) || mq.limit,
            mq.sorts || [],
        );
        response.metricQuery = mq;
        return { result: response };
    }

    if (upper === 'POST' && DOWNLOAD_POST.test(path)) {
        return { result: { jobId: 'bench-job-1' } };
    }

    if (upper === 'GET' && JOB_GET.test(path)) {
        return {
            result: {
                status: 'completed',
                details: {
                    fileUrl: 'data:text/csv;charset=utf-8,benchmark%0Amock',
                    truncated: false,
                },
            },
        };
    }

    if (upper === 'GET' && QUERY_GET.test(path)) {
        var match = path.match(QUERY_GET);
        var params = new URLSearchParams(match[2] ? match[2].slice(1) : '');
        return pollResult(
            match[1],
            Number(params.get('page') || '1'),
            Number(params.get('pageSize') || '500'),
        );
    }

    if (upper === 'GET' && path === '/api/v1/user') {
        return {
            result: {
                userUuid: 'bench-user-uuid',
                firstName: 'Benchmark',
                lastName: 'User',
                email: 'bench@lightdash.com',
                role: 'editor',
                organizationUuid: 'bench-org-uuid',
            },
        };
    }

    state.blocked.push(upper + ' ' + path);
    return { error: 'Blocked: ' + method + ' ' + path };
}

// ---------------------------------------------------------------------------
// postMessage wiring
// ---------------------------------------------------------------------------

var iframe = document.getElementById('app-frame');

function postToApp(message) {
    if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage(message, '*');
    }
}

window.addEventListener('message', function onMessage(event) {
    if (!iframe || !iframe.contentWindow || event.source !== iframe.contentWindow) {
        return;
    }
    var data = event.data;
    if (!data || typeof data !== 'object' || typeof data.type !== 'string') {
        return;
    }
    touch();

    if (data.type === 'lightdash:sdk:fetch') {
        state.fetchCount += 1;
        var response;
        try {
            response = handleSdkFetch(data.method, data.path, data.body);
        } catch (err) {
            response = { error: String((err && err.message) || err) };
        }
        Promise.resolve().then(function respond() {
            touch();
            postToApp(
                Object.assign(
                    { type: 'lightdash:sdk:fetch-response', id: data.id },
                    response,
                ),
            );
        });
    } else if (data.type === 'lightdash:sdk:gsheet-export-request') {
        state.exports.push({
            title: data.title || null,
            rows: (data.rows || []).length,
            columns: (data.columns || []).length,
        });
        postToApp({
            type: 'lightdash:sdk:gsheet-export-response',
            id: data.id,
            fileUrl: 'https://docs.google.com/spreadsheets/d/benchmark-mock',
        });
    } else if (data.type === 'lightdash:sdk:external-fetch') {
        state.externalFetches.push({ alias: data.alias || null, path: data.path || null });
        postToApp({
            type: 'lightdash:sdk:external-fetch-response',
            id: data.id,
            result: {
                status: 200,
                contentType: 'application/json',
                body: {},
                truncated: false,
            },
        });
    }
    // Inspector / screenshot / url-state announces are ignored on purpose.
});

// Pump readiness for a while — the SDK latches the first one and ignores the
// rest, and pumping dodges the load-order race without an onload dependency.
var readyPumps = 0;
var readyTimer = setInterval(function pumpReady() {
    readyPumps += 1;
    if (readyPumps > 40) {
        clearInterval(readyTimer);
        return;
    }
    postToApp({ type: 'lightdash:sdk:ready' });
}, 250);
