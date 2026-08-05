import { type AiDeepResearchBudget } from '@lightdash/common';
import {
    getAiDeepResearchCoordinatorInstructions,
    getAiDeepResearchWorkerBudget,
    getAiDeepResearchWorkerInstructions,
} from './AiDeepResearchAgent';

const task = {
    id: 'task-1',
    question: 'Did order volume fall in the repriced categories?',
    focus: 'Weekly orders by category for the affected window only',
};

describe('getAiDeepResearchCoordinatorInstructions', () => {
    it('caps delegation and keeps the coordinator responsible for the report', () => {
        const instructions = getAiDeepResearchCoordinatorInstructions();

        expect(instructions).toContain('at most 2');
        expect(instructions).toContain('delegateResearchTask');
        expect(instructions).toContain('untrusted');
        expect(instructions).toContain('correlation');
    });

    it('does not mandate a fixed set of competing hypotheses', () => {
        const instructions = getAiDeepResearchCoordinatorInstructions();

        expect(instructions).toContain(
            'Do not enumerate competing hypotheses for their own sake',
        );
        expect(instructions).not.toContain('falsifiable');
        expect(instructions).not.toMatch(/exactly \d+/);
    });
});

describe('getAiDeepResearchWorkerInstructions', () => {
    it('embeds the single assigned task and its submission contract', () => {
        const instructions = getAiDeepResearchWorkerInstructions(task);

        expect(instructions).toContain('id="task-1"');
        expect(instructions).toContain(task.question);
        expect(instructions).toContain(task.focus);
        expect(instructions).toContain('submitWorkerFindings');
        expect(instructions).toContain('queryUuid');
        expect(instructions).toContain('untrusted');
    });
});

describe('getAiDeepResearchWorkerBudget', () => {
    const budget: AiDeepResearchBudget = {
        maxTokens: 1_000,
        maxToolCalls: 24,
        maxWarehouseQueries: 15,
        maxHypotheses: 5,
        maxResultRows: 500,
    };

    it('gives a worker a slice of the run budget, leaving room for the coordinator', () => {
        expect(getAiDeepResearchWorkerBudget(budget)).toEqual({
            ...budget,
            maxToolCalls: 8,
            maxWarehouseQueries: 5,
        });
    });

    it('never drops a worker below one tool call or one query', () => {
        const workerBudget = getAiDeepResearchWorkerBudget({
            ...budget,
            maxToolCalls: 2,
            maxWarehouseQueries: 1,
        });

        expect(workerBudget.maxToolCalls).toBe(1);
        expect(workerBudget.maxWarehouseQueries).toBe(1);
    });
});
