/**
 * Backtests the release-safety Jev gate against completed PR previews.
 *
 * Ground truth comes from the sticky comment's raw release-safety marker for
 * the exact workflow run: REST uses breakingCount or advisoryCount, MCP uses
 * breakingCount or advisoryCount, and database uses migrations.present.
 *
 * CLI: pnpm exec tsx scripts/release-safety-jev-backtest.ts
 *      [--limit <n>] [--report <path>]
 */
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import {
    buildGateEvidence,
    DEFAULT_SKIP_BELOW,
    GateDecision,
    GateSurface,
    JevGateResult,
    runJevGate,
} from './release-safety-jev-gate';

const REPOSITORY = 'lightdash/lightdash';
const WORKFLOW = 'release-safety-pr.yml';
const SWEEP_THRESHOLDS = [0.05, 0.1, 0.15, 0.25, 0.35];

interface WorkflowRun {
    id: number;
    head_sha: string;
    status: string;
    conclusion: string | null;
    run_started_at: string;
    updated_at: string;
}

interface PullRequest {
    number: number;
    merged_at: string | null;
    head: { sha: string };
}

interface WorkflowJob {
    name: string;
    status: string;
    conclusion: string | null;
}

interface IssueComment {
    body?: string;
}

interface MarkerSurface {
    checked: boolean;
    breakingCount?: number;
    advisoryCount?: number;
    changes?: unknown[];
    advisories?: unknown[];
}

interface PreviewMarker {
    migrations: { present: boolean | 'unknown' };
    api: { rest: MarkerSurface; mcp: MarkerSurface };
}

interface BacktestCase {
    pr: number;
    runId: number;
    base: string;
    head: string;
    marker: PreviewMarker;
}

interface EvaluatedCase extends BacktestCase {
    result: JevGateResult;
    truth: Record<GateSurface, boolean>;
}

function arg(name: string): string | undefined {
    const index = process.argv.indexOf(`--${name}`);
    return index >= 0 ? process.argv[index + 1] : undefined;
}

function ghJson<T>(endpoint: string): T {
    return JSON.parse(
        execFileSync('gh', ['api', endpoint], {
            encoding: 'utf8',
            maxBuffer: 64 * 1024 * 1024,
        }),
    ) as T;
}

function git(args: string[]): string {
    return execFileSync('git', args, {
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
    }).trim();
}

function commitExists(ref: string): boolean {
    try {
        execFileSync('git', ['cat-file', '-e', `${ref}^{commit}`], {
            stdio: 'ignore',
        });
        return true;
    } catch {
        return false;
    }
}

function ensureCommit(ref: string): boolean {
    if (commitExists(ref)) return true;
    try {
        git(['fetch', '--no-tags', 'origin', ref]);
        return commitExists(ref);
    } catch {
        return false;
    }
}

function markerChanged(surface: MarkerSurface): boolean {
    return (
        surface.checked === true &&
        ((surface.breakingCount ?? surface.changes?.length ?? 0) > 0 ||
            (surface.advisoryCount ?? surface.advisories?.length ?? 0) > 0)
    );
}

function extractStampedMarker(
    comments: IssueComment[],
    runId: number,
): { base: string; head: string; marker: PreviewMarker } | null {
    for (const comment of comments) {
        const body = comment.body ?? '';
        if (!body.includes('<!-- release-safety-marker -->')) continue;
        const stamp = body.match(
            /<!-- release-safety-describes head:([0-9a-f]{7,40}) base:([0-9a-f]{7,40}) gate:(?:pass|fail) run:([1-9][0-9]*) -->/,
        );
        if (!stamp || Number(stamp[3]) !== runId) continue;
        const raw = body.match(
            /<details><summary>Technical details \(raw JSON\)<\/summary>\s*```json\s*([\s\S]*?)```/,
        );
        if (!raw) return null;
        return {
            head: stamp[1],
            base: stamp[2],
            marker: JSON.parse(raw[1]) as PreviewMarker,
        };
    }
    return null;
}

function listRuns(day: string, page: number): WorkflowRun[] {
    const created = encodeURIComponent(`${day}T00:00:00Z..${day}T23:59:59Z`);
    const response = ghJson<{ workflow_runs: WorkflowRun[] }>(
        `repos/${REPOSITORY}/actions/workflows/${WORKFLOW}/runs?event=pull_request&status=completed&created=${created}&per_page=100&page=${page}`,
    );
    return response.workflow_runs;
}

function findMergedPullRequest(run: WorkflowRun): PullRequest | null {
    const pulls = ghJson<PullRequest[]>(
        `repos/${REPOSITORY}/commits/${run.head_sha}/pulls`,
    );
    return (
        pulls.find(
            (pull) => pull.merged_at !== null && pull.head.sha === run.head_sha,
        ) ?? null
    );
}

