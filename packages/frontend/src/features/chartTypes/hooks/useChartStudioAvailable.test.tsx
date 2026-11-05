import { type HealthState } from '@lightdash/common';
import { waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import useApp from '../../../providers/App/useApp';
import { renderHookWithProviders } from '../../../testing/testUtils';
import { useChartStudioAvailable } from './useChartStudioAvailable';

const healthWith = (runtimeAvailable: boolean): Partial<HealthState> => ({
    dataApps: {
        previewOrigin: null,
        sampleDataEnabled: true,
        capturesEnabled: true,
        runtimeAvailable,
    },
});

const renderAvailability = async (health: Partial<HealthState>) => {
    const { result } = renderHookWithProviders(
        () => ({
            healthLoaded: useApp().health.isSuccess,
            available: useChartStudioAvailable(),
        }),
        { health },
    );
    await waitFor(() => expect(result.current.healthLoaded).toBe(true));
    return result.current.available;
};

describe('useChartStudioAvailable', () => {
    it('is unavailable without a runtime', async () => {
        expect(await renderAvailability(healthWith(false))).toBe(false);
    });

    it('is available with a runtime', async () => {
        expect(await renderAvailability(healthWith(true))).toBe(true);
    });
});
