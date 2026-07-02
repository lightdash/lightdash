import { Knex } from 'knex';
import { readFile, writeFile } from 'node:fs/promises';
import { ServiceRepository } from '../../../services/ServiceRepository';
import { AiAgentTurnSignalTableName } from '../../database/entities/aiAgentReviewClassifier';
import type {
    AiAgentReviewClassifierService,
    AiAgentReviewJudgeReplayInput,
} from '../../services/AiAgentReviewClassifierService';

/**
 * Replay scoreboard for the AI review classifier.
 *
 * Inputs come from the analytics-org audit: a CSV of human-labeled verdicts
 * over promoted v10 findings (one row per turn signal). The scoreboard has
 * three steps, runnable from the backend repl (`scripts.*`):
 *
 * 1. printReviewScoreboardBaseline({ verdictsCsvPath }) — no DB/LLM needed;
 *    prints the stored-v10 baseline from the labels alone.
 * 2. captureReviewScoreboardFixture({ verdictsCsvPath, outPath }) — needs a DB
 *    with the audited org's threads; rebuilds each labeled turn's judge inputs
 *    (candidate + evidence packet) through the CURRENT packet builder and
 *    writes them to a local JSON fixture. Read-only.
 * 3. scoreReviewScoreboard({ fixturePath, outPath? }) — needs only an LLM key;
 *    replays the CURRENT judge over the fixture and diffs against the labels.
 */

export type ScoreboardVerdict =
    | 'GOOD'
    | 'FALSE_POSITIVE'
    | 'WRONG_ROOTCAUSE'
    | 'MISSED_NUANCE'
    | 'UNSURE';

export type ScoreboardLabel = {
    signalUuid: string;
    agent: string;
    threadTitle: string;
    classifierSignal: string;
    classifierRootCause: string;
    verdict: ScoreboardVerdict;
    promotionCorrect: boolean;
    rootCauseCorrect: boolean;
};

export type ScoreboardFixtureEntry = {
    label: ScoreboardLabel;
    promptUuid: string | null;
    threadUuid: string | null;
    input: AiAgentReviewJudgeReplayInput | null;
    captureError: string | null;
};

const isScoreboardFixtureEntry = (
    value: unknown,
): value is ScoreboardFixtureEntry => {
    if (typeof value !== 'object' || value === null) {
        return false;
    }
    const entry = value as Record<string, unknown>;
    return (
        typeof entry.label === 'object' &&
        entry.label !== null &&
        'input' in entry &&
        'captureError' in entry
    );
};

export type ScoreboardReplayRow = {
    label: ScoreboardLabel;
    /** null when the turn could not be captured or the replay errored */
    predictedPromoted: boolean | null;
    predictedRootCause: string | null;
    suppressedByWriteback: boolean;
    replayError: string | null;
};

export const parseCsv = (text: string): string[][] => {
    const rows: string[][] = [];
    let row: string[] = [];
    let field = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i += 1) {
        const char = text[i];
        if (inQuotes) {
            if (char === '"') {
                if (text[i + 1] === '"') {
                    field += '"';
                    i += 1;
                } else {
                    inQuotes = false;
                }
            } else {
                field += char;
            }
        } else if (char === '"') {
            inQuotes = true;
        } else if (char === ',') {
            row.push(field);
            field = '';
        } else if (char === '\n' || char === '\r') {
            if (char === '\r' && text[i + 1] === '\n') {
                i += 1;
            }
            row.push(field);
            field = '';
            rows.push(row);
            row = [];
        } else {
            field += char;
        }
    }
    if (field.length > 0 || row.length > 0) {
        row.push(field);
        rows.push(row);
    }
    return rows.filter(
        (cells) => cells.length > 1 || (cells[0] ?? '').trim() !== '',
    );
};

const SCOREBOARD_VERDICTS: ScoreboardVerdict[] = [
    'GOOD',
    'FALSE_POSITIVE',
    'WRONG_ROOTCAUSE',
    'MISSED_NUANCE',
    'UNSURE',
];