function completedHeavyPath(runId: number): boolean {
    const response = ghJson<{ jobs: WorkflowJob[] }>(
        `repos/${REPOSITORY}/actions/runs/${runId}/jobs?per_page=100`,
    );
    const snapshots = response.jobs.find((job) => job.name === 'Generate API snapshots');
    const preview = response.jobs.find((job) => job.name === 'Release-safety preview');
    return (
        snapshots?.conclusion === 'success' &&
        preview?.status === 'completed' &&
        preview.conclusion !== 'cancelled' &&
        preview.conclusion !== 'skipped'
    );
}

function collectCases(limit: number): {
    cases: BacktestCase[];
    exclusions: Record<string, number>;
    runsInspected: number;
} {
    const cases: BacktestCase[] = [];
    const exclusions: Record<string, number> = {};
    const seenPulls = new Set<number>();
    let runsInspected = 0;
    const exclude = (reason: string): void => {
        exclusions[reason] = (exclusions[reason] ?? 0) + 1;
    };

    const day = new Date();
    for (let daysBack = 0; daysBack < 120 && cases.length < limit; daysBack += 1) {
        const isoDay = day.toISOString().slice(0, 10);
        for (let page = 1; page <= 10 && cases.length < limit; page += 1) {
            const runs = listRuns(isoDay, page);
            if (runs.length === 0) break;
            for (const run of runs) {
                if (cases.length >= limit) break;
                runsInspected += 1;
                const durationMs =
                    Date.parse(run.updated_at) - Date.parse(run.run_started_at);
                if (durationMs < 120_000) {
                    exclude('run finished before the heavy path duration floor');
                    continue;
                }
                if (!completedHeavyPath(run.id)) {
                    exclude('heavy path did not complete');
                    continue;
                }
                const pull = findMergedPullRequest(run);
                if (!pull) {
                    exclude('no merged pull request for run head');
                    continue;
                }
                if (seenPulls.has(pull.number)) {
                    exclude('older run for an already inspected pull request');
                    continue;
                }
                seenPulls.add(pull.number);
                const comments = ghJson<IssueComment[]>(
                    `repos/${REPOSITORY}/issues/${pull.number}/comments?per_page=100`,
                );
                const stamped = extractStampedMarker(comments, run.id);
                if (!stamped) {
                    exclude('sticky comment no longer describes this run');
                    continue;
                }
                if (!stamped.marker.api.rest.checked || !stamped.marker.api.mcp.checked) {
                    exclude('deterministic API ground truth is unchecked');
                    continue;
                }
                cases.push({
                    pr: pull.number,
                    runId: run.id,
                    base: stamped.base,
                    head: stamped.head,
                    marker: stamped.marker,
                });
            }
        }
        day.setUTCDate(day.getUTCDate() - 1);
    }

    return { cases, exclusions, runsInspected };
}

function decisionAtThreshold(
    result: JevGateResult,
    surface: GateSurface,
    threshold: number,
): GateDecision {
    if (result.forced[surface]) return 'run';
    const question = `${surface}_may_change` as keyof JevGateResult['probabilities'];
    const probability = result.probabilities[question];
    return typeof probability === 'number' && probability < threshold ? 'skip' : 'run';
}

function percentile(values: number[], fraction: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
}

function percent(value: number, total: number): string {
    return total === 0 ? '0.0%' : `${((value / total) * 100).toFixed(1)}%`;
}

function prLinks(prs: number[]): string {
    return prs.length === 0
        ? 'none'
        : prs
              .map(
                  (pr) =>
                      `[#${pr}](https://github.com/lightdash/lightdash/pull/${pr})`,
              )
              .join(', ');
}

