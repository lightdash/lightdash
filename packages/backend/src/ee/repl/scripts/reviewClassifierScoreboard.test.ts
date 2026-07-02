import {
    buildBaselineRows,
    computeScoreboardMetrics,
    formatScoreboardReport,
    parseCsv,
    parseVerdictsCsv,
    type ScoreboardLabel,
    type ScoreboardReplayRow,
} from './reviewClassifierScoreboard';

const label = (overrides: Partial<ScoreboardLabel> = {}): ScoreboardLabel => ({
    signalUuid: 'signal-1',
    agent: 'Test Agent',
    threadTitle: 'Test thread',
    classifierSignal: 'implicit_correction',
    classifierRootCause: 'semantic_layer',
    verdict: 'GOOD',
    promotionCorrect: true,
    rootCauseCorrect: true,
    ...overrides,
});

const row = (
    overrides: Partial<ScoreboardReplayRow> = {},
): ScoreboardReplayRow => ({
    label: label(),
    predictedPromoted: true,
    predictedRootCause: 'semantic_layer',
    suppressedByWriteback: false,
    replayError: null,
    ...overrides,
});

describe('parseCsv', () => {
    it('parses quoted fields with commas and newlines', () => {
        const text =
            'a,b,c\n1,"two, with comma","three\nwith newline"\n4,"quote ""inside""",6\n';
        expect(parseCsv(text)).toEqual([
            ['a', 'b', 'c'],
            ['1', 'two, with comma', 'three\nwith newline'],
            ['4', 'quote "inside"', '6'],
        ]);
    });

    it('handles CRLF line endings and skips trailing blank lines', () => {
        expect(parseCsv('a,b\r\n1,2\r\n\r\n')).toEqual([
            ['a', 'b'],
            ['1', '2'],
        ]);
    });
});

describe('parseVerdictsCsv', () => {
    const header =
        'signal_uuid,agent,classifier_signal,classifier_rootcause,item_status,verdict,promotion_correct,rootcause_correct,signal_correct,evidence_grounded,classifier_gap,note,thread_title';

    it('maps columns by header name', () => {
        const text = `${header}\nuuid-1,Agent A,retry,project_context,,FALSE_POSITIVE,False,False,False,False,gap,note text,Thread title`;
        expect(parseVerdictsCsv(text)).toEqual([
            {
                signalUuid: 'uuid-1',
                agent: 'Agent A',
                threadTitle: 'Thread title',
                classifierSignal: 'retry',
                classifierRootCause: 'project_context',
                verdict: 'FALSE_POSITIVE',
                promotionCorrect: false,
                rootCauseCorrect: false,
            },
        ]);
    });

    it('throws on unknown verdicts', () => {
        const text = `${header}\nuuid-1,Agent A,retry,project_context,,BOGUS,False,False,False,False,,,Thread`;
        expect(() => parseVerdictsCsv(text)).toThrow('unknown verdict');
    });

    it('throws on missing columns', () => {
        expect(() => parseVerdictsCsv('a,b\n1,2')).toThrow(
            'missing column "signal_uuid"',
        );
    });
});

