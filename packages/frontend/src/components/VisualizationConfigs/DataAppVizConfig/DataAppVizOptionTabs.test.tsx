import { type DataAppVizConfigOption } from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import DataAppVizOptionTabs from './DataAppVizOptionTabs';

const generalContent = <div data-testid="general">General content</div>;

const options: DataAppVizConfigOption[] = [
    {
        type: 'boolean',
        name: 'showLegend',
        label: 'Show legend',
        group: 'Style',
        default: true,
    },
    { type: 'number', name: 'barWidth', label: 'Bar width', default: 8 },
];

const renderTabs = (
    configOptions: DataAppVizConfigOption[],
    onChange = vi.fn(),
) =>
    renderWithProviders(
        <DataAppVizOptionTabs
            generalContent={generalContent}
            configOptions={configOptions}
            values={{}}
            onChange={onChange}
        />,
    );

describe('DataAppVizOptionTabs', () => {
    it('renders the general content bare when no options are declared', () => {
        renderTabs([]);

        expect(screen.getByTestId('general')).toBeInTheDocument();
        expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    });

    it('keeps the general content in its own tab alongside the option groups', () => {
        renderTabs(options);

        expect(
            screen.getAllByRole('tab').map((tab) => tab.textContent),
        ).toEqual(['General', 'Style', 'Display']);
        expect(screen.getByTestId('general')).toBeInTheDocument();
    });

    it('falls back to each option default and reports changes by name', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        renderTabs(options, onChange);

        await user.click(screen.getByRole('tab', { name: 'Style' }));
        expect(screen.getByLabelText('Show legend')).toBeChecked();

        await user.click(screen.getByLabelText('Show legend'));
        expect(onChange).toHaveBeenCalledWith('showLegend', false);
    });
});
