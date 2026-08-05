import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../../testing/testUtils';
import { MemoryPromotionAction } from './MemoryPromotionAction';

const { mutate, permissions, settings } = vi.hoisted(() => ({
    mutate: vi.fn(),
    permissions: {
        canManageOrganization: false,
        canManageProject: true,
    },
    settings: {
        current: {
            aiAgentReviewsEnabled: true,
            aiAgentReviewsPausedByByok: false,
        },
    },
}));

vi.mock('../../hooks/useAiAgentMemory', () => ({
    usePromoteAiAgentMemory: () => ({ isLoading: false, mutate }),
}));

vi.mock('../../hooks/useAiOrganizationSettings', () => ({
    useAiOrganizationSettings: () => ({ data: settings.current }),
}));

vi.mock('../../hooks/useAiAgentPermission', () => ({
    useAiAgentPermission: () => permissions.canManageProject,
    useAiAgentOrgPermission: () => permissions.canManageOrganization,
}));

const renderAction = (
    overrides: Partial<React.ComponentProps<typeof MemoryPromotionAction>> = {},
) =>
    renderWithProviders(
        <MemoryRouter>
            <MemoryPromotionAction
                projectUuid="project-1"
                memoryUuid="memory-1"
                slug="revenue-convention"
                status="active"
                promotionReviewItem={null}
                {...overrides}
            />
        </MemoryRouter>,
    );

describe('MemoryPromotionAction', () => {
    beforeEach(() => {
        mutate.mockClear();
        settings.current = {
            aiAgentReviewsEnabled: true,
            aiAgentReviewsPausedByByok: false,
        };
        permissions.canManageOrganization = false;
        permissions.canManageProject = true;
    });

    it('submits a nomination reason', async () => {
        const user = userEvent.setup();
        renderAction();

        await user.click(
            screen.getByRole('button', { name: 'Propose for project context' }),
        );
        await user.type(
            screen.getByRole('textbox', {
                name: /Why should this become project context?/,
            }),
            '  Useful across the project  ',
        );
        await user.click(
            screen.getByRole('button', { name: 'Create proposal' }),
        );

        expect(mutate).toHaveBeenCalledWith(
            {
                projectUuid: 'project-1',
                memoryUuid: 'memory-1',
                slug: 'revenue-convention',
                reason: 'Useful across the project',
            },
            expect.objectContaining({ onSuccess: expect.any(Function) }),
        );
    });

    it('submits without a nomination reason', async () => {
        const user = userEvent.setup();
        renderAction();

        await user.click(
            screen.getByRole('button', { name: 'Propose for project context' }),
        );
        expect(
            screen.getByText(
                'This proposes making this guidance available to everyone in the project. Only text from the memory itself is used — evidence and query results are never included — and nothing changes until a reviewer approves it.',
            ),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('textbox', {
                name: /Why should this become project context?/,
            }),
        ).not.toBeRequired();
        await user.click(
            screen.getByRole('button', { name: 'Create proposal' }),
        );

        expect(mutate).toHaveBeenCalledWith(
            {
                projectUuid: 'project-1',
                memoryUuid: 'memory-1',
                slug: 'revenue-convention',
            },
            expect.objectContaining({ onSuccess: expect.any(Function) }),
        );
    });

    it('links a live promotion candidate to its board item', () => {
        renderAction({
            promotionReviewItem: {
                uuid: 'review-1',
                status: 'open',
                blocksNewNomination: true,
            },
        });

        expect(
            screen.getByRole('link', { name: 'View proposal' }),
        ).toHaveAttribute(
            'href',
            '/generalSettings/ai/issues?reviewProjectUuid=project-1&reviewItemUuid=review-1',
        );
        expect(
            screen.queryByRole('button', {
                name: 'Propose for project context',
            }),
        ).not.toBeInTheDocument();
    });

    it('links an expected-behavior dismissal that blocks re-nomination', () => {
        renderAction({
            promotionReviewItem: {
                uuid: 'review-1',
                status: 'dismissed',
                blocksNewNomination: true,
            },
        });

        expect(
            screen.getByRole('link', { name: 'View proposal' }),
        ).toHaveAttribute(
            'href',
            '/generalSettings/ai/issues?reviewProjectUuid=project-1&reviewItemUuid=review-1',
        );
    });

    it('does not link a proposal when the nominator cannot open the board', () => {
        permissions.canManageProject = false;
        renderAction({
            promotionReviewItem: {
                uuid: 'review-1',
                status: 'open',
                blocksNewNomination: true,
            },
        });

        expect(screen.getByText('Proposal pending')).toBeInTheDocument();
        expect(
            screen.queryByRole('link', { name: 'View proposal' }),
        ).not.toBeInTheDocument();
    });

    it('disables promotion with the feature gate reason', async () => {
        settings.current.aiAgentReviewsEnabled = false;
        const user = userEvent.setup();
        renderAction();

        const button = screen.getByRole('button', {
            name: 'Propose for project context',
        });
        expect(button).toBeDisabled();
        await user.hover(button.parentElement!);
        expect(
            await screen.findByText(
                'Enable project context reviews before proposing a memory.',
            ),
        ).toBeInTheDocument();
    });
});
