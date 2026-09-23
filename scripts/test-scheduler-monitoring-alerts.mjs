#!/usr/bin/env node
// Test the documented queries with Prometheus's engine and simulated time.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const documentation = readFileSync(
    new URL('../packages/backend/src/scheduler/MONITORING.md', import.meta.url),
    'utf8',
);
const queries = [...documentation.matchAll(/```promql\n([\s\S]*?)```/g)].map(
    (match) => match[1].trim(),
);
if (queries.length !== 2) {
    throw new Error('Expected the two proposed alert queries in MONITORING.md');
}

const heartbeat = 'DailyGenerationOverdue';
const errors = 'DailyGenerationErrors';
const prefix = 'lightdash_scheduler_daily_job_generation_';
const labels =
    'project_id="PROJECT",location="LOCATION",cluster="CLUSTER",namespace="NAMESPACE"';
const series = (metric, values, extra = '', scope = labels) => ({
    series: `${prefix}${metric}{${scope}${extra ? `,${extra}` : ''}}`,
    values,
});
const completed = (values, extra = '', scope) =>
    series('last_completed_timestamp_seconds', values, extra, scope);
const failed = (values, extra = '', scope) =>
    series(
        'errors_total',
        values,
        `phase="scheduler"${extra ? `,${extra}` : ''}`,
        scope,
    );
const check = (alertname, eval_time, firing = false) => ({
    alertname,
    eval_time,
    exp_alerts: firing ? [{ exp_labels: {}, exp_annotations: {} }] : [],
});
const otherScope = labels.replace('namespace="NAMESPACE"', 'namespace="OTHER"');
const tests = [
    {
        name: 'daily completions stay healthy beyond 24 hours',
        input_series: [completed('60+0x1440 86460+0x180')],
        alert_rule_test: [check(heartbeat, '25h'), check(heartbeat, '26h')],
    },
    {
        name: 'fires only after the 25-hour age threshold',
        input_series: [completed('3600+0x1600')],
        alert_rule_test: [
            check(heartbeat, '25h59m'),
            check(heartbeat, '26h'),
            check(heartbeat, '26h1m', true),
        ],
    },
    {
        name: 'zero completion from every process fires',
        input_series: [
            completed('0+0x1600', 'pod="worker"'),
            completed('0+0x1600', 'pod="api"'),
        ],
        alert_rule_test: [check(heartbeat, '26h', true)],
    },
    {
        name: 'an instance with no series still fires',
        input_series: [],
        alert_rule_test: [check(heartbeat, '26h', true)],
    },
    {
        name: 'another healthy namespace cannot hide a missing instance',
        input_series: [completed('93600+0x1600', '', otherScope)],
        alert_rule_test: [check(heartbeat, '26h', true)],
    },
    {
        name: 'completion survives pod replacement and still expires',
        input_series: [
            completed('3600+0x119 stale', 'pod="old"'),
            completed('_x119 0+0x1480', 'pod="replacement"'),
        ],
        alert_rule_test: [
            check(heartbeat, '25h59m'),
            check(heartbeat, '26h1m', true),
        ],
    },
    {
        name: 'new completion clears an overdue alert',
        input_series: [completed('3600+0x1561 93720+0x10')],
        alert_rule_test: [
            check(heartbeat, '26h1m', true),
            check(heartbeat, '26h2m'),
        ],
    },
    {
        name: 'partial failure alerts independently of a fresh heartbeat',
        input_series: [completed('60+0x30'), failed('0+0x4 1+0x25')],
        alert_rule_test: [check(heartbeat, '10m'), check(errors, '10m', true)],
    },
    {
        name: 'an unchanged counter is healthy',
        input_series: [failed('0+0x30')],
        alert_rule_test: [check(errors, '15m')],
    },
    {
        name: 'counter reset alone is not a new failure',
        input_series: [failed('100+0x4 0+0x25')],
        alert_rule_test: [check(errors, '10m')],
    },
    {
        name: 'new errors after a reset alert',
        input_series: [failed('100+0x4 0+0x4 1+0x20')],
        alert_rule_test: [check(errors, '12m', true)],
    },
    {
        name: 'failures across worker pods are aggregated',
        input_series: [
            failed('0+0x4 1+0x25', 'pod="a"'),
            failed('0+0x4 1+0x25', 'pod="b"'),
        ],
        alert_rule_test: [check(errors, '10m', true)],
    },
    {
        name: 'error alert clears when the increase leaves the window',
        input_series: [failed('0+0x4 1+0x40')],
        alert_rule_test: [check(errors, '10m', true), check(errors, '30m')],
    },
    {
        name: 'another instance errors cannot trigger this instance',
        input_series: [
            failed('0+0x4 1+0x25', '', otherScope),
            failed('0+0x30'),
        ],
        alert_rule_test: [check(errors, '10m')],
    },
];

const directory = mkdtempSync(join(tmpdir(), 'lightdash-alert-tests-'));
try {
    // JSON is also valid YAML, the format consumed by promtool.
    writeFileSync(
        join(directory, 'rules.yml'),
        JSON.stringify({
            groups: [
                {
                    name: 'daily-generation',
                    rules: [
                        { alert: heartbeat, expr: queries[0] },
                        { alert: errors, expr: queries[1] },
                    ],
                },
            ],
        }),
    );
    writeFileSync(
        join(directory, 'tests.yml'),
        JSON.stringify({
            rule_files: ['/rules/rules.yml'],
            evaluation_interval: '1m',
            tests: tests.map((test) => ({ interval: '1m', ...test })),
        }),
    );
    const result = spawnSync(
        'docker',
        [
            'run',
            '--rm',
            '--network=none',
            '-v',
            `${directory}:/rules:ro`,
            '--entrypoint=/bin/promtool',
            'prom/prometheus:v3.14.0',
            'test',
            'rules',
            '/rules/tests.yml',
        ],
        { stdio: 'inherit' },
    );
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
    if (process.exitCode === 0)
        console.log(`Passed ${tests.length} alert scenarios.`);
} finally {
    rmSync(directory, { recursive: true, force: true });
}
