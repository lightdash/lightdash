import { screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../../testing/testUtils';
import { MemoryStatusAction, MemoryStatusMenu } from './MemoryStatusControls';

vi.mock('../../hooks/useAiAgentMemory', () => ({
    useUpdateAiAgentMemoryStatus: () => ({
        isLoading: false,
        mutate: vi.fn(),
    }),
}));

describe('promoted memory controls', () => {
    it('renders the promoted status without edit actions', () => {
        renderWithProviders(
            <MemoryRouter>
                <MemoryStatusMenu
                    projectUuid="project-1"
                    memoryUuid="memory-1"
                    slug="revenue-convention"
                    status="promoted"
                />
                <MemoryStatusAction
                    projectUuid="project-1"
                    memoryUuid="memory-1"
                    slug="revenue-convention"
                    status="promoted"
                />
            </MemoryRouter>,
        );

        expect(screen.getByText('Promoted')).toBeInTheDocument();
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });
});
