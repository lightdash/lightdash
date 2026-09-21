import { ChartType } from '@lightdash/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    downloadImageUrl,
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
        hasRuntimeParameters: false,
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
        { hasDashboardFilters: true },
        { hasRuntimeParameters: true },
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
