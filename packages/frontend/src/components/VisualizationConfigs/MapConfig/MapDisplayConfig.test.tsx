import { ChartType, MapChartType } from '@lightdash/common';
import { act, fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
    selectMapEditor,
    useVisualizationSelector,
} from '../../../features/visualization/store';
import { renderWithProviders } from '../../../testing/testUtils';
import { withVisualizationStore } from '../../../testing/visualizationStore';
import { Display } from './MapDisplayConfig';

const StoredColors = () => {
    const colorRange = useVisualizationSelector(
        (state) => selectMapEditor(state).colorRange,
    );
    return <output>{colorRange.join(',')}</output>;
};

const StoredDisplay = () => {
    const [Store] = useState(() =>
        withVisualizationStore(
            {
                type: ChartType.MAP,
                config: {
                    locationType: MapChartType.SCATTER,
                    valueFieldId: 'orders_revenue',
                    colorRange: ['#000001', '#000002', '#000003'],
                },
            },
            {
                itemsMap: {
                    orders_revenue: {
                        name: 'revenue',
                        displayName: 'Revenue',
                        sql: '1',
                    },
                },
            },
        ),
    );
    return (
        <Store>
            <Display />
            <StoredColors />
        </Store>
    );
};

const typeStop = (label: string, hex: string) => {
    fireEvent.click(screen.getByRole('button', { name: label }));
    const inputs = screen.getAllByPlaceholderText(/Type in a custom/);
    fireEvent.change(inputs[inputs.length - 1], { target: { value: hex } });
};

const storedColors = () => screen.getByRole('status').textContent;

describe('Map colour range', () => {
    it('keeps two quick edits to different stops', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        renderWithProviders(<StoredDisplay />);
        typeStop('Low color', '123456');
        typeStop('High color', 'abcdef');
        await act(() => vi.advanceTimersByTimeAsync(500));
        expect(storedColors()).toBe('#123456,#000002,#abcdef');
        vi.useRealTimers();
    });

    it('commits a pending edit to its stop before adding one', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        renderWithProviders(<StoredDisplay />);
        typeStop('High color', 'abcdef');
        fireEvent.click(screen.getByRole('button', { name: 'Add color' }));
        await act(() => vi.advanceTimersByTimeAsync(500));
        expect(storedColors()).toBe('#000001,#000002,#fab005,#abcdef');
        vi.useRealTimers();
    });

    it('commits a pending edit to its stop before removing one', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        renderWithProviders(<StoredDisplay />);
        typeStop('High color', 'abcdef');
        fireEvent.click(screen.getByRole('button', { name: 'Remove color' }));
        await act(() => vi.advanceTimersByTimeAsync(500));
        expect(storedColors()).toBe('#000001,#abcdef');
        vi.useRealTimers();
    });
});
