import { type AgentSuggestion } from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { renderWithProviders } from '../../../../../testing/testUtils';
import { AgentRelatedQueries } from './AgentSuggestionChips';

const suggestions: AgentSuggestion[] = [
    {
        kind: 'prompt',
        label: 'Break down conversion by device type',
        tool: 'generateVisualization',
        defaults: {
            explore: 'product_events',
            dimensions: ['product_events.device_type'],
            metrics: ['product_events.unique_users'],
            timeframe: null,
        },
    },
    {
        kind: 'prompt',
        label: 'Compare referrer performance over time',
        tool: 'generateVisualization',
        defaults: {
            explore: 'product_events',
            dimensions: ['product_events.referrer'],
            metrics: ['product_events.unique_users'],
            timeframe: 'last 90 days',
        },
    },
];

describe('AgentRelatedQueries', () => {
    it('renders next questions as part of the answer and submits a selection', async () => {
        const user = userEvent.setup();
        const onChipClick = vi.fn();
        const onImpression = vi.fn();

        renderWithProviders(
            <AgentRelatedQueries
                chips={suggestions}
                onChipClick={onChipClick}
                onImpression={onImpression}
            />,
        );

        expect(
            screen.getByRole('region', { name: 'Related questions' }),
        ).toBeVisible();
        expect(onImpression).toHaveBeenCalledWith(2);

        await user.click(
            screen.getByRole('button', {
                name: 'Break down conversion by device type',
            }),
        );

        expect(onChipClick).toHaveBeenCalledWith(suggestions[0], 0);
    });
});
