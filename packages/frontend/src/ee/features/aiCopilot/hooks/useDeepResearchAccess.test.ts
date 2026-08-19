import { describe, expect, it } from 'vitest';
import { canStartDeepResearch } from './useDeepResearchAccess';

describe('canStartDeepResearch', () => {
    it.each([
        {
            canCreate: true,
            isEnvironmentReady: true,
            isDemo: false,
            isImpersonating: false,
            result: true,
        },
        {
            canCreate: false,
            isEnvironmentReady: true,
            isDemo: false,
            isImpersonating: false,
            result: false,
        },
        {
            canCreate: true,
            isEnvironmentReady: true,
            isDemo: true,
            isImpersonating: false,
            result: false,
        },
        {
            canCreate: true,
            isEnvironmentReady: true,
            isDemo: false,
            isImpersonating: true,
            result: false,
        },
        {
            canCreate: true,
            isEnvironmentReady: false,
            isDemo: false,
            isImpersonating: false,
            result: false,
        },
    ])('returns $result for %#', ({ result, ...access }) => {
        expect(canStartDeepResearch(access)).toBe(result);
    });
});
