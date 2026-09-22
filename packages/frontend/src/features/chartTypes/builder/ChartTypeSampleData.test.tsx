import { type DataAppVizSchema } from '@lightdash/common';
import { fireEvent, screen, waitFor } from '@testing-library/react';
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
    it('keeps flat sample values collapsed until requested', async () => {
        const context = buildSampleVizContext(flatSchema);
        renderWithProviders(<ChartTypeSampleData context={context} />);

        expect(screen.getByText('View sample data · 6 rows')).toBeVisible();
        expect(screen.queryByRole('table')).not.toBeInTheDocument();

        const user = userEvent.setup();
        await user.tab();
        await user.keyboard('{Enter}');

        await waitFor(() =>
            expect(
                screen.getByText(
                    'Generated example values used in this preview.',
                ),
            ).toBeVisible(),
        );
        expect(
            screen.getByRole('columnheader', { name: 'Month' }),
        ).toBeVisible();
        expect(
            screen.getByRole('columnheader', { name: 'Revenue' }),
        ).toBeVisible();
        expect(
            screen.getByText(context.rows[0].sample_month.value.formatted),
        ).toBeVisible();
        expect(
            screen.getByText(context.rows[0].sample_revenue.value.formatted),
        ).toBeVisible();
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
        fireEvent.click(
            screen.getByRole('button', { name: /view sample data/i }),
        );

        const pivotColumns = context.pivotDetails?.valuesColumns;
        if (!pivotColumns) throw new Error('Expected pivoted sample data');
        await waitFor(() =>
            expect(
                screen.getByRole('columnheader', { name: 'Month' }),
            ).toBeVisible(),
        );
        for (const column of pivotColumns) {
            const expectedHeader = `${context.fields[column.referenceField].label} · ${column.pivotValues.map((value) => value.formatted).join(' · ')}`;
            expect(
                screen.getByRole('columnheader', { name: expectedHeader }),
            ).toBeVisible();
            expect(
                screen.getAllByText(
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
            fireEvent.click(
                screen.getByRole('button', { name: /view sample data/i }),
            );

            await waitFor(() =>
                expect(screen.getByRole('table')).toBeVisible(),
            );
            expect(
                screen.getByRole('columnheader', {
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
