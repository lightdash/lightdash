import {
    getSdkFeaturesForTarget,
    SDK_FEATURES,
    type SdkFix,
    type SdkFeatureTarget,
} from '@lightdash/common';
import * as sdkFeatures from '@lightdash/common';
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSdkUpgradeStatus } from './useSdkUpgradeStatus';

const ALL_FEATURES = SDK_FEATURES.map(({ key }) => key);
const MISSING_FIRST = SDK_FEATURES.slice(1).map(({ key }) => key);

const APP_FEATURES = getSdkFeaturesForTarget('data_app');
const CHART_TYPE_FEATURES = getSdkFeaturesForTarget('chart_type');
const APP_ONLY_KEYS = APP_FEATURES.filter(
    (f) => !f.appliesTo.includes('chart_type'),
).map(({ key }) => key);
const CHART_TYPE_ONLY_KEYS = CHART_TYPE_FEATURES.filter(
    (f) => !f.appliesTo.includes('data_app'),
).map(({ key }) => key);
const DATA_APP_FIX: SdkFix = {
    key: 'data-app-transport-retry',
    label: 'Reliable data-app transport',
    description: 'Retries transient host transport failures after rebuilding.',
    appliesTo: ['data_app'],
};
const CHART_TYPE_FIX: SdkFix = {
    key: 'chart-type-render-order',
    label: 'Reliable chart rendering',
    description: 'Waits for chart render context after rebuilding.',
    appliesTo: ['chart_type'],
};

const renderStatus = (
    target: SdkFeatureTarget,
    bundleKey: string | null = 'app-1:1',
) =>
    renderHook(() =>
        useSdkUpgradeStatus({
            target,
            bundleKey,
            renderedKey: bundleKey,
            isRendering: true,
        }),
    );