export const parseVerdictsCsv = (text: string): ScoreboardLabel[] => {
    const rows = parseCsv(text);
    const header = rows[0];
    if (!header) {
        throw new Error('Verdicts CSV is empty');
    }
    const col = (name: string): number => {
        const index = header.indexOf(name);
        if (index === -1) {
            throw new Error(`Verdicts CSV is missing column "${name}"`);
        }
        return index;
    };
    const signalUuidCol = col('signal_uuid');
    const agentCol = col('agent');
    const threadTitleCol = col('thread_title');
    const classifierSignalCol = col('classifier_signal');
    const classifierRootCauseCol = col('classifier_rootcause');
    const verdictCol = col('verdict');
    const promotionCorrectCol = col('promotion_correct');
    const rootCauseCorrectCol = col('rootcause_correct');

    return rows.slice(1).map((cells, rowIndex) => {
        const verdict = cells[verdictCol];
        if (!SCOREBOARD_VERDICTS.includes(verdict as ScoreboardVerdict)) {
            throw new Error(
                `Verdicts CSV row ${rowIndex + 2} has unknown verdict "${verdict}"`,
            );
        }
        return {
            signalUuid: cells[signalUuidCol],
            agent: cells[agentCol],
            threadTitle: cells[threadTitleCol],
            classifierSignal: cells[classifierSignalCol],
            classifierRootCause: cells[classifierRootCauseCol],
            verdict: verdict as ScoreboardVerdict,
            promotionCorrect: cells[promotionCorrectCol] === 'True',
            rootCauseCorrect: cells[rootCauseCorrectCol] === 'True',
        };
    });
};

type PerRootCauseMetrics = {
    total: number;
    good: number;
    shouldPromote: number;
    predictedPromoted: number;
    promotionAgreement: number;
    rootCauseEvaluable: number;
    rootCauseCorrect: number;
};

export type ScoreboardMetrics = {
    total: number;
    scored: number;
    skipped: number;
    suppressedByWriteback: number;
    /** label-side verdict distribution over all rows (audit framing) */
    labelVerdicts: {
        byVerdict: Partial<Record<ScoreboardVerdict, number>>;
        goodRate: number | null;
        falsePositiveRate: number | null;
    };
    promotion: {
        truePositives: number;
        falsePositives: number;
        falseNegatives: number;
        trueNegatives: number;
        precision: number | null;
        recall: number | null;
        accuracy: number | null;
    };
    rootCause: {
        /** promoted rows where the true root cause is known from the labels */
        evaluable: number;
        correct: number;
        accuracy: number | null;
        /** promoted rows where v10 was labeled wrong and the replay picked something else */
        movedOffKnownWrong: number;
        knownWrong: number;
    };
    /** keyed by the v10 classifier root cause (matches the audit report) */
    perRootCause: Record<string, PerRootCauseMetrics>;
};

const ratio = (numerator: number, denominator: number): number | null =>
    denominator === 0 ? null : numerator / denominator;

export const computeScoreboardMetrics = (
    rows: ScoreboardReplayRow[],
): ScoreboardMetrics => {
    const scoredRows = rows.filter((r) => r.predictedPromoted !== null);
    let truePositives = 0;
    let falsePositives = 0;
    let falseNegatives = 0;
    let trueNegatives = 0;
    let rootCauseEvaluable = 0;
    let rootCauseCorrect = 0;
    let knownWrong = 0;
    let movedOffKnownWrong = 0;
    const perRootCause: Record<string, PerRootCauseMetrics> = {};

    scoredRows.forEach((row) => {
        const shouldPromote = row.label.promotionCorrect;
        const predicted = row.predictedPromoted === true;
        if (predicted && shouldPromote) truePositives += 1;
        if (predicted && !shouldPromote) falsePositives += 1;
        if (!predicted && shouldPromote) falseNegatives += 1;
        if (!predicted && !shouldPromote) trueNegatives += 1;

        const bucketKey = row.label.classifierRootCause || '(none)';
        const bucket = perRootCause[bucketKey] ?? {
            total: 0,
            good: 0,
            shouldPromote: 0,
            predictedPromoted: 0,
            promotionAgreement: 0,
            rootCauseEvaluable: 0,
            rootCauseCorrect: 0,
        };
        bucket.total += 1;
        if (row.label.verdict === 'GOOD') bucket.good += 1;
        if (shouldPromote) bucket.shouldPromote += 1;
        if (predicted) bucket.predictedPromoted += 1;
        if (predicted === shouldPromote) bucket.promotionAgreement += 1;

        if (predicted && shouldPromote) {
            if (row.label.rootCauseCorrect) {
                rootCauseEvaluable += 1;
                bucket.rootCauseEvaluable += 1;
                if (row.predictedRootCause === row.label.classifierRootCause) {
                    rootCauseCorrect += 1;
                    bucket.rootCauseCorrect += 1;
                }
            } else {
                knownWrong += 1;
                if (row.predictedRootCause !== row.label.classifierRootCause) {
                    movedOffKnownWrong += 1;
                }
            }
        }
        perRootCause[bucketKey] = bucket;
    });

    const byVerdict = rows.reduce<Partial<Record<ScoreboardVerdict, number>>>(
        (acc, r) => ({
            ...acc,
            [r.label.verdict]: (acc[r.label.verdict] ?? 0) + 1,
        }),
        {},
    );

    return {
        total: rows.length,
        scored: scoredRows.length,
        skipped: rows.length - scoredRows.length,
        suppressedByWriteback: rows.filter((r) => r.suppressedByWriteback)
            .length,
        labelVerdicts: {
            byVerdict,
            goodRate: ratio(byVerdict.GOOD ?? 0, rows.length),
            falsePositiveRate: ratio(
                byVerdict.FALSE_POSITIVE ?? 0,
                rows.length,
            ),
        },
        promotion: {
            truePositives,
            falsePositives,
            falseNegatives,
            trueNegatives,
            precision: ratio(truePositives, truePositives + falsePositives),
            recall: ratio(truePositives, truePositives + falseNegatives),
            accuracy: ratio(truePositives + trueNegatives, scoredRows.length),
        },
        rootCause: {
            evaluable: rootCauseEvaluable,
            correct: rootCauseCorrect,
            accuracy: ratio(rootCauseCorrect, rootCauseEvaluable),
            movedOffKnownWrong,
            knownWrong,
        },
        perRootCause,
    };
};

