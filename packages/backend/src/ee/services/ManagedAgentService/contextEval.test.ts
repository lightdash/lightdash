import {
    recordAutopilotContextStep,
    type AutopilotContextStep,
} from './contextEval';
import { createAutopilotContextFixture } from './contextEval.fixtures';

describe('Autopilot context measurements', () => {
    it('records per-call context separately from cumulative input usage', () => {
        const steps: AutopilotContextStep[] = [];
        for (const inputTokens of [100, 150, 200]) {
            recordAutopilotContextStep(steps, {
                usage: {
                    inputTokens,
                    outputTokens: 10,
                },
                toolCalls: [],
                toolResults: [],
            });
        }
        expect(steps.map(({ inputTokens }) => inputTokens)).toEqual([
            100, 150, 200,
        ]);
        expect(steps[2].cumulativeInputTokens).toBe(450);
        expect(steps[2].largestToolResultBytes).toBe(0);
    });

    it('keeps missing usage unknown, while preserving real zeroes', () => {
        const steps: AutopilotContextStep[] = [];
        for (const inputTokens of [0, undefined, 20]) {
            recordAutopilotContextStep(steps, {
                usage: {
                    inputTokens,
                    outputTokens: undefined,
                },
                toolCalls: [],
                toolResults: [],
            });
        }
        expect(
            steps.map(({ cumulativeInputTokens }) => cumulativeInputTokens),
        ).toEqual([0, null, null]);
        expect(steps[1].inputTokens).toBeNull();
        expect(steps[2].inputTokens).toBe(20);
        expect(steps[2].outputTokens).toBeNull();
    });

    it('counts UTF-8 payload bytes without retaining tool data', () => {
        const steps: AutopilotContextStep[] = [];
        recordAutopilotContextStep(steps, {
            usage: { inputTokens: 1, outputTokens: 1 },
            toolCalls: [],
            toolResults: [
                {
                    type: 'tool-result',
                    toolCallId: '1',
                    toolName: 'lookup',
                    input: {},
                    output: 'é',
                },
                {
                    type: 'tool-result',
                    toolCallId: '2',
                    toolName: 'lookup',
                    input: {},
                    output: { name: 'private fixture' },
                },
            ],
        });
        const bytes = Buffer.byteLength(
            JSON.stringify({ name: 'private fixture' }),
        );
        expect(steps[0]).toMatchObject({
            largestToolResultBytes: bytes,
            toolResultBytes: bytes + 2,
        });
        expect(JSON.stringify(steps)).not.toContain('private fixture');
    });
});

describe('Autopilot context fixtures', () => {
    it('hits the content/error caps while retaining complete counts', () => {
        const fixture = createAutopilotContextFixture('shared-model');
        let detail;
        let summary;
        try {
            detail = JSON.parse(fixture.detail(fixture.detailTable));
            summary = JSON.parse(fixture.broken);
        } catch {
            throw new Error('Fixture must produce valid JSON');
        }
        expect(summary).toMatchObject({
            total_errors: 4200,
            total_affected_items: 350,
        });
        expect(summary.groups).toHaveLength(12);
        expect(summary.groups[0].items).toHaveLength(10);
        expect(detail).toMatchObject({
            total_count: 350,
            returned_count: 100,
            truncated: true,
        });
        expect(detail.items[0]).toMatchObject({
            error_count: 12,
            errors_truncated: true,
        });
        expect(detail.items[0].errors).toHaveLength(10);
    });
    it('exercises the unbounded group list separately from capped detail', () => {
        const fixture = createAutopilotContextFixture('many-models');
        let summary;
        try {
            summary = JSON.parse(fixture.broken);
        } catch {
            throw new Error('Fixture must produce valid JSON');
        }
        expect(summary.groups).toHaveLength(350);
        expect(summary.total_affected_items).toBe(350);
    });
});
