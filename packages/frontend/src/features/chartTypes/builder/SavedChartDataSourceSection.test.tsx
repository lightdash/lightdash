import { Box } from '@mantine/core';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import SavedChartDataSourceSection from './SavedChartDataSourceSection';
import { type SavedChartSourceControls } from './savedChartSource';

vi.mock('./SavedChartPickerPopover', () => ({
    default: ({
        children,
        opened,
    }: {
        children: ReactNode;
        opened: boolean;
    }) => (
        <>
            {children}
            {opened && <Box role="dialog" aria-label="Saved chart picker" />}
        </>
    ),
}));

const source = (): SavedChartSourceControls => ({
    attached: {
        status: 'ready',
        chartName: 'Orders by status',
        spaceName: 'Finance',
        rowCount: 12,
        columns: [],
        ranAt: null,
        message: null,
    },
    previewSource: 'chart',
    sourceIdentity: 'chart-a:0',
    setPreviewSource: vi.fn(),
    includeRows: false,
    setIncludeRows: vi.fn(),
    attach: vi.fn(),
    detach: vi.fn(),
    viewRows: vi.fn(),
    retry: vi.fn(),
});

describe('SavedChartDataSourceSection', () => {
    it('opens the chart picker from the tile or explicit change action', async () => {
        const user = userEvent.setup();
        const controls = source();
        renderWithProviders(<SavedChartDataSourceSection source={controls} />);

        const tile = screen.getByRole('button', {
            name: 'Change saved chart: Orders by status',
        });
        expect(tile).toHaveAttribute('type', 'button');
        expect(tile.querySelector('button')).toBeNull();

        tile.focus();
        await user.keyboard('{Enter}');
        expect(
            screen.getByRole('dialog', { name: 'Saved chart picker' }),
        ).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Change' }));
        expect(
            screen.getAllByRole('dialog', { name: 'Saved chart picker' }),
        ).toHaveLength(1);
        expect(controls.setPreviewSource).not.toHaveBeenCalled();

        await user.click(
            screen.getByRole('button', { name: 'Use sample data' }),
        );
        expect(controls.setPreviewSource).toHaveBeenCalledWith('sample');
    });
});