const pct = (value: number | null): string =>
    value === null ? 'n/a' : `${(value * 100).toFixed(1)}%`;

export const formatScoreboardReport = (
    title: string,
    metrics: ScoreboardMetrics,
): string => {
    const lines: string[] = [];
    lines.push(`## ${title}`);
    lines.push(
        `Turns: ${metrics.total} total, ${metrics.scored} scored, ${metrics.skipped} skipped, ${metrics.suppressedByWriteback} suppressed (writeback)`,
    );
    const verdictCounts = Object.entries(metrics.labelVerdicts.byVerdict)
        .map(([verdict, count]) => `${verdict} ${count}`)
        .join(', ');
    lines.push(
        `Labels: ${pct(metrics.labelVerdicts.goodRate)} GOOD, ${pct(
            metrics.labelVerdicts.falsePositiveRate,
        )} FALSE_POSITIVE (${verdictCounts})`,
    );
    const p = metrics.promotion;
    lines.push(
        `Promotion: precision ${pct(p.precision)} | recall ${pct(
            p.recall,
        )} | accuracy ${pct(p.accuracy)} (TP ${p.truePositives} / FP ${
            p.falsePositives
        } / FN ${p.falseNegatives} / TN ${p.trueNegatives})`,
    );
    const rc = metrics.rootCause;
    lines.push(
        `Root cause: ${pct(rc.accuracy)} on ${
            rc.evaluable
        } evaluable promoted turns; moved off known-wrong on ${
            rc.movedOffKnownWrong
        }/${rc.knownWrong}`,
    );
    lines.push('');
    lines.push(
        '| v10 root cause | n | good | should promote | replay promoted | promo agree | rc evaluable | rc correct |',
    );
    lines.push('|---|---|---|---|---|---|---|---|');
    Object.entries(metrics.perRootCause)
        .sort(([, a], [, b]) => b.total - a.total)
        .forEach(([rootCause, m]) => {
            lines.push(
                `| ${rootCause} | ${m.total} | ${m.good} | ${m.shouldPromote} | ${m.predictedPromoted} | ${m.promotionAgreement} | ${m.rootCauseEvaluable} | ${m.rootCauseCorrect} |`,
            );
        });
    return lines.join('\n');
};

/** Scores the stored v10 outputs (every labeled row was a promoted finding). */
export const buildBaselineRows = (
    labels: ScoreboardLabel[],
): ScoreboardReplayRow[] =>
    labels.map((label) => ({
        label,
        predictedPromoted: true,
        predictedRootCause: label.classifierRootCause,
        suppressedByWriteback: false,
        replayError: null,
    }));

const mapWithConcurrency = async <TItem, TResult>(
    items: TItem[],
    concurrency: number,
    fn: (item: TItem, index: number) => Promise<TResult>,
): Promise<TResult[]> => {
    const results: TResult[] = new Array(items.length);
    let nextIndex = 0;
    const workers = Array.from(
        { length: Math.max(1, Math.min(concurrency, items.length)) },
        async () => {
            while (nextIndex < items.length) {
                const index = nextIndex;
                nextIndex += 1;
                // eslint-disable-next-line no-await-in-loop
                results[index] = await fn(items[index], index);
            }
        },
    );
    await Promise.all(workers);
    return results;
};

