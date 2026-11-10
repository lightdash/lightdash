import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useAppViewOutcomes } from './useAppViewOutcomes';

const { api } = vi.hoisted(() => ({
    api: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../../providers/LightdashApi/useLightdashApi', () => ({
    useLightdashApi: () => api,
}));

const navigationId = '11111111-1111-4111-8111-111111111111';
const nextNavigationId = '22222222-2222-4222-8222-222222222222';
const props = {
    projectUuid: 'project',
    appUuid: 'app',
    src: 'https://preview.example/api/apps/app/versions/2/t/token/',
    previewToken: 'token',
    navigationId,
};

describe('useAppViewOutcomes', () => {
    beforeEach(() => api.mockReset().mockResolvedValue(undefined));

    it('deduplicates observations without treating a token renewal as navigation', () => {
        const { result, rerender } = renderHook(useAppViewOutcomes, {
            initialProps: props,
        });
        act(() => result.current('sdk_started', navigationId));
        rerender({ ...props, previewToken: 'renewed-token' });
        act(() => result.current('sdk_started', navigationId));
        act(() => result.current('runtime_error', navigationId));
        act(() => result.current('runtime_error', navigationId));
        expect(api).toHaveBeenCalledTimes(2);
        expect(api.mock.calls[1][0]).toEqual({
            method: 'POST',
            sensitive: true,
            url: '/ee/projects/project/apps/app/versions/2/view-outcome',
            body: JSON.stringify({
                previewToken: 'renewed-token',
                navigationId,
                outcome: 'runtime_error',
            }),
        });
    });

    it('ignores old and uncorrelated bundles and starts fresh on navigation', () => {
        const { result, rerender } = renderHook(useAppViewOutcomes, {
            initialProps: props,
        });
        act(() => result.current('sdk_started', undefined));
        act(() => result.current('sdk_started', nextNavigationId));
        expect(api).not.toHaveBeenCalled();
        act(() => result.current('sdk_started', navigationId));
        rerender({ ...props, navigationId: nextNavigationId });
        act(() => result.current('runtime_error', navigationId));
        act(() => result.current('sdk_started', nextNavigationId));
        expect(api).toHaveBeenCalledTimes(2);
    });

    it('contains both synchronous and asynchronous telemetry failures', async () => {
        api.mockImplementationOnce(() => {
            throw new Error('unavailable');
        }).mockRejectedValueOnce(new Error('offline'));
        const { result } = renderHook(() => useAppViewOutcomes(props));
        expect(() => {
            act(() => result.current('sdk_started', navigationId));
            act(() => result.current('runtime_error', navigationId));
        }).not.toThrow();
        await Promise.resolve();
    });
});
