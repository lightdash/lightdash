import {
    FilterOperator,
    type ApiExportChartImageRequest,
} from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getMantineThemeOverride } from '../../../theme';

const mocks = vi.hoisted(() => ({
    lightdashApiStream: vi.fn(),
    showToastApiError: vi.fn(),
    showToastError: vi.fn(),
}));

vi.mock('../../../api', () => ({
    lightdashApiStream: mocks.lightdashApiStream,
}));

vi.mock('../../../hooks/toaster/useToaster', () => ({
    default: () => ({
        showToastApiError: mocks.showToastApiError,
        showToastError: mocks.showToastError,
    }),
}));

import HeadlessChartImageDownload from './HeadlessChartImageDownload';

const renderDownload = (dashboardContext?: ApiExportChartImageRequest) =>
    render(
        <MantineProvider env="test" theme={getMantineThemeOverride('light')}>
            <HeadlessChartImageDownload
                chartUuid="chart-uuid"
                projectUuid="project-uuid"
                dashboardContext={dashboardContext}
            />
        </MantineProvider>,
    );

describe('HeadlessChartImageDownload', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.clearAllMocks();
    });
    it('downloads through a same-origin permissioned endpoint without reading a redirected storage URL', async () => {
        mocks.lightdashApiStream.mockResolvedValueOnce({
            blob: () =>
                Promise.resolve(new Blob(['png'], { type: 'image/png' })),
        } as Response);
        const fetchMock = vi.spyOn(window, 'fetch');
        const createObjectURL = vi
            .spyOn(URL, 'createObjectURL')
            .mockReturnValue('blob:chart-image');
        const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL');
        const click = vi
            .spyOn(HTMLAnchorElement.prototype, 'click')
            .mockImplementation(() => undefined);

        renderDownload();
        fireEvent.click(screen.getByRole('button', { name: 'Download image' }));

        await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
        expect(mocks.lightdashApiStream).toHaveBeenCalledWith({
            url: '/saved/chart-uuid/export-image?projectUuid=project-uuid',
            method: 'POST',
            body: undefined,
        });
        expect(fetchMock).not.toHaveBeenCalled();

        click.mockRestore();
        fetchMock.mockRestore();
        createObjectURL.mockRestore();
        revokeObjectURL.mockRestore();
    });

    it('requests the permissioned saved-chart export and downloads its image', async () => {
        mocks.lightdashApiStream.mockResolvedValueOnce({
            blob: () => Promise.resolve(new Blob()),
        } as Response);
        const createObjectURL = vi
            .spyOn(URL, 'createObjectURL')
            .mockReturnValue('blob:chart-image');
        const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL');
        const click = vi
            .spyOn(HTMLAnchorElement.prototype, 'click')
            .mockImplementation(() => undefined);

        renderDownload();
        fireEvent.click(screen.getByRole('button', { name: 'Download image' }));

        await waitFor(() => {
            expect(mocks.lightdashApiStream).toHaveBeenCalledWith({
                url: '/saved/chart-uuid/export-image?projectUuid=project-uuid',
                method: 'POST',
                body: undefined,
            });
        });
        expect(click).toHaveBeenCalledTimes(1);
        click.mockRestore();
        createObjectURL.mockRestore();
        revokeObjectURL.mockRestore();
    });

    it('shows the server error when export permission or capture fails', async () => {
        mocks.lightdashApiStream.mockRejectedValueOnce(new Error('Forbidden'));

        renderDownload();
        fireEvent.click(screen.getByRole('button', { name: 'Download image' }));

        await waitFor(() => {
            expect(mocks.showToastError).toHaveBeenCalledWith({
                title: 'Unable to export chart image',
                subtitle: 'Forbidden',
            });
        });
    });

    it('sends the visible dashboard tile context to the headless export', async () => {
        mocks.lightdashApiStream.mockResolvedValueOnce({
            blob: () => Promise.resolve(new Blob()),
        } as Response);
        vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:chart-image');
        vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(
            () => undefined,
        );

        renderDownload({
            dashboardUuid: 'dashboard-uuid',
            dashboardTileUuid: 'tile-uuid',
            dashboardFilters: {
                dimensions: [
                    {
                        id: 'filter-uuid',
                        target: {
                            fieldId: 'orders_status',
                            tableName: 'orders',
                        },
                        operator: FilterOperator.EQUALS,
                        values: ['completed'],
                        label: 'Status',
                    },
                ],
                metrics: [],
                tableCalculations: [],
            },
            parameters: { currency: 'EUR' },
            dateZoomGranularity: 'Month',
            dateZoomControlGranularities: { 'control-uuid': 'Week' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Download image' }));

        await waitFor(() => {
            expect(mocks.lightdashApiStream).toHaveBeenCalledWith(
                expect.objectContaining({
                    body: JSON.stringify({
                        dashboardUuid: 'dashboard-uuid',
                        dashboardTileUuid: 'tile-uuid',
                        dashboardFilters: {
                            dimensions: [
                                {
                                    id: 'filter-uuid',
                                    target: {
                                        fieldId: 'orders_status',
                                        tableName: 'orders',
                                    },
                                    operator: FilterOperator.EQUALS,
                                    values: ['completed'],
                                    label: 'Status',
                                },
                            ],
                            metrics: [],
                            tableCalculations: [],
                        },
                        parameters: { currency: 'EUR' },
                        dateZoomGranularity: 'Month',
                        dateZoomControlGranularities: {
                            'control-uuid': 'Week',
                        },
                    }),
                }),
            );
        });
    });
});
