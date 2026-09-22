import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import DataAppVizPointMenu from './DataAppVizPointMenu';
import { type VizPointMenuState } from './vizPointMenuConfig';

const fixtureState = (
    overrides: Partial<VizPointMenuState> = {},
): VizPointMenuState => ({
    position: { left: 120, top: 80 },
    intent: { row: {}, metric: 'value', x: 20, y: 30 },
    copyValue: '42',
    drillConfig: undefined,
    underlyingDataConfig: undefined,
    filters: [],
    ...overrides,
});

const renderMenu = (
    overrides: Partial<React.ComponentProps<typeof DataAppVizPointMenu>> = {},
) =>
    renderWithProviders(
        <DataAppVizPointMenu
            state={fixtureState()}
            onClose={vi.fn()}
            metricQuery={undefined}
            // Must stay false: renderWithProviders mounts no router/ability
            // providers, and UnderlyingDataMenuItem needs both to render.
            showUnderlyingData={false}
            onViewUnderlyingData={vi.fn()}
            showFilters={false}
            trackingData={{
                organizationId: undefined,
                userId: undefined,
                projectId: undefined,
            }}
            {...overrides}
        />,
    );

describe('DataAppVizPointMenu', () => {
    it('renders only the actions the state carries', async () => {
        renderMenu();

        expect(await screen.findByText('Copy value')).toBeInTheDocument();
        expect(screen.queryByText(/underlying data/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/drill into/i)).not.toBeInTheDocument();
    });

    it('omits the copy item when the clicked cell has no formatted value', async () => {
        renderMenu({ state: fixtureState({ copyValue: undefined }) });

        await waitFor(() =>
            expect(screen.queryByText('Copy value')).not.toBeInTheDocument(),
        );
    });

    it('closes via the backdrop', async () => {
        const onClose = vi.fn();
        renderMenu({ onClose });

        await userEvent.click(
            document.querySelector('[data-point-menu-backdrop]')!,
        );

        expect(onClose).toHaveBeenCalled();
    });
});
