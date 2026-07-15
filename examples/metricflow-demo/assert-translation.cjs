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
    total_revenue: { type: 'sum', sql: '${TABLE}.amount' },
    order_count: { type: 'count', sql: '${TABLE}.order_id' },
    unique_customers: { type: 'count_distinct', sql: '${TABLE}.customer_id' },
    average_order_value: { type: 'average', sql: '${TABLE}.amount' },
    median_order_value: { type: 'median', sql: '${TABLE}.amount' },
    max_order_value: { type: 'max', sql: '${TABLE}.amount' },
    min_order_value: { type: 'min', sql: '${TABLE}.amount' },
    p95_order_value: { type: 'percentile', sql: '${TABLE}.amount', percentile: 95 },
};

// Metrics that must be skipped (unsupported in the Lightdash translation).
const expectedSkipped = [
    'completed_revenue', // metric-level filter
    'revenue_per_order', // ratio
    'revenue_per_customer', // derived
    'cumulative_revenue', // cumulative
    'food_order_count', // sum_boolean aggregation
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
    } else {
        ok(`${name} → ${exp.type}(${exp.sql})${exp.percentile ? ` p${exp.percentile}` : ''}`);
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

const expectedCount = Object.keys(expected).length;
if (result.translatedCount !== expectedCount) {
    fail(`translatedCount ${result.translatedCount} !== ${expectedCount}`);
}

console.log(
    `\n${manifestPath}: translated=${result.translatedCount} skipped=${result.skippedCount} failures=${failures}`,
);
process.exit(failures === 0 ? 0 : 1);