describe('useSdkUpgradeStatus', () => {
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('classifies manifests and resets when the classified bundle changes', () => {
        const { result, rerender } = renderHook(
            ({ bundleKey }) =>
                useSdkUpgradeStatus({
                    target: 'data_app',
                    bundleKey,
                    renderedKey: bundleKey,
                    isRendering: true,
                }),
            { initialProps: { bundleKey: 'app-1:1' } },
        );

        expect(result.current.offer.status).toBe('unknown');

        act(() => {
            result.current.onSdkManifest({
                sdkVersion: '1.6.0',
                features: MISSING_FIRST,
                fixes: [],
            });
        });
        expect(result.current.offer.status).toBe('stale');
        expect(result.current.offer.newFeatures).toEqual([SDK_FEATURES[0]]);

        act(() => {
            result.current.onSdkManifest({
                sdkVersion: '2.0.0',
                features: ALL_FEATURES,
                fixes: [],
            });
        });
        expect(result.current.offer.status).toBe('current');

        rerender({ bundleKey: 'app-1:2' });
        expect(result.current.offer.status).toBe('unknown');
    });

    it('classifies a silent bundle as legacy and offers only the applicable registry', async () => {
        vi.useFakeTimers();
        const { result } = renderStatus('chart_type');

        await act(async () => vi.advanceTimersByTime(5_000));

        expect(result.current.offer.status).toBe('legacy');
        expect(result.current.offer.candidateFeatures).toEqual(
            CHART_TYPE_FEATURES,
        );
    });

    it('keeps a chart type current when it only lacks data-app features', () => {
        expect(APP_ONLY_KEYS.length).toBeGreaterThan(0);
        const { result } = renderStatus('chart_type');

        act(() => {
            result.current.onSdkManifest({
                sdkVersion: '1.6.0',
                features: ALL_FEATURES.filter(
                    (key) => !APP_ONLY_KEYS.includes(key),
                ),
                fixes: [],
            });
        });

        expect(result.current.offer.status).toBe('current');
        expect(result.current.offer.newFeatures).toEqual([]);
        expect(result.current.offer.candidateFeatures).toEqual([]);
    });

    it('keeps a data app current when it only lacks chart-type features', () => {
        expect(CHART_TYPE_ONLY_KEYS.length).toBeGreaterThan(0);
        const { result } = renderStatus('data_app');

        act(() => {
            result.current.onSdkManifest({
                sdkVersion: '1.6.0',
                features: ALL_FEATURES.filter(
                    (key) => !CHART_TYPE_ONLY_KEYS.includes(key),
                ),
                fixes: [],
            });
        });

        expect(result.current.offer.status).toBe('current');
        expect(result.current.offer.newFeatures).toEqual([]);
    });

    it('offers an upgrade when a bundle is missing an applicable reported fix', () => {
        vi.spyOn(sdkFeatures, 'getSdkFixesForTarget').mockImplementation(
            (target) => (target === 'data_app' ? [DATA_APP_FIX] : []),
        );
        const { result } = renderStatus('data_app');

        act(() => {
            result.current.onSdkManifest({
                sdkVersion: '1.0.0',
                features: ALL_FEATURES,
                fixes: [],
            });
        });

        expect(result.current.offer.status).toBe('stale');
        expect(result.current.offer.newFeatures).toEqual([]);
        expect(result.current.offer.newFixes).toEqual([DATA_APP_FIX]);
        expect(result.current.offer.candidateFeatures).toEqual([]);
    });

    it('keeps a bundle current when it reports every applicable fix', () => {
        vi.spyOn(sdkFeatures, 'getSdkFixesForTarget').mockImplementation(
            (target) => (target === 'data_app' ? [DATA_APP_FIX] : []),
        );
        const { result } = renderStatus('data_app');

        act(() => {
            result.current.onSdkManifest({
                sdkVersion: 'latest',
                features: ALL_FEATURES,
                fixes: [DATA_APP_FIX.key],
            });
        });

        expect(result.current.offer.status).toBe('current');
    });

    it('ignores fixes that do not apply to the classified bundle', () => {
        vi.spyOn(sdkFeatures, 'getSdkFixesForTarget').mockImplementation(
            (target) => (target === 'chart_type' ? [CHART_TYPE_FIX] : []),
        );
        const { result } = renderStatus('data_app');

        act(() => {
            result.current.onSdkManifest({
                sdkVersion: '1.0.0',
                features: ALL_FEATURES,
                fixes: [],
            });
        });

        expect(result.current.offer.status).toBe('current');
        expect(result.current.offer.newFixes).toEqual([]);
        expect(result.current.offer.candidateFeatures).toEqual([]);
    });

    it('offers a chart type only the missing features it can use', () => {
        const { result } = renderStatus('chart_type');

        // An old bundle predating every viz feature and Sheets export.
        act(() => {
            result.current.onSdkManifest({
                sdkVersion: '1.0.0',
                features: ALL_FEATURES.filter(
                    (key) =>
                        !CHART_TYPE_ONLY_KEYS.includes(key) &&
                        key !== 'gsheet-export',
                ),
                fixes: [],
            });
        });

        expect(result.current.offer.status).toBe('stale');
        const offeredKeys = result.current.offer.newFeatures.map(
            ({ key }) => key,
        );
        expect(offeredKeys).toEqual(CHART_TYPE_ONLY_KEYS);
        expect(offeredKeys).not.toContain('gsheet-export');
        expect(result.current.offer.candidateFeatures).toEqual(
            result.current.offer.newFeatures,
        );
    });

    it('ignores manifests reported while another version is on screen', () => {
        const { result, rerender } = renderHook(
            ({ isRendering }) =>
                useSdkUpgradeStatus({
                    target: 'data_app',
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
                fixes: [],
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
                fixes: [],
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
                    target: 'data_app',
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
                fixes: [],
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
                target: 'data_app',
                bundleKey: 'app-1:3',
                renderedKey: 'app-1:2',
                isRendering: false,
            }),
        );

        await act(async () => vi.advanceTimersByTime(5_000));

        expect(result.current.offer.status).toBe('unknown');
    });
});
