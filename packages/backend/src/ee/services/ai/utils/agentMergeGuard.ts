import { AI_AGENT_MERGE_REFUSAL, ParameterError } from '@lightdash/common';
import isEqual from 'lodash/isEqual';

const getField = (value: unknown, key: string): unknown =>
    value !== null && typeof value === 'object' && key in value
        ? (value as Record<string, unknown>)[key]
        : undefined;

// The agent may keep a stored merge unchanged but never add or change one.
export const assertAgentKeepsChartMerge = (next: unknown, current: unknown) => {
    const nextMerge = getField(next, 'merge');
    if (nextMerge != null && !isEqual(nextMerge, getField(current, 'merge'))) {
        throw new ParameterError(AI_AGENT_MERGE_REFUSAL);
    }
};

export const assertAgentKeepsDocumentMerges = (
    next: Record<string, unknown>,
    current: Record<string, unknown>,
) =>
    Object.entries(next).forEach(([chartId, documentChart]) =>
        assertAgentKeepsChartMerge(
            getField(documentChart, 'chart'),
            Object.hasOwn(current, chartId)
                ? getField(current[chartId], 'chart')
                : undefined,
        ),
    );