const errorMessage = (error: unknown): string =>
    error instanceof Error ? error.message : String(error);

export function getReviewClassifierScoreboardScripts(
    database: Knex,
    serviceRepository: ServiceRepository,
) {
    const getService = () =>
        serviceRepository.getAiAgentReviewClassifierService<AiAgentReviewClassifierService>();

    async function printReviewScoreboardBaseline(args: {
        verdictsCsvPath: string;
    }): Promise<ScoreboardMetrics> {
        const labels = parseVerdictsCsv(
            await readFile(args.verdictsCsvPath, 'utf8'),
        );
        const metrics = computeScoreboardMetrics(buildBaselineRows(labels));
        console.log(
            formatScoreboardReport(
                'Stored v10 baseline (from labels)',
                metrics,
            ),
        );
        return metrics;
    }

    async function captureReviewScoreboardFixture(args: {
        verdictsCsvPath: string;
        outPath: string;
        limit?: number;
        concurrency?: number;
    }): Promise<{ captured: number; missing: number; failed: number }> {
        const service = getService();
        const labels = parseVerdictsCsv(
            await readFile(args.verdictsCsvPath, 'utf8'),
        ).slice(0, args.limit);

        const signalRows = await database(AiAgentTurnSignalTableName)
            .select<
                {
                    ai_agent_review_turn_signal_uuid: string;
                    ai_prompt_uuid: string;
                    ai_thread_uuid: string;
                    organization_uuid: string;
                }[]
            >(
                'ai_agent_review_turn_signal_uuid',
                'ai_prompt_uuid',
                'ai_thread_uuid',
                'organization_uuid',
            )
            .whereIn(
                'ai_agent_review_turn_signal_uuid',
                labels.map((label) => label.signalUuid),
            );
        const signalsByUuid = new Map(
            signalRows.map((row) => [
                row.ai_agent_review_turn_signal_uuid,
                row,
            ]),
        );

        const entries = await mapWithConcurrency(
            labels,
            args.concurrency ?? 5,
            async (label): Promise<ScoreboardFixtureEntry> => {
                const signal = signalsByUuid.get(label.signalUuid);
                if (!signal) {
                    return {
                        label,
                        promptUuid: null,
                        threadUuid: null,
                        input: null,
                        captureError: 'signal not found in database',
                    };
                }
                try {
                    const input = await service.captureJudgeReplayInput({
                        organizationUuid: signal.organization_uuid,
                        promptUuid: signal.ai_prompt_uuid,
                    });
                    return {
                        label,
                        promptUuid: signal.ai_prompt_uuid,
                        threadUuid: signal.ai_thread_uuid,
                        input,
                        captureError: input ? null : 'candidate not found',
                    };
                } catch (error) {
                    return {
                        label,
                        promptUuid: signal.ai_prompt_uuid,
                        threadUuid: signal.ai_thread_uuid,
                        input: null,
                        captureError: errorMessage(error),
                    };
                }
            },
        );

        await writeFile(args.outPath, JSON.stringify(entries, null, 2));
        const captured = entries.filter((e) => e.input !== null).length;
        const missing = entries.filter(
            (e) => e.captureError === 'signal not found in database',
        ).length;
        const failed = entries.length - captured - missing;
        console.log(
            `Captured ${captured}/${entries.length} judge inputs to ${args.outPath} (${missing} signals missing, ${failed} failed)`,
        );
        return { captured, missing, failed };
    }

    /**
     * Capture via the deployed admin API instead of a direct DB connection —
     * needs the AiReviewReplayCapture feature flag enabled for the org and an
     * org-admin PAT. Produces the same fixture format as the DB capture.
     */
    async function captureReviewScoreboardFixtureFromApi(args: {
        siteUrl: string;
        apiKey: string;
        verdictsCsvPath: string;
        outPath: string;
        batchSize?: number;
    }): Promise<{ captured: number; missing: number; failed: number }> {
        const labels = parseVerdictsCsv(
            await readFile(args.verdictsCsvPath, 'utf8'),
        );
        const labelsBySignalUuid = new Map(
            labels.map((label) => [label.signalUuid, label]),
        );
        const batchSize = Math.min(args.batchSize ?? 25, 50);
        const entries: ScoreboardFixtureEntry[] = [];

        for (let start = 0; start < labels.length; start += batchSize) {
            const batch = labels.slice(start, start + batchSize);
            // eslint-disable-next-line no-await-in-loop
            const response = await fetch(
                `${args.siteUrl}/api/v1/aiAgents/admin/review-replay-capture`,
                {
                    method: 'POST',
                    headers: {
                        Authorization: `ApiKey ${args.apiKey}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        signalUuids: batch.map((label) => label.signalUuid),
                    }),
                },
            );
            if (!response.ok) {
                throw new Error(
                    `Capture request failed (${response.status}): ${
                        // eslint-disable-next-line no-await-in-loop
                        await response.text()
                    }`,
                );
            }
            // eslint-disable-next-line no-await-in-loop
            const payload = (await response.json()) as {
                results: {
                    signalUuid: string;
                    promptUuid: string | null;
                    threadUuid: string | null;
                    captureError: string | null;
                    input: AiAgentReviewJudgeReplayInput | null;
                }[];
            };
            payload.results.forEach((result) => {
                const label = labelsBySignalUuid.get(result.signalUuid);
                if (!label) {
                    return;
                }
                entries.push({
                    label,
                    promptUuid: result.promptUuid,
                    threadUuid: result.threadUuid,
                    input: result.input,
                    captureError: result.captureError,
                });
            });
            console.log(
                `Captured ${Math.min(start + batchSize, labels.length)}/${
                    labels.length
                }`,
            );
        }

        await writeFile(args.outPath, JSON.stringify(entries, null, 2));
        const captured = entries.filter((e) => e.input !== null).length;
        const missing = entries.filter(
            (e) => e.captureError === 'signal not found',
        ).length;
        const failed = entries.length - captured - missing;
        console.log(
            `Captured ${captured}/${entries.length} judge inputs to ${args.outPath} (${missing} signals missing, ${failed} failed)`,
        );
        return { captured, missing, failed };
    }

    async function scoreReviewScoreboard(args: {
        fixturePath: string;
        outPath?: string;
        limit?: number;
        concurrency?: number;
        /** false = A/B the fast gate tier alone (no strong-model escalation) */
        escalation?: boolean;
    }): Promise<ScoreboardMetrics> {
        const service = getService();
        let entries: ScoreboardFixtureEntry[];
        try {
            const parsed: unknown = JSON.parse(
                await readFile(args.fixturePath, 'utf8'),
            );
            if (
                !Array.isArray(parsed) ||
                !parsed.every(isScoreboardFixtureEntry)
            ) {
                throw new Error(
                    'expected an array of fixture entries { label, input, captureError }',
                );
            }
            entries = parsed;
        } catch (error) {
            throw new Error(
                `Could not parse fixture ${args.fixturePath}: ${errorMessage(
                    error,
                )}`,
            );
        }
        entries = entries.slice(0, args.limit);

        const rows = await mapWithConcurrency(
            entries,
            args.concurrency ?? 8,
            async (entry, index): Promise<ScoreboardReplayRow> => {
                if (!entry.input) {
                    return {
                        label: entry.label,
                        predictedPromoted: null,
                        predictedRootCause: null,
                        suppressedByWriteback: false,
                        replayError: entry.captureError,
                    };
                }
                try {
                    const result = await service.replayJudge(entry.input, {
                        escalationEnabled: args.escalation ?? true,
                    });
                    console.log(
                        `[${index + 1}/${entries.length}] ${
                            entry.label.signalUuid
                        } → ${
                            result.suppressed ??
                            `${
                                result.judgeOutput.promotedToFinding
                                    ? 'promoted'
                                    : 'not promoted'
                            } (${result.judgeOutput.primaryRootCause})`
                        }`,
                    );
                    if (result.suppressed) {
                        return {
                            label: entry.label,
                            predictedPromoted: false,
                            predictedRootCause: null,
                            suppressedByWriteback: true,
                            replayError: null,
                        };
                    }
                    return {
                        label: entry.label,
                        predictedPromoted: result.judgeOutput.promotedToFinding,
                        predictedRootCause: result.judgeOutput.primaryRootCause,
                        suppressedByWriteback: false,
                        replayError: null,
                    };
                } catch (error) {
                    return {
                        label: entry.label,
                        predictedPromoted: null,
                        predictedRootCause: null,
                        suppressedByWriteback: false,
                        replayError: errorMessage(error),
                    };
                }
            },
        );

        const metrics = computeScoreboardMetrics(rows);
        console.log(formatScoreboardReport('Replay (current judge)', metrics));
        if (args.outPath) {
            await writeFile(
                args.outPath,
                JSON.stringify({ metrics, rows }, null, 2),
            );
            console.log(`Wrote detailed results to ${args.outPath}`);
        }
        return metrics;
    }

    return {
        printReviewScoreboardBaseline,
        captureReviewScoreboardFixture,
        captureReviewScoreboardFixtureFromApi,
        scoreReviewScoreboard,
    };
}
