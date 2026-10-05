import { act, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHookWithProviders } from '../../testing/testUtils';
import { useEgressIpCheckpoint } from './useEgressIpCheckpoint';

const flag = vi.hoisted(() => ({ enabled: true }));

vi.mock('../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({ data: { enabled: flag.enabled } }),
}));

const renderCheckpoint = async (staticIp: string) => {
    const view = renderHookWithProviders(() => useEgressIpCheckpoint(), {
        health: { staticIp },
    });
    if (staticIp !== '') {
        await waitFor(() => expect(view.result.current.ips).not.toEqual([]));
    }
    return view;
};

describe('useEgressIpCheckpoint', () => {
    afterEach(() => {
        flag.enabled = true;
    });

    it('continues at once when no IP address is configured', async () => {
        const { result } = await renderCheckpoint('');
        const onContinue = vi.fn();

        act(() => result.current.guard(onContinue));

        expect(onContinue).toHaveBeenCalledTimes(1);
        expect(result.current.isOpen).toBe(false);
    });

    it('waits for the allowlist confirmation, and asks again on the next submit', async () => {
        const { result } = await renderCheckpoint('35.1.1.1');
        const onContinue = vi.fn();

        act(() => result.current.guard(onContinue));
        expect(result.current.isOpen).toBe(true);

        act(() => result.current.confirm());
        expect(onContinue).not.toHaveBeenCalled();

        act(() => result.current.setIsAllowlistConfirmed(true));
        act(() => result.current.confirm());
        expect(onContinue).toHaveBeenCalledTimes(1);
        expect(result.current.isOpen).toBe(false);

        act(() => result.current.guard(onContinue));
        expect(result.current.isOpen).toBe(true);
        expect(result.current.isAllowlistConfirmed).toBe(true);
        expect(onContinue).toHaveBeenCalledTimes(1);
    });

    it('does not continue when the user goes back', async () => {
        const { result } = await renderCheckpoint('35.1.1.1');
        const onContinue = vi.fn();

        act(() => result.current.guard(onContinue));
        act(() => result.current.back());

        expect(onContinue).not.toHaveBeenCalled();
        expect(result.current.isOpen).toBe(false);
    });

    it('continues at once when the kill switch is on', async () => {
        const { result, rerender } = await renderCheckpoint('35.1.1.1');
        const onContinue = vi.fn();

        flag.enabled = false;
        rerender(undefined);
        act(() => result.current.guard(onContinue));

        expect(onContinue).toHaveBeenCalledTimes(1);
        expect(result.current.isOpen).toBe(false);
    });
});
