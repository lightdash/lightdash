import { TimeFrames } from '@lightdash/common';
import { configureStore } from '@reduxjs/toolkit';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../testing/testUtils';
import { metricsCatalogSlice } from '../../store/metricsCatalogSlice';
import { MetricExploreDatePicker } from './MetricExploreDatePicker';

describe('compact metric date picker', () => {
    it('keeps preset changes pending until Apply and discards them on Cancel', async () => {
        const onChange = vi.fn();
        const store = configureStore({
            reducer: { metricsCatalog: metricsCatalogSlice.reducer },
        });
        renderWithProviders(
            <Provider store={store}>
                <MetricExploreDatePicker
                    dateRange={[new Date(2020, 0, 1), new Date(2020, 1, 29)]}
                    onChange={onChange}
                    timeInterval={TimeFrames.MONTH}
                    timeDimensionBaseField={undefined}
                    setTimeDimensionOverride={vi.fn()}
                    onTimeIntervalChange={vi.fn()}
                    showTimeDimensionIntervalPicker={false}
                    isFetching={false}
                />
            </Provider>,
        );

        const rangeButton = screen.getByRole('button', { name: /2020/ });
        await userEvent.click(rangeButton);
        await userEvent.click(
            screen.getByRole('button', { name: 'Past 6 months' }),
        );
        expect(onChange).not.toHaveBeenCalled();
        await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(onChange).not.toHaveBeenCalled();

        await userEvent.click(rangeButton);
        expect(screen.getByLabelText('Date range start')).toHaveValue(
            'Jan 1, 2020',
        );
        await userEvent.click(
            screen.getByRole('button', { name: 'Past 6 months' }),
        );
        await userEvent.click(screen.getByRole('button', { name: 'Apply' }));
        expect(onChange).toHaveBeenCalledExactlyOnceWith([
            expect.any(Date),
            expect.any(Date),
        ]);
    });
});
