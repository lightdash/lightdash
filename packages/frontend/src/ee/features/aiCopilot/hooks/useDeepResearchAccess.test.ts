import { describe, expect, it } from 'vitest';
import { canStartDeepResearch } from './useDeepResearchAccess';

describe('canStartDeepResearch', () => {
    it.each([
        {
            name: 'allows authorized sessions',
            access: {
                canCreate: true,
                isDocumentsEnabled: true,
                isEnvironmentReady: true,
                isImpersonating: false,
            },
            result: true,
        },
        {
            name: 'blocks sessions without permission',
            access: {
                canCreate: false,
                isDocumentsEnabled: true,
                isEnvironmentReady: true,
                isImpersonating: false,
            },
            result: false,
        },
        {
            name: 'allows authorized Demo sessions',
            access: {
                canCreate: true,
                isDocumentsEnabled: true,
                isEnvironmentReady: true,
                isDemo: true,
                isImpersonating: false,
            },
            result: true,
        },
        {
            name: 'blocks impersonated sessions',
            access: {
                canCreate: true,
                isDocumentsEnabled: true,
                isEnvironmentReady: true,
                isImpersonating: true,
            },
            result: false,
        },
        {
            name: 'blocks sessions before the environment is ready',
            access: {
                canCreate: true,
                isDocumentsEnabled: true,
                isEnvironmentReady: false,
                isImpersonating: false,
            },
            result: false,
        },
        {
            name: 'blocks sessions without Documents',
            access: {
                canCreate: true,
                isDocumentsEnabled: false,
                isEnvironmentReady: true,
                isImpersonating: false,
            },
            result: false,
        },
    ])('$name', ({ access, result }) => {
        expect(canStartDeepResearch(access)).toBe(result);
    });
});
