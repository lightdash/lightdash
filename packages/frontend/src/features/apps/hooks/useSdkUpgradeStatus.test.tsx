import { SDK_FEATURES } from '@lightdash/common';
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSdkUpgradeStatus } from './useSdkUpgradeStatus';

const ALL_FEATURES = SDK_FEATURES.map(({ key }) => key);
const MISSING_FIRST = SDK_FEATURES.slice(1).map(({ key }) => key);

describe('useSdkUpgradeStatus', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('classifies manifests and resets when the classified bundle changes', () => {
        const { result, rerender } = renderHook(
            ({ bundleKey }) =>
                useSdkUpgradeStatus({
                    bundleKey,
                    renderedKey: bundleKey,
                    isRendering: true,
                }),
            { initialProps: { bundleKey: 'app-1:1' } },
        );

        expect(result.current.offer.status).toBe('unknown');

        act(() => {
            result.current.onSdkManifest({
                sdkVersion: '1.0.0',
                features: MISSING_FIRST,
            });
        });
        expect(result.current.offer.status).toBe('stale');
        expect(result.current.offer.newFeatures).toEqual([SDK_FEATURES[0]]);

        act(() => {
            result.current.onSdkManifest({
                sdkVersion: '2.0.0',
                features: ALL_FEATURES,
            });
        });
        expect(result.current.offer.status).toBe('current');

        rerender({ bundleKey: 'app-1:2' });
        expect(result.current.offer.status).toBe('unknown');
    });

    it('classifies a silent bundle as legacy', async () => {
        vi.useFakeTimers();
        const { result } = renderHook(() =>
            useSdkUpgradeStatus({
                bundleKey: 'app-1:1',
                renderedKey: 'app-1:1',
                isRendering: true,
            }),
        );

        await act(async () => vi.advanceTimersByTime(5_000));

        expect(result.current.offer.status).toBe('legacy');
        expect(result.current.offer.candidateFeatures).toEqual(SDK_FEATURES);
    });

    it('ignores manifests reported while another version is on screen', () => {
        const { result, rerender } = renderHook(
            ({ isRendering }) =>
                useSdkUpgradeStatus({
                    bundleKey: 'app-1:3',
                    renderedKey: 'app-1:3',
                    isRendering,
                }),
            { initialProps: { isRendering: true } },
        );

        act(() => {
            result.current.onSdkManifest({
                sdkVersion: '2.0.0',
                features: ALL_FEATURES,
            });
        });
        expect(result.current.offer.status).toBe('current');

        // The user views an older version: its bundle reports a smaller
        // feature set, but the offer still describes the latest ready one.
        rerender({ isRendering: false });
        act(() => {
            result.current.onSdkManifest({
                sdkVersion: '1.0.0',
                features: MISSING_FIRST,
            });
        });

        expect(result.current.offer.status).toBe('current');
        expect(result.current.offer.reportedSdkVersion).toBe('2.0.0');
        // The bundle actually on screen is still reported for consumers that
        // ask what the previewed app can do.
        expect(result.current.renderedManifest?.sdkVersion).toBe('1.0.0');
    });

    it('clears the rendered manifest when the bundle on screen changes', () => {
        const { result, rerender } = renderHook(
            ({ renderedKey }) =>
                useSdkUpgradeStatus({
                    bundleKey: 'app-1:3',
                    renderedKey,
                    isRendering: renderedKey === 'app-1:3',
                }),
            { initialProps: { renderedKey: 'app-1:3' } },
        );

        act(() => {
            result.current.onSdkManifest({
                sdkVersion: '2.0.0',
                features: ALL_FEATURES,
            });
        });
        expect(result.current.renderedManifest?.sdkVersion).toBe('2.0.0');

        // Pinning a silent legacy version must not inherit the previous
        // bundle's capabilities.
        rerender({ renderedKey: 'app-1:1' });
        expect(result.current.renderedManifest).toBeNull();
        expect(result.current.offer.status).toBe('current');
    });

    it('does not time out into legacy while another version is on screen', async () => {
        vi.useFakeTimers();
        const { result } = renderHook(() =>
            useSdkUpgradeStatus({
                bundleKey: 'app-1:3',
                renderedKey: 'app-1:2',
                isRendering: false,
            }),
        );

        await act(async () => vi.advanceTimersByTime(5_000));

        expect(result.current.offer.status).toBe('unknown');
    });
});
