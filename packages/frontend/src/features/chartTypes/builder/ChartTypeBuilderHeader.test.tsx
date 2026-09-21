import { fireEvent, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import ChartTypeBuilderHeader from './ChartTypeBuilderHeader';

const baseProps = {
    projectUuid: 'project-1',
    backLink: { label: 'Chart types', to: '/projects/project-1/chart-types' },
    onBackLinkClick: vi.fn(),
    app: null,
    hasHistory: false,
    isHistoryOpen: false,
    isBuilding: false,
    upgrade: null,
    onUpgradeStarted: vi.fn(),
    onToggleHistory: vi.fn(),
    onDone: vi.fn(),
    onPreviewInExplorer: null,
};

const renderHeader = (
    overrides: Partial<
        React.ComponentProps<typeof ChartTypeBuilderHeader>
    > = {},
) =>
    renderWithProviders(
        <MemoryRouter>
            <ChartTypeBuilderHeader
                {...baseProps}
                latestReadyVersion={null}
                previewInExplorerLink={null}
                {...overrides}
            />
        </MemoryRouter>,
    );

describe('ChartTypeBuilderHeader', () => {
    it('skips the back link cleanup on a click that opens a new tab', () => {
        const onBackLinkClick = vi.fn();
        renderHeader({ onBackLinkClick });
        const backLink = screen.getByRole('link', { name: 'Chart types' });

        fireEvent.click(backLink, { metaKey: true });
        fireEvent.click(backLink, { ctrlKey: true });
        expect(onBackLinkClick).not.toHaveBeenCalled();

        fireEvent.click(backLink);
        expect(onBackLinkClick).toHaveBeenCalledTimes(1);
    });

    it('makes Done the filled action before Preview in explorer is on offer', () => {
        renderHeader({ latestReadyVersion: null });

        expect(screen.queryByText('Preview in explorer')).toBeNull();
        // Mantine only stamps `data-variant` for a non-default variant, so a
        // missing attribute is the filled (implicit default) button.
        expect(
            screen.getByRole('button', { name: 'Done' }),
        ).not.toHaveAttribute('data-variant');
    });

    it('makes Done a secondary action once Preview in explorer is on offer', () => {
        renderHeader({
            latestReadyVersion: 1,
            previewInExplorerLink: '/projects/project-1/tables/orders',
        });

        expect(screen.getByText('Preview in explorer')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Done' })).toHaveAttribute(
            'data-variant',
            'default',
        );
    });
});