function renderReport(options: {
    requested: number;
    evaluated: EvaluatedCase[];
    exclusions: Record<string, number>;
    runsInspected: number;
}): string {
    const surfaces: GateSurface[] = ['rest_api', 'db_schema', 'mcp_tools'];
    const latencies = options.evaluated.map((item) => item.result.latencyMs);
    const tokens = options.evaluated.map((item) => item.result.inputTokens);
    const totalTokens = tokens.reduce((sum, value) => sum + value, 0);
    const lines = [
        '# Release-safety Jev gate backtest',
        '',
        `Requested ${options.requested} merged PRs. Evaluated ${options.evaluated.length} after inspecting ${options.runsInspected} completed workflow runs.`,
        '',
        'Ground truth is the raw release-safety marker in the sticky PR comment whose describes-stamp names the exact workflow run. REST counts any non-zero `breakingCount` or `advisoryCount`; MCP uses the same fields; database uses `migrations.present === true`.',
        '',
        `Default policy: skip only when the matching Noul is below ${DEFAULT_SKIP_BELOW.toFixed(2)}. Deterministic forced decisions always run.`,
        '',
        '## Default threshold',
        '',
        '| Surface | Skips | Skip rate | Wrong skips | Pull requests |',
        '|---|---:|---:|---:|---|',
    ];

    for (const surface of surfaces) {
        const skipped = options.evaluated.filter(
            (item) => decisionAtThreshold(item.result, surface, DEFAULT_SKIP_BELOW) === 'skip',
        );
        const wrong = skipped.filter((item) => item.truth[surface]);
        lines.push(
            `| ${surface} | ${skipped.length} | ${percent(skipped.length, options.evaluated.length)} | ${wrong.length} | ${prLinks(wrong.map((item) => item.pr))} |`,
        );
    }

    lines.push('', '## Threshold sweep', '');
    lines.push('| Threshold | Surface | Skip rate | Wrong skips | Pull requests |');
    lines.push('|---:|---|---:|---:|---|');
    for (const threshold of SWEEP_THRESHOLDS) {
        for (const surface of surfaces) {
            const skipped = options.evaluated.filter(
                (item) => decisionAtThreshold(item.result, surface, threshold) === 'skip',
            );
            const wrong = skipped.filter((item) => item.truth[surface]);
            lines.push(
                `| ${threshold.toFixed(2)} | ${surface} | ${percent(skipped.length, options.evaluated.length)} | ${wrong.length} | ${prLinks(wrong.map((item) => item.pr))} |`,
            );
        }
    }

    lines.push(
        '',
        '## Cost and latency',
        '',
        `- Total input tokens: ${totalTokens}.`,
        `- Mean input tokens: ${options.evaluated.length === 0 ? 0 : Math.round(totalTokens / options.evaluated.length)}.`,
        `- Mean latency: ${options.evaluated.length === 0 ? 0 : Math.round(latencies.reduce((sum, value) => sum + value, 0) / options.evaluated.length)} ms.`,
        `- P50 latency: ${percentile(latencies, 0.5)} ms.`,
        `- P95 latency: ${percentile(latencies, 0.95)} ms.`,
        `- Deterministically forced cases: ${options.evaluated.filter((item) => Object.values(item.result.forced).some(Boolean)).length}.`,
        '',
        '## Reachability and limitations',
        '',
    );
    for (const [reason, count] of Object.entries(options.exclusions).sort()) {
        lines.push(`- ${count} run(s): ${reason}.`);
    }
    lines.push(
        `- ${options.evaluated.length < options.requested ? `Only ${options.evaluated.length} of the requested ${options.requested} PRs were reachable with an exact heavy-run marker.` : 'The requested sample was reached.'}`,
        '- The backtest measures whether the preview marker found a changed surface. It does not prove that every unchanged marker is a true negative.',
        '- The sample includes only merged PRs with a completed heavy path and a surviving sticky comment for that exact run. It excludes cancelled runs and overwritten historical comments.',
        '- Shadow mode leaves effective workflow outputs at `run`; these skip rates model enforcement only.',
        '',
    );
    return lines.join('\n');
}

async function main(): Promise<void> {
    const limit = Number(arg('limit') ?? 60);
    if (!Number.isInteger(limit) || limit <= 0) {
        throw new Error('--limit must be a positive integer');
    }
    const apiKey = process.env.TYPESAFE_API_KEY;
    if (!apiKey) throw new Error('TYPESAFE_API_KEY is required for a real backtest');

    const collected = collectCases(limit);
    const evaluated: EvaluatedCase[] = [];
    const exclusions = { ...collected.exclusions };
    for (const [index, item] of collected.cases.entries()) {
        process.stderr.write(
            `[release-safety-jev-backtest] ${index + 1}/${collected.cases.length}: PR #${item.pr}\n`,
        );
        if (!ensureCommit(item.base) || !ensureCommit(item.head)) {
            exclusions['git commit no longer reachable'] =
                (exclusions['git commit no longer reachable'] ?? 0) + 1;
            continue;
        }
        const result = await runJevGate({
            evidence: buildGateEvidence({ base: item.base, head: item.head }),
            mode: 'enforce',
            apiKey,
        });
        evaluated.push({
            ...item,
            result,
            truth: {
                rest_api: markerChanged(item.marker.api.rest),
                db_schema: item.marker.migrations.present === true,
                mcp_tools: markerChanged(item.marker.api.mcp),
            },
        });
    }

    const report = renderReport({
        requested: limit,
        evaluated,
        exclusions,
        runsInspected: collected.runsInspected,
    });
    const reportPath = arg('report');
    if (reportPath) fs.writeFileSync(reportPath, `${report}\n`);
    process.stdout.write(`${report}\n`);
}

const invokedDirectly =
    require.main === module ||
    process.argv[1]?.endsWith('release-safety-jev-backtest.ts') === true;

if (invokedDirectly) {
    main().catch((error) => {
        process.stderr.write(
            `[release-safety-jev-backtest] FAILED: ${
                error instanceof Error ? error.message : String(error)
            }\n`,
        );
        process.exitCode = 1;
    });
}
