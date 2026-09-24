import { createConditionalFormattingConfigWithSingleColor } from '@lightdash/common';
import { act, screen, waitFor } from '@testing-library/react';
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
import {
    getExportCellEstimate,
    DEFAULT_EXPORT_TIMEOUT_MS,
    getExportTimeoutMinutes,
    isLargeExport,
    LARGE_EXPORT_CELLS_WARNING_THRESHOLD,
} from './exportCellEstimate';
import { Limit } from './types';

const healthMock = vi.hoisted(() => ({
    query: undefined as
        | { csvCellsLimit: number; exportTimeoutMs: number }
        | undefined,
}));

vi.mock('../../hooks/health/useHealth', () => ({
    default: () => ({
        data: healthMock.query ? { query: healthMock.query } : undefined,
    }),
}));

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

    it.each(['completed', 'error'])(
        'holds walkthrough completion until the download job ends (%s)',
        async (status) => {
            const user = userEvent.setup();
            const { container } = renderExportResults();
            const button = screen.getByTestId('chart-export-results-button');
            const busy = () =>
                container.querySelector(
                    '[data-tour-anchor="csv-export-pending"]',
                );

            // A successful first export must not let a later attempt complete early.
            await user.click(button);
            await waitFor(() =>
                expect(
                    HTMLAnchorElement.prototype.click,
                ).toHaveBeenCalledOnce(),
            );
            await waitFor(() => expect(busy()).toBeNull());

            let finishJob!: (response: Response) => void;
            const pendingJob = new Promise<Response>((resolve) => {
                finishJob = resolve;
            });
            const previousFetch = fetch;
            vi.stubGlobal(
                'fetch',
                vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
                    input.toString().includes('/schedulers/job/job-id/status')
                        ? pendingJob
                        : previousFetch(input, init),
                ),
            );
            await user.click(button);
            await waitFor(() => expect(button).toBeEnabled());
            expect(busy()).not.toBeNull();
            expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce();
            await act(async () =>
                finishJob(
                    mockApiResponse({
                        status,
                        details: { fileUrl: 'about:blank' },
                    }),
                ),
            );
            if (status === 'completed') {
                await waitFor(() =>
                    expect(
                        HTMLAnchorElement.prototype.click,
                    ).toHaveBeenCalledTimes(2),
                );
                await waitFor(() => expect(busy()).toBeNull());
            } else {
                expect(
                    HTMLAnchorElement.prototype.click,
                ).toHaveBeenCalledOnce();
                expect(busy()).not.toBeNull();
            }
        },
    );

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

describe('getExportCellEstimate', () => {
    const baseArgs = {
        limit: Limit.TABLE,
        customLimit: 1,
        totalResults: 1_000_000,
        columnOrder: ['a', 'b', 'c', 'd', 'e'],
        hiddenFields: [],
        csvCellsLimit: 100_000_000,
    };

    it.each([
        { limit: Limit.TABLE, customLimit: 1, expected: 5_000_000 },
        { limit: Limit.ALL, customLimit: 1, expected: 5_000_000 },
        { limit: Limit.CUSTOM, customLimit: 200, expected: 1_000 },
        { limit: Limit.CUSTOM, customLimit: 5_000_000, expected: 5_000_000 },
    ])(
        'multiplies the $limit row count by the column count',
        ({ limit, customLimit, expected }) => {
            expect(
                getExportCellEstimate({ ...baseArgs, limit, customLimit }),
            ).toBe(expected);
        },
    );

    it('does not count hidden fields', () => {
        expect(
            getExportCellEstimate({ ...baseArgs, hiddenFields: ['a'] }),
        ).toBe(4_000_000);
    });

    it('caps the estimate at the CSV cells limit', () => {
        expect(
            getExportCellEstimate({ ...baseArgs, csvCellsLimit: 100_000 }),
        ).toBe(100_000);
    });

    it('returns null when no exported columns are known', () => {
        expect(
            getExportCellEstimate({ ...baseArgs, columnOrder: [] }),
        ).toBeNull();
        expect(
            getExportCellEstimate({
                ...baseArgs,
                hiddenFields: ['a', 'b', 'c', 'd', 'e'],
            }),
        ).toBeNull();
    });

    it('flags exports at or above the threshold', () => {
        expect(isLargeExport(null)).toBe(false);
        expect(isLargeExport(LARGE_EXPORT_CELLS_WARNING_THRESHOLD - 1)).toBe(
            false,
        );
        expect(isLargeExport(LARGE_EXPORT_CELLS_WARNING_THRESHOLD)).toBe(true);
    });

    it('rounds the export timeout to whole minutes', () => {
        expect(getExportTimeoutMinutes(600_000)).toBe(10);
        expect(getExportTimeoutMinutes(90_000)).toBe(2);
        expect(getExportTimeoutMinutes(10_000)).toBe(1);
    });

    it.each([undefined, 0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
        'falls back to the default export timeout for %s',
        (exportTimeoutMs) => {
            expect(getExportTimeoutMinutes(exportTimeoutMs)).toBe(10);
        },
    );

    it('matches the default scheduler job timeout', () => {
        expect(DEFAULT_EXPORT_TIMEOUT_MS).toBe(600_000);
    });
});

describe('ExportResults large export warning', () => {
    afterEach(() => {
        healthMock.query = undefined;
    });

    const renderLargeExport = (
        props: Partial<Parameters<typeof ExportResults>[0]>,
        exportTimeoutMs: number,
    ) => {
        healthMock.query = { csvCellsLimit: 10_000_000, exportTimeoutMs };
        return renderWithProviders(
            <ExportResults
                projectUuid={PROJECT_UUID}
                totalResults={1_000_000}
                getDownloadQueryUuid={vi.fn().mockResolvedValue(QUERY_UUID)}
                columnOrder={['a', 'b', 'c', 'd', 'e']}
                hideLimitSelection
                {...props}
            />,
        );
    };

    it('warns with the cell count and the export timeout', () => {
        renderLargeExport({}, 600_000);

        const warning = screen.getByTestId('large-export-warning');
        expect(warning).toHaveTextContent('Large export');
        expect(warning).toHaveTextContent(
            'This export is about 5 million cells. Exports must finish within 10 minutes, and one this large may take longer. Filter the results or use a scheduled delivery to Google Sheets.',
        );
        expect(screen.getByTestId('chart-export-results-button')).toBeEnabled();
    });

    it('uses the singular unit for a one-minute timeout', () => {
        renderLargeExport({}, 60_000);

        expect(screen.getByTestId('large-export-warning')).toHaveTextContent(
            'Exports must finish within 1 minute, and one this large may take longer.',
        );
    });

    it('shows the default time limit when the timeout is unknown', () => {
        renderLargeExport({}, 0);

        expect(screen.getByTestId('large-export-warning')).toHaveTextContent(
            'This export is about 5 million cells. Exports must finish within 10 minutes, and one this large may take longer. Filter the results or use a scheduled delivery to Google Sheets.',
        );
    });

    it('does not warn below the threshold', () => {
        renderLargeExport({ hiddenFields: ['a'] }, 600_000);

        expect(
            screen.queryByTestId('large-export-warning'),
        ).not.toBeInTheDocument();
    });

    it('does not warn for pivot table exports', () => {
        renderLargeExport(
            {
                pivotConfig: {
                    pivotDimensions: ['a'],
                    metricsAsRows: false,
                },
            },
            600_000,
        );

        expect(screen.getByText(/10,000,000 cells/)).toBeInTheDocument();
        expect(
            screen.queryByTestId('large-export-warning'),
        ).not.toBeInTheDocument();
    });
});
