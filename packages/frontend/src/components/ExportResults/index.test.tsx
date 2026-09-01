import { createConditionalFormattingConfigWithSingleColor } from '@lightdash/common';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
    type Mock,
} from 'vitest';
import ExportResults from '.';
import { renderWithProviders } from '../../testing/testUtils';

const PROJECT_UUID = 'project-uuid';
const QUERY_UUID = 'query-uuid';
const conditionalFormattings = [
    createConditionalFormattingConfigWithSingleColor('#ff0000', {
        fieldId: 'orders_count',
    }),
];

const mockApiResponse = (results: unknown) =>
    new Response(JSON.stringify({ status: 'ok', results }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });

const getScheduledDownloadBody = async () =>
    waitFor(() => {
        const scheduleRequest = (fetch as Mock).mock.calls.find(([url]) =>
            url.toString().includes('/schedule-download'),
        );
        if (!scheduleRequest) {
            throw new Error('Expected a scheduled download request');
        }
        return JSON.parse(scheduleRequest[1].body);
    });

const renderExportResults = () =>
    renderWithProviders(
        <ExportResults
            projectUuid={PROJECT_UUID}
            totalResults={1}
            getDownloadQueryUuid={vi.fn().mockResolvedValue(QUERY_UUID)}
            conditionalFormattings={conditionalFormattings}
            hideLimitSelection
        />,
    );

describe('ExportResults', () => {
    beforeEach(() => {
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(
            () => undefined,
        );
        vi.stubGlobal(
            'fetch',
            vi.fn((input: RequestInfo | URL) => {
                const url = input.toString();
                if (url.includes('/schedule-download')) {
                    return Promise.resolve(
                        mockApiResponse({ jobId: 'job-id' }),
                    );
                }
                if (url.includes('/schedulers/job/job-id/status')) {
                    return Promise.resolve(
                        mockApiResponse({
                            status: 'completed',
                            details: { fileUrl: 'about:blank' },
                        }),
                    );
                }
                throw new Error(`Unexpected request: ${url}`);
            }),
        );
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it.each([
        { valueLabel: 'Formatted', onlyRaw: false },
        { valueLabel: 'Raw', onlyRaw: true },
    ])(
        'includes conditional formatting in a non-pivoted XLSX export with $valueLabel values',
        async ({ valueLabel, onlyRaw }) => {
            const user = userEvent.setup();
            renderExportResults();

            await user.click(screen.getByText('XLSX'));
            if (valueLabel === 'Raw') {
                await user.click(screen.getByText(valueLabel));
            }
            await user.click(screen.getByTestId('chart-export-results-button'));

            await expect(getScheduledDownloadBody()).resolves.toMatchObject({
                type: 'xlsx',
                onlyRaw,
                conditionalFormattings,
            });
            await waitFor(() =>
                expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled(),
            );
        },
    );

    it('does not include conditional formatting in a CSV export', async () => {
        const user = userEvent.setup();
        renderExportResults();

        await user.click(screen.getByTestId('chart-export-results-button'));

        const body = await getScheduledDownloadBody();
        expect(body).toMatchObject({ type: 'csv' });
        expect(body).not.toHaveProperty('conditionalFormattings');
        await waitFor(() =>
            expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled(),
        );
    });
});
