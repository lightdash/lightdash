import type { GenerateTextOnStepFinishCallback, ToolSet } from 'ai';

type Step = Parameters<GenerateTextOnStepFinishCallback<ToolSet>>[0];

export type AutopilotContextStep = {
    step: number;
    inputTokens: number | null;
    cumulativeInputTokens: number | null;
    outputTokens: number | null;
    largestToolResultBytes: number;
    toolResultBytes: number;
    tools: string[];
};

// Benchmark metadata only: never persist tool payloads or provider request bodies.
export const recordAutopilotContextStep = (
    steps: AutopilotContextStep[],
    step: Pick<Step, 'toolResults' | 'toolCalls'> & {
        usage: Pick<Step['usage'], 'inputTokens' | 'outputTokens'>;
    },
): void => {
    const inputTokens = step.usage.inputTokens ?? null;
    const previous = steps.length
        ? steps[steps.length - 1].cumulativeInputTokens
        : 0;
    const sizes = step.toolResults.map(({ output }) =>
        Buffer.byteLength(
            typeof output === 'string'
                ? output
                : (JSON.stringify(output) ?? ''),
            'utf8',
        ),
    );
    steps.push({
        step: steps.length + 1,
        inputTokens,
        cumulativeInputTokens:
            previous === null || inputTokens === null
                ? null
                : previous + inputTokens,
        outputTokens: step.usage.outputTokens ?? null,
        largestToolResultBytes: Math.max(0, ...sizes),
        toolResultBytes: sizes.reduce((sum, size) => sum + size, 0),
        tools: step.toolCalls.map(({ toolName }) => toolName),
    });
};