describe('computeScoreboardMetrics', () => {
    it('computes promotion confusion matrix against promotion_correct labels', () => {
        const metrics = computeScoreboardMetrics([
            // TP: should promote, replay promoted
            row(),
            // FP: should not promote, replay promoted
            row({
                label: label({
                    verdict: 'FALSE_POSITIVE',
                    promotionCorrect: false,
                    rootCauseCorrect: false,
                }),
            }),
            // TN: should not promote, replay did not promote
            row({
                label: label({
                    verdict: 'FALSE_POSITIVE',
                    promotionCorrect: false,
                    rootCauseCorrect: false,
                }),
                predictedPromoted: false,
                predictedRootCause: null,
            }),
            // FN: should promote, replay did not promote
            row({ predictedPromoted: false, predictedRootCause: null }),
        ]);

        expect(metrics.promotion).toEqual({
            truePositives: 1,
            falsePositives: 1,
            falseNegatives: 1,
            trueNegatives: 1,
            precision: 0.5,
            recall: 0.5,
            accuracy: 0.5,
        });
    });

    it('scores root cause only on promoted turns with a known-correct label', () => {
        const metrics = computeScoreboardMetrics([
            // evaluable + correct
            row(),
            // evaluable + wrong
            row({ predictedRootCause: 'project_context' }),
            // v10 root cause labeled wrong; replay moved off it
            row({
                label: label({
                    verdict: 'WRONG_ROOTCAUSE',
                    rootCauseCorrect: false,
                }),
                predictedRootCause: 'project_context',
            }),
            // v10 root cause labeled wrong; replay repeated it
            row({
                label: label({
                    verdict: 'WRONG_ROOTCAUSE',
                    rootCauseCorrect: false,
                }),
            }),
            // not promoted → not evaluable
            row({ predictedPromoted: false, predictedRootCause: null }),
        ]);

        expect(metrics.rootCause).toEqual({
            evaluable: 2,
            correct: 1,
            accuracy: 0.5,
            movedOffKnownWrong: 1,
            knownWrong: 2,
        });
    });

    it('skips rows without a replay result and counts writeback suppression', () => {
        const metrics = computeScoreboardMetrics([
            row(),
            row({
                predictedPromoted: null,
                predictedRootCause: null,
                replayError: 'capture failed',
            }),
            row({
                predictedPromoted: false,
                predictedRootCause: null,
                suppressedByWriteback: true,
            }),
        ]);

        expect(metrics.total).toBe(3);
        expect(metrics.scored).toBe(2);
        expect(metrics.skipped).toBe(1);
        expect(metrics.suppressedByWriteback).toBe(1);
    });

    it('buckets per v10 root cause', () => {
        const metrics = computeScoreboardMetrics([
            row(),
            row({
                label: label({
                    classifierRootCause: 'runtime_reliability',
                    verdict: 'FALSE_POSITIVE',
                    promotionCorrect: false,
                    rootCauseCorrect: false,
                }),
                predictedPromoted: false,
                predictedRootCause: null,
            }),
        ]);

        expect(metrics.perRootCause.semantic_layer).toEqual({
            total: 1,
            good: 1,
            shouldPromote: 1,
            predictedPromoted: 1,
            promotionAgreement: 1,
            rootCauseEvaluable: 1,
            rootCauseCorrect: 1,
        });
        expect(metrics.perRootCause.runtime_reliability).toEqual({
            total: 1,
            good: 0,
            shouldPromote: 0,
            predictedPromoted: 0,
            promotionAgreement: 1,
            rootCauseEvaluable: 0,
            rootCauseCorrect: 0,
        });
    });
});

describe('buildBaselineRows', () => {
    it('reproduces the audited v10 baseline from the labels alone', () => {
        // 2 GOOD, 1 FALSE_POSITIVE, 1 WRONG_ROOTCAUSE — mirrors the audit shape
        const labels = [
            label(),
            label({ signalUuid: 'signal-2' }),
            label({
                signalUuid: 'signal-3',
                verdict: 'FALSE_POSITIVE',
                promotionCorrect: false,
                rootCauseCorrect: false,
            }),
            label({
                signalUuid: 'signal-4',
                verdict: 'WRONG_ROOTCAUSE',
                promotionCorrect: true,
                rootCauseCorrect: false,
            }),
        ];
        const metrics = computeScoreboardMetrics(buildBaselineRows(labels));

        // v10 promoted everything: precision = shouldPromote / total
        expect(metrics.promotion.precision).toBe(0.75);
        expect(metrics.promotion.recall).toBe(1);
        expect(metrics.labelVerdicts.goodRate).toBe(0.5);
        expect(metrics.labelVerdicts.falsePositiveRate).toBe(0.25);
        // known-correct root causes match themselves; known-wrong ones stay wrong
        expect(metrics.rootCause.accuracy).toBe(1);
        expect(metrics.rootCause.movedOffKnownWrong).toBe(0);
        expect(metrics.rootCause.knownWrong).toBe(1);
    });
});

describe('formatScoreboardReport', () => {
    it('renders a readable summary with a per-root-cause table', () => {
        const report = formatScoreboardReport(
            'Test report',
            computeScoreboardMetrics([row()]),
        );
        expect(report).toContain('## Test report');
        expect(report).toContain('Promotion: precision 100.0%');
        expect(report).toContain(
            '| semantic_layer | 1 | 1 | 1 | 1 | 1 | 1 | 1 |',
        );
        expect(report).toContain('Labels: 100.0% GOOD');
    });
});
