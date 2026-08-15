import { describe, expect, it } from 'vitest';
import { getMergeSetupProgress } from './getMergeSetupProgress';

describe('getMergeSetupProgress', () => {
    it.each([
        [
            {
                hasExplore: false,
                dimensionCount: 0,
                metricCount: 0,
                hasJoin: false,
            },
            1,
        ],
        [
            {
                hasExplore: true,
                dimensionCount: 0,
                metricCount: 0,
                hasJoin: false,
            },
            2,
        ],
        [
            {
                hasExplore: true,
                dimensionCount: 1,
                metricCount: 1,
                hasJoin: false,
            },
            3,
        ],
        [
            {
                hasExplore: true,
                dimensionCount: 1,
                metricCount: 1,
                hasJoin: true,
            },
            4,
        ],
    ] as const)('returns step %s', (input, expectedStep) => {
        expect(getMergeSetupProgress(input).step).toBe(expectedStep);
    });
});
