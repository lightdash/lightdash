import { Box } from '@mantine/core';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import DataSourceSection from './DataSourceSection';
import {
    type AttachedSavedChart,
    type SavedChartSourceControls,
} from './savedChartSource';

vi.mock('./DataSourcePicker', () => ({
    default: ({
        children,
        opened,
    }: {
        children: ReactNode;
        opened: boolean;
    }) => (
        <>
            {children}
            {opened && <Box role="dialog" aria-label="Data source picker" />}
        </>
    ),
}));

const chart = (
    overrides: Partial<AttachedSavedChart> = {},
): AttachedSavedChart => ({
    uuid: 'chart-a',
    status: 'ready',
    chartName: 'Orders by status',
    spaceName: 'Finance',
    rowCount: 12,
    columns: [],
    ranAt: null,
    message: null,
    ...overrides,
});

const source = (
    attached: AttachedSavedChart | null,
): SavedChartSourceControls => ({
    attached,
    previewSource: attached ? 'chart' : 'sample',
    sourceIdentity: attached ? 'chart-a:0' : null,
    includeRows: false,
    setIncludeRows: vi.fn(),
    attach: vi.fn(),
    detach: vi.fn(),
    viewRows: vi.fn(),
    retry: vi.fn(),
});

describe('DataSourceSection', () => {
    it('is one tile button that opens the picker, with no buttons under it', async () => {
        const user = userEvent.setup();
        renderWithProviders(
            <DataSourceSection
                savedChartSource={source(chart())}
                exploreSource={null}
            />,
        );

        const tile = screen.getByRole('button', {
            name: 'Change preview data: Orders by status',
        });
        expect(tile).toHaveAttribute('type', 'button');
        expect(tile.querySelector('button')).toBeNull();
        expect(
            screen.getByText('Saved chart · Finance · 12 rows'),
        ).toBeVisible();
        [
            'Change',
            'Use sample data',
            'Use saved chart',
            'Use explore',
            'Choose data source',
        ].forEach((name) =>
            expect(
                screen.queryByRole('button', { name }),
            ).not.toBeInTheDocument(),
        );

        tile.focus();
        await user.keyboard('{Enter}');
        expect(
            screen.getByRole('dialog', { name: 'Data source picker' }),
        ).toBeInTheDocument();
    });

    it('opens the same picker from the sample tile', async () => {
        const user = userEvent.setup();
        renderWithProviders(
            <DataSourceSection
                savedChartSource={source(null)}
                exploreSource={null}
            />,
        );

        expect(
            screen.getByText('Generated from the chart inputs'),
        ).toBeVisible();
        await user.click(
            screen.getByRole('button', {
                name: 'Change preview data: Sample data',
            }),
        );
        expect(
            screen.getByRole('dialog', { name: 'Data source picker' }),
        ).toBeInTheDocument();
    });

    it('offers Try again when the query failed', async () => {
        const user = userEvent.setup();
        const controls = source(
            chart({ status: 'error', rowCount: null, message: 'Boom' }),
        );
        renderWithProviders(
            <DataSourceSection
                savedChartSource={controls}
                exploreSource={null}
            />,
        );

        expect(
            screen.getByText('Saved chart · Finance · query failed'),
        ).toBeVisible();
        expect(screen.getByText('Boom')).toBeVisible();
        await user.click(screen.getByRole('button', { name: 'Try again' }));
        expect(controls.retry).toHaveBeenCalledOnce();
    });
});
