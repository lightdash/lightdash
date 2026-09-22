import { type DataAppVizSchema } from '@lightdash/common';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { buildSampleVizContext } from '../utils/sampleVizContext';
import { ChartTypeSampleData } from './ChartTypeSampleData';

const flatSchema: DataAppVizSchema = {
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

describe('ChartTypeSampleData', () => {
    it('opens flat sample values in a modal and restores focus after Escape', async () => {
        const context = buildSampleVizContext(flatSchema);
        renderWithProviders(<ChartTypeSampleData context={context} />);

        const launcher = screen.getByRole('button', {
            name: 'View sample data · 6 rows',
        });
        expect(launcher).toBeVisible();
        expect(screen.queryByRole('table')).not.toBeInTheDocument();

        const user = userEvent.setup();
        await user.tab();
        await user.keyboard('{Enter}');

        const dialog = await screen.findByRole('dialog', {
            name: 'Sample data',
        });
        expect(
            within(dialog).getByText(
                'Generated example values used in this preview.',
            ),
        ).toBeVisible();
        expect(
            within(dialog).getByRole('region', {
                name: 'Generated sample data rows',
            }),
        ).toHaveAttribute('tabindex', '0');
        expect(
            within(dialog).getByRole('table', {
                name: 'Generated sample data',
            }),
        ).toBeVisible();
        expect(
            within(dialog).getByRole('columnheader', { name: 'Month' }),
        ).toBeVisible();
        expect(
            within(dialog).getByRole('columnheader', { name: 'Revenue' }),
        ).toBeVisible();
        expect(
            within(dialog).getByText(
                context.rows[0].sample_month.value.formatted,
            ),
        ).toBeVisible();
        expect(
            within(dialog).getByText(
                context.rows[0].sample_revenue.value.formatted,
            ),
        ).toBeVisible();

        await user.keyboard('{Escape}');
        await waitFor(() =>
            expect(
                screen.queryByRole('dialog', { name: 'Sample data' }),
            ).not.toBeInTheDocument(),
        );
        await waitFor(() => expect(launcher).toHaveFocus());
    });

    it('uses pivot metadata for every expanded metric and series column', async () => {
        const context = buildSampleVizContext({
            ...flatSchema,
            fields: [
                flatSchema.fields[0],
                { ...flatSchema.fields[1], multiple: true },
                {
                    name: 'series',
                    label: 'Region',
                    type: 'series',
                    required: false,
                },
            ],
        });
        renderWithProviders(<ChartTypeSampleData context={context} />);
        const user = userEvent.setup();
        await user.click(
            screen.getByRole('button', { name: /view sample data/i }),
        );

        const pivotColumns = context.pivotDetails?.valuesColumns;
        if (!pivotColumns) throw new Error('Expected pivoted sample data');
        const dialog = await screen.findByRole('dialog', {
            name: 'Sample data',
        });
        await waitFor(() =>
            expect(
                within(dialog).getByRole('columnheader', { name: 'Month' }),
            ).toBeVisible(),
        );
        for (const column of pivotColumns) {
            const expectedHeader = `${context.fields[column.referenceField].label} · ${column.pivotValues.map((value) => value.formatted).join(' · ')}`;
            expect(
                within(dialog).getByRole('columnheader', {
                    name: expectedHeader,
                }),
            ).toBeVisible();
            expect(
                within(dialog).getAllByText(
                    context.rows[0][column.pivotColumnName].value.formatted,
                ),
            ).not.toHaveLength(0);
        }
    });

    it.each(['scalar', 'undefined'] as const)(
        'normalizes %s pivot index metadata',
        async (variant) => {
            const context = buildSampleVizContext({
                ...flatSchema,
                fields: [
                    ...flatSchema.fields,
                    {
                        name: 'series',
                        label: 'Region',
                        type: 'series',
                        required: false,
                    },
                ],
            });
            if (!context.pivotDetails) throw new Error('Expected pivoted data');
            const indexColumn = context.pivotDetails.indexColumn;
            const normalizedContext = {
                ...context,
                pivotDetails: {
                    ...context.pivotDetails,
                    indexColumn:
                        variant === 'scalar'
                            ? Array.isArray(indexColumn)
                                ? indexColumn[0]
                                : indexColumn
                            : undefined,
                },
            };
            renderWithProviders(
                <ChartTypeSampleData context={normalizedContext} />,
            );
            const user = userEvent.setup();
            await user.click(
                screen.getByRole('button', { name: /view sample data/i }),
            );

            const dialog = await screen.findByRole('dialog', {
                name: 'Sample data',
            });
            expect(
                within(dialog).getByRole('table', {
                    name: 'Generated sample data',
                }),
            ).toBeVisible();
            expect(
                within(dialog).getByRole('columnheader', {
                    name: 'Revenue · Series A',
                }),
            ).toBeVisible();
        },
    );

    it('hides an empty sample context with no columns', () => {
        renderWithProviders(
            <ChartTypeSampleData
                context={buildSampleVizContext({
                    fields: [],
                    configOptions: [],
                    colorPalette: null,
                })}
            />,
        );

        expect(
            screen.queryByRole('button', { name: /sample data/i }),
        ).toBeNull();
    });
});
