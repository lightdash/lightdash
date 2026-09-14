import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import ChartTypeIconPicker from './ChartTypeIconPicker';

describe('ChartTypeIconPicker', () => {
    it("renders the current icon's label in the target's accessible state", () => {
        renderWithProviders(
            <ChartTypeIconPicker
                value="chart-bar"
                onChange={vi.fn()}
                disabled={false}
            />,
        );

        const target = screen.getByLabelText('Chart type icon');
        expect(
            target.querySelector('.tabler-icon-chart-bar'),
        ).toBeInTheDocument();
    });

    it('opening shows the search box', async () => {
        renderWithProviders(
            <ChartTypeIconPicker
                value={null}
                onChange={vi.fn()}
                disabled={false}
            />,
        );

        await userEvent.click(screen.getByLabelText('Chart type icon'));

        expect(screen.getByPlaceholderText('Search icons')).toBeInTheDocument();
    });

    it('typing filters the grid', async () => {
        renderWithProviders(
            <ChartTypeIconPicker
                value={null}
                onChange={vi.fn()}
                disabled={false}
            />,
        );

        await userEvent.click(screen.getByLabelText('Chart type icon'));
        expect(screen.getByLabelText('Bar')).toBeInTheDocument();

        await userEvent.type(
            screen.getByPlaceholderText('Search icons'),
            'scatter',
        );

        expect(screen.getByLabelText('Scatter 3d')).toBeInTheDocument();
        expect(screen.queryByLabelText('Bar')).not.toBeInTheDocument();
    });

    it('picking an icon calls onChange with the name and closes', async () => {
        const onChange = vi.fn();
        renderWithProviders(
            <ChartTypeIconPicker
                value={null}
                onChange={onChange}
                disabled={false}
            />,
        );

        await userEvent.click(screen.getByLabelText('Chart type icon'));
        await userEvent.click(screen.getByLabelText('Bar'));

        expect(onChange).toHaveBeenCalledWith('chart-bar');
        expect(
            screen.queryByPlaceholderText('Search icons'),
        ).not.toBeInTheDocument();
    });

    it('"No icon" calls onChange(null)', async () => {
        const onChange = vi.fn();
        renderWithProviders(
            <ChartTypeIconPicker
                value="chart-bar"
                onChange={onChange}
                disabled={false}
            />,
        );

        await userEvent.click(screen.getByLabelText('Chart type icon'));
        await userEvent.click(screen.getByText('No icon'));

        expect(onChange).toHaveBeenCalledWith(null);
    });

    it('"No icon" is absent when value is null', async () => {
        renderWithProviders(
            <ChartTypeIconPicker
                value={null}
                onChange={vi.fn()}
                disabled={false}
            />,
        );

        await userEvent.click(screen.getByLabelText('Chart type icon'));

        expect(screen.queryByText('No icon')).not.toBeInTheDocument();
    });
});
