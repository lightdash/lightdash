import { CartesianSeriesType, ChartType } from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../testing/testUtils';
import { withVisualizationStore } from '../../../../testing/visualizationStore';
import { Axes } from './index';

vi.mock('./AxesLabelSections', () => ({
    AxesLabelSections: () => null,
}));

const label = 'Connect null values in line series';

const renderAxes = (types: CartesianSeriesType[], connectNulls?: boolean) => {
    const Wrapper = withVisualizationStore({
        type: ChartType.CARTESIAN,
        config: {
            layout: {
                xField: 'date',
                yField: ['value_0', 'value_1'],
                connectNulls,
            },
            eChartsConfig: {
                series: types.map((type, index) => ({
                    type,
                    encode: {
                        xRef: { field: 'date' },
                        yRef: { field: `value_${index}` },
                    },
                    yAxisIndex: 0,
                })),
            },
        },
    });
    renderWithProviders(
        <Wrapper>
            <Axes itemsMap={undefined} />
        </Wrapper>,
    );
};

describe('Axes connect null values', () => {
    it('can turn off null connections for a bar-first mixed chart', async () => {
        renderAxes([CartesianSeriesType.BAR, CartesianSeriesType.LINE]);
        const control = screen.getByRole('checkbox', { name: label });
        expect(control).toBeChecked();
        await userEvent.setup().click(control);
        expect(control).not.toBeChecked();
    });

    it.each([CartesianSeriesType.LINE, CartesianSeriesType.AREA])(
        'shows the saved setting for a %s series',
        (type) => {
            renderAxes([type], false);
            expect(
                screen.getByRole('checkbox', { name: label }),
            ).not.toBeChecked();
        },
    );

    it('does not show the control for bar and scatter series', () => {
        renderAxes([CartesianSeriesType.BAR, CartesianSeriesType.SCATTER]);
        expect(
            screen.queryByRole('checkbox', { name: label }),
        ).not.toBeInTheDocument();
    });
});
