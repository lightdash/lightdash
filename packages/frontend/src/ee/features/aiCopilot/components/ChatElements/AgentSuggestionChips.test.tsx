import { type AgentSuggestion } from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AgentSuggestionChips } from './AgentSuggestionChips';

const chips: AgentSuggestion[] = Array.from({ length: 5 }, (_, index) => ({
    kind: 'navigate',
    label: `Suggestion ${index + 1}`,
    url: `/suggestion-${index + 1}`,
}));

describe('AgentSuggestionChips', () => {
    it('renders and records only the visible suggestions when limited', async () => {
        const onImpression = vi.fn();

        render(
            <MantineProvider env="test">
                <AgentSuggestionChips
                    chips={chips}
                    maxVisible={2}
                    onChipClick={vi.fn()}
                    onImpression={onImpression}
                />
            </MantineProvider>,
        );

        expect(screen.getAllByRole('button')).toHaveLength(2);
        expect(screen.getByText('Suggestion 1')).toBeVisible();
        expect(screen.getByText('Suggestion 2')).toBeVisible();
        expect(screen.queryByText('Suggestion 3')).toBeNull();
        await waitFor(() => expect(onImpression).toHaveBeenCalledWith(2));
    });
});
