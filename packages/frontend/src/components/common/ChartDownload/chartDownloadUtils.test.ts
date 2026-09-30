import { ChartType } from '@lightdash/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    downloadImageUrl,
    hasDashboardTileParameterOverrides,
    isSavedDataAppVizDashboardImageExportAvailable,
} from './chartDownloadUtils';

describe('downloadImageUrl', () => {
    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('downloads a cross-origin image through an object URL', async () => {
        const click = vi
            .spyOn(HTMLAnchorElement.prototype, 'click')
            .mockImplementation(() => undefined);
        const createObjectURL = vi.fn(() => 'blob:chart-image');
        const revokeObjectURL = vi.fn();
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: true,
                blob: vi.fn().mockResolvedValue(new Blob(['png'])),
            }),
        );
        vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
        vi.useFakeTimers();

        await downloadImageUrl('https://images.example/chart.png', 'My chart');

        expect(fetch).toHaveBeenCalledWith('https://images.example/chart.png');
        expect(createObjectURL).toHaveBeenCalled();
        expect(click).toHaveBeenCalledOnce();
        const link = click.mock.instances[0] as HTMLAnchorElement;
        expect(link.href).toBe('blob:chart-image');
        expect(link.download).toBe('My chart');

        vi.runAllTimers();
        expect(revokeObjectURL).toHaveBeenCalledWith('blob:chart-image');
    });
});

describe('isSavedDataAppVizDashboardImageExportAvailable', () => {
    const cleanDashboard = {
        chartType: ChartType.DATA_APP_VIZ,
        canExportData: true,
        hasDashboardFilters: false,
        hasParameterOverrides: false,
        hasUnpublishedChanges: false,
        hasDateZoom: false,
        hasDashboardColorPalette: false,
        isEmbedded: false,
        isMinimal: false,
    };

    it('allows a clean native dashboard chart', () => {
        expect(
            isSavedDataAppVizDashboardImageExportAvailable(cleanDashboard),
        ).toBe(true);
    });

    it.each([
        { canExportData: false },
        { chartType: ChartType.CARTESIAN },
        { chartType: ChartType.TABLE },
        { hasDashboardFilters: true },
        { hasParameterOverrides: true },
        { hasUnpublishedChanges: true },
        { hasDateZoom: true },
        { hasDashboardColorPalette: true },
        { isEmbedded: true },
        { isMinimal: true },
    ])('omits export when the rendered state differs: %#', (override) => {
        expect(
            isSavedDataAppVizDashboardImageExportAvailable({
                ...cleanDashboard,
                ...override,
            }),
        ).toBe(false);
    });
});

describe('hasDashboardTileParameterOverrides', () => {
    it('is false when the tile ran with its chart-saved value', () => {
        expect(
            hasDashboardTileParameterOverrides({
                usedParameterValues: { status: 'Cancelled' },
                dashboardValues: {},
                chartSavedValues: { status: 'Cancelled' },
            }),
        ).toBe(false);
    });

    it('is true when a dashboard value differs from the chart-saved value', () => {
        expect(
            hasDashboardTileParameterOverrides({
                usedParameterValues: { status: 'Completed' },
                dashboardValues: { status: 'Completed' },
                chartSavedValues: { status: 'Cancelled' },
            }),
        ).toBe(true);
    });

    it('is false when the dashboard value matches the chart-saved value', () => {
        expect(
            hasDashboardTileParameterOverrides({
                usedParameterValues: { status: 'Cancelled' },
                dashboardValues: { status: 'Cancelled' },
                chartSavedValues: { status: 'Cancelled' },
            }),
        ).toBe(false);
    });

    it('is true when a definition default replaced the chart-saved value', () => {
        expect(
            hasDashboardTileParameterOverrides({
                usedParameterValues: { currency: 'USD' },
                dashboardValues: {},
                chartSavedValues: { currency: 'EUR' },
            }),
        ).toBe(true);
    });

    it('is false when the chart saved nothing and the tile used a default', () => {
        expect(
            hasDashboardTileParameterOverrides({
                usedParameterValues: { currency: 'USD' },
                dashboardValues: {},
                chartSavedValues: {},
            }),
        ).toBe(false);
    });

    it('ignores dashboard values the tile does not use', () => {
        expect(
            hasDashboardTileParameterOverrides({
                usedParameterValues: {},
                dashboardValues: { status: 'Completed' },
                chartSavedValues: {},
            }),
        ).toBe(false);
    });
});
