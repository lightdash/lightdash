import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { VisualizationConfigTabs } from './VisualizationConfigTabs';

const tabs = [
    { value: 'layout', label: 'Layout', panel: <div>Layout panel</div> },
    { value: 'display', label: 'Display', panel: <div>Display panel</div> },
];

describe('VisualizationConfigTabs', () => {
    it('renders every tab and opens the first one by default', () => {
        renderWithProviders(<VisualizationConfigTabs tabs={tabs} />);

        expect(screen.getByRole('tab', { name: 'Layout' })).toBeInTheDocument();
        expect(
            screen.getByRole('tab', { name: 'Display' }),
        ).toBeInTheDocument();
        expect(screen.getByText('Layout panel')).toBeInTheDocument();
        expect(screen.queryByText('Display panel')).not.toBeInTheDocument();
    });

    it('honours an explicit default tab', () => {
        renderWithProviders(
            <VisualizationConfigTabs tabs={tabs} defaultValue="display" />,
        );

        expect(screen.getByText('Display panel')).toBeInTheDocument();
        expect(screen.queryByText('Layout panel')).not.toBeInTheDocument();
    });

    it('shows the matching panel when a tab is selected', async () => {
        const user = userEvent.setup();
        renderWithProviders(<VisualizationConfigTabs tabs={tabs} />);

        await user.click(screen.getByRole('tab', { name: 'Display' }));

        expect(screen.getByText('Display panel')).toBeInTheDocument();
        expect(screen.queryByText('Layout panel')).not.toBeInTheDocument();
    });
});
