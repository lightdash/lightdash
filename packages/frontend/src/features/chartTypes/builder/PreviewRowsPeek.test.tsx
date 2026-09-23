import { type DataAppVizSchema } from '@lightdash/common';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { buildSampleVizContext } from '../utils/sampleVizContext';
import PreviewRowsPeek from './PreviewRowsPeek';
import { type SavedChartSourceControls } from './savedChartSource';

const schema: DataAppVizSchema = {
    fields: [
        {
            name: 'month',
            label: 'Month',
            type: 'dimension',
            required: true,
        },
        {
            name: 'revenue',
            label: 'Revenue',
            type: 'metric',
            required: true,
        },
    ],
    configOptions: [],
    colorPalette: null,
};

const source = (
    overrides: Partial<SavedChartSourceControls> = {},
): SavedChartSourceControls => ({
    sourceIdentity: null,
    attached: null,
    previewSource: 'sample',
    includeRows: false,
    setIncludeRows: vi.fn(),
    attach: vi.fn(),
    detach: vi.fn(),
    viewRows: vi.fn(),
    retry: vi.fn(),
    ...overrides,
});

describe('PreviewRowsPeek', () => {
    it('uses a native table with mapped headers and three preview body rows', async () => {
        const context = buildSampleVizContext(schema);
        renderWithProviders(
            <PreviewRowsPeek
                source={source()}
                fields={schema.fields}
                context={context}
            />,
        );

        expect(
            screen.getByRole('heading', { name: 'Sample data' }),
        ).toBeVisible();
        expect(screen.getByText('12 rows · 1 value')).toBeVisible();

        const table = screen.getByRole('table');
        expect(table.tagName).toBe('TABLE');
        expect(
            within(table).getByRole('columnheader', { name: 'Month' }),
        ).toBeVisible();
        expect(
            within(table).getByRole('columnheader', { name: 'Revenue' }),
        ).toBeVisible();
        expect(within(table).getAllByRole('row')).toHaveLength(4);
        expect(within(table).getAllByRole('cell')).toHaveLength(6);

        await userEvent.click(screen.getByRole('button', { name: 'View all' }));

        expect(
            await screen.findByRole('dialog', { name: 'Sample data' }),
        ).toBeVisible();
    });

    it.each(['chart', 'explore'] as const)(
        'shows pivoted %s results with series headers and populated cells',
        (previewSource) => {
            const pivotSchema: DataAppVizSchema = {
                ...schema,
                fields: [
                    ...schema.fields,
                    {
                        name: 'status',
                        label: 'Status',
                        type: 'series',
                        required: true,
                    },
                ],
            };
            const context = buildSampleVizContext(pivotSchema);
            const pivotColumn =
                context.pivotDetails!.valuesColumns[0].pivotColumnName;
            context.rows[0][pivotColumn] = {
                value: { raw: null, formatted: '∅' },
            };
            context.rows[1][pivotColumn] = {
                value: { raw: null, formatted: '' },
            };
            delete context.rows[2][pivotColumn];
            renderWithProviders(
                <PreviewRowsPeek
                    source={source({
                        previewSource,
                        attached: {
                            uuid: 'chart-orders',
                            status: 'ready',
                            chartName: 'Orders',
                            spaceName: null,
                            rowCount: 36,
                            columns: [],
                            ranAt: null,
                            message: null,
                        },
                    })}
                    fields={pivotSchema.fields}
                    context={context}
                />,
            );
            const table = screen.getByRole('table');
            expect(
                within(table).getByRole('columnheader', {
                    name: 'Revenue · Series A',
                }),
            ).toBeVisible();
            expect(
                within(table).queryByRole('columnheader', { name: 'Status' }),
            ).not.toBeInTheDocument();
            const bodyRows = within(table).getAllByRole('row').slice(1);
            expect(bodyRows).toHaveLength(3);
            const columns = context.pivotDetails!.valuesColumns;
            for (const [index, row] of bodyRows.entries()) {
                expect(
                    within(row)
                        .getAllByRole('cell')
                        .map((cell) => cell.textContent),
                ).toEqual([
                    context.rows[index].sample_month.value.formatted,
                    ...columns.map(
                        (column) =>
                            context.rows[index][column.pivotColumnName]?.value
                                .formatted ?? '',
                    ),
                ]);
            }
            expect(screen.getByText('12 pivoted rows')).toBeVisible();
        },
    );

    it('keeps the ready saved-chart summary and View all action', async () => {
        const context = buildSampleVizContext(schema);
        const viewRows = vi.fn();
        renderWithProviders(
            <PreviewRowsPeek
                source={source({
                    previewSource: 'chart',
                    attached: {
                        uuid: 'chart-orders',
                        status: 'ready',
                        chartName: 'Orders',
                        spaceName: 'Sales',
                        rowCount: 6,
                        columns: [],
                        ranAt: null,
                        message: null,
                    },
                    viewRows,
                })}
                fields={schema.fields}
                context={context}
            />,
        );

        expect(
            screen.getByRole('heading', { name: 'Query results' }),
        ).toBeVisible();
        expect(screen.getByText('6 rows')).toBeVisible();

        await userEvent.click(screen.getByRole('button', { name: 'View all' }));

        expect(viewRows).toHaveBeenCalledOnce();
    });
});
