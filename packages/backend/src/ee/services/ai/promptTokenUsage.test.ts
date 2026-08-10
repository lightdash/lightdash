import {
    accumulatePromptTokenUsage,
    finalStepPromptTokenUsage,
    getContextOccupancyTokens,
    initialPromptTokenUsage,
} from './promptTokenUsage';

const runSteps = (initialTotalTokens: number, steps: (number | null)[]) =>
    steps.reduce(
        (usage, stepTokens) => accumulatePromptTokenUsage(usage, stepTokens),
        initialPromptTokenUsage(initialTotalTokens),
    );

describe('prompt token usage', () => {
    it('keeps the cumulative total while reporting only the last step as occupancy', () => {
        // Each tool-loop step re-sends the conversation, so per-step totals
        // grow while the cumulative sum compounds far beyond them.
        expect(runSteps(0, [12000, 18000, 25000, 31000])).toEqual({
            totalTokens: 86000,
            finalStepTotalTokens: 31000,
        });
    });

    it('seeds the cumulative total from earlier phases without inflating occupancy', () => {
        expect(runSteps(400000, [9000, 14000])).toEqual({
            totalTokens: 423000,
            finalStepTotalTokens: 14000,
        });
    });

    it('starts with a zero final step before any step has run', () => {
        expect(initialPromptTokenUsage(1234)).toEqual({
            totalTokens: 1234,
            finalStepTotalTokens: 0,
        });
    });

    it('treats missing step usage as zero tokens', () => {
        expect(runSteps(0, [5000, null])).toEqual({
            totalTokens: 5000,
            finalStepTotalTokens: 0,
        });
    });

    it('reports identical figures for final-step-only modes', () => {
        expect(finalStepPromptTokenUsage(7500)).toEqual({
            totalTokens: 7500,
            finalStepTotalTokens: 7500,
        });
        expect(finalStepPromptTokenUsage(undefined)).toEqual({
            totalTokens: 0,
            finalStepTotalTokens: 0,
        });
    });

    describe('getContextOccupancyTokens', () => {
        it('prefers the final-step figure', () => {
            expect(
                getContextOccupancyTokens({
                    totalTokens: 900000,
                    finalStepTotalTokens: 31000,
                }),
            ).toBe(31000);
        });

        it('falls back to totalTokens for rows written before the field existed', () => {
            expect(getContextOccupancyTokens({ totalTokens: 31000 })).toBe(
                31000,
            );
        });

        it('returns null when no usage was persisted', () => {
            expect(getContextOccupancyTokens(null)).toBeNull();
            expect(getContextOccupancyTokens(undefined)).toBeNull();
        });
    });
});
