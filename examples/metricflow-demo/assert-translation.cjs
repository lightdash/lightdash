#!/usr/bin/env node
/**
 * Reproducible test: read MetricFlow definitions from a compiled dbt manifest
 * and assert they translate into the expected Lightdash metrics.
 *
 * Usage: node assert-translation.cjs <path/to/manifest.json>
 *
 * Uses the repo build of @lightdash/common (run `pnpm -F @lightdash/common build` first).
 */
const path = require('path');
const fs = require('fs');

const common = require(path.join(
    __dirname,
    '../../packages/common/dist/cjs/index.js',
));
const { translateMetricFlowMetrics } = common;

const manifestPath = process.argv[2];
if (!manifestPath) {
    console.error('Usage: node assert-translation.cjs <manifest.json>');
    process.exit(2);
}
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

const modelNamesByUniqueId = Object.fromEntries(
    Object.values(manifest.nodes)
        .filter((n) => n.resource_type === 'model')
        .map((n) => [n.unique_id, n.name]),
);

const result = translateMetricFlowMetrics({
    semanticModels: manifest.semantic_models ?? {},
    metrics: manifest.metrics ?? {},
    modelNamesByUniqueId,
});

// Expected Lightdash metrics on the `orders` model (same for both specs).
const expected = {
    // group_label carried over from config.meta
    total_revenue: { type: 'sum', sql: '${TABLE}.amount', group_label: 'Order Metrics' },
    order_count: { type: 'count', sql: '${TABLE}.order_id' },
    unique_customers: { type: 'count_distinct', sql: '${TABLE}.customer_id' },
    average_order_value: { type: 'average', sql: '${TABLE}.amount' },
    median_order_value: { type: 'median', sql: '${TABLE}.amount' },
    max_order_value: { type: 'max', sql: '${TABLE}.amount' },
    min_order_value: { type: 'min', sql: '${TABLE}.amount' },
    p95_order_value: { type: 'percentile', sql: '${TABLE}.amount', percentile: 95 },
    // Filtered simple metric → CASE WHEN over the measure
    completed_revenue: {
        type: 'sum',
        sql: "CASE WHEN (${TABLE}.status = 'completed') THEN (${TABLE}.amount) END",
    },
    // sum_boolean → sum over CASE WHEN bool THEN 1 ELSE 0
    food_order_count: {
        type: 'sum',
        sql: 'CASE WHEN (${TABLE}.is_food_order) THEN 1 ELSE 0 END',
    },
    // create_metric measure (legacy) / simple metric (latest) whose
    // config.meta hides it and groups it — hidden + group_label carry over.
    internal_order_count: {
        type: 'count_distinct',
        sql: '${TABLE}.customer_id',
        hidden: true,
        group_label: 'Internal',
    },
    // Ratio → number metric over the two input metrics
    revenue_per_order: {
        type: 'number',
        sql: '(${total_revenue} * 1.0) / NULLIF(${order_count}, 0)',
    },
    // Ratio with a filtered numerator → hidden helper metric + number metric
    completion_rate: {
        type: 'number',
        sql: '(${completion_rate_numerator} * 1.0) / NULLIF(${order_count}, 0)',
    },
    completion_rate_numerator: {
        type: 'count',
        sql: "CASE WHEN (${TABLE}.status = 'completed') THEN (${TABLE}.order_id) END",
        hidden: true,
        helper: true,
    },
    // Derived → number metric with the expression rewritten over input metrics
    revenue_per_customer: {
        type: 'number',
        sql: '${total_revenue} / ${unique_customers}',
    },
};

// Hidden helper metrics are emitted alongside a manifest metric and are not
// counted in translatedCount (unlike a plain hidden metric, which is).
const helperCount = Object.values(expected).filter((e) => e.helper).length;

// Metrics that must be skipped (unsupported in the Lightdash translation).
const expectedSkipped = [
    'cumulative_revenue', // cumulative — needs time-spine semantics
];

let failures = 0;
const fail = (msg) => {
    failures += 1;
    console.error(`  ✗ ${msg}`);
};
const ok = (msg) => console.log(`  ✓ ${msg}`);

const translated = result.metricsByModel.orders ?? {};

for (const [name, exp] of Object.entries(expected)) {
    const got = translated[name];
    if (!got) {
        fail(`expected metric "${name}" was not translated`);
        continue;
    }
    if (got.type !== exp.type) {
        fail(`metric "${name}": type ${got.type} !== ${exp.type}`);
    } else if (got.sql !== exp.sql) {
        fail(`metric "${name}": sql ${got.sql} !== ${exp.sql}`);
    } else if (exp.percentile !== undefined && got.percentile !== exp.percentile) {
        fail(`metric "${name}": percentile ${got.percentile} !== ${exp.percentile}`);
    } else if (exp.hidden !== undefined && got.hidden !== exp.hidden) {
        fail(`metric "${name}": hidden ${got.hidden} !== ${exp.hidden}`);
    } else if (exp.group_label !== undefined && got.group_label !== exp.group_label) {
        fail(`metric "${name}": group_label ${got.group_label} !== ${exp.group_label}`);
    } else {
        ok(`${name} → ${exp.type}(${exp.sql})${exp.percentile ? ` p${exp.percentile}` : ''}${exp.hidden ? ' [hidden]' : ''}${exp.group_label ? ` {${exp.group_label}}` : ''}`);
    }
}

for (const name of expectedSkipped) {
    if (translated[name]) {
        fail(`metric "${name}" should have been skipped but was translated`);
    } else if (!result.warnings.some((w) => w.includes(`"${name}"`))) {
        fail(`metric "${name}" skipped without a warning`);
    } else {
        ok(`${name} skipped with warning`);
    }
}

const expectedCount = Object.keys(expected).length - helperCount;
if (result.translatedCount !== expectedCount) {
    fail(`translatedCount ${result.translatedCount} !== ${expectedCount}`);
}

console.log(
    `\n${manifestPath}: translated=${result.translatedCount} skipped=${result.skippedCount} failures=${failures}`,
);
process.exit(failures === 0 ? 0 : 1);
