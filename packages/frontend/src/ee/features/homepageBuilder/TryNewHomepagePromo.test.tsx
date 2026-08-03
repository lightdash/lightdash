import { Ability } from '@casl/ability';
import { MantineProvider } from '@mantine-8/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TryNewHomepageCard, TryNewHomepageModal } from './TryNewHomepagePromo';

vi.mock('react-router', () => ({
    useNavigate: () => vi.fn(),
}));

const { aiState, mutateSettings, abilityRules, license } = vi.hoisted(() => ({
    aiState: { current: { canAskAi: true } },
    mutateSettings: vi.fn(),
    abilityRules: {
        current: [{ action: 'manage', subject: 'Organization' }],
    },
    license: { current: true },
}));

vi.mock('./hooks/useHomepageAiState', () => ({
    useHomepageAiState: () => ({ isLoading: false, ...aiState.current }),
}));

vi.mock('./hooks/useOrgHomepageSettings', () => ({
    useOrgHomepageSettings: () => ({
        data: { enabled: false, opening: null },
    }),
    useUpdateOrgHomepageSettings: () => ({
        mutate: mutateSettings,
        isLoading: false,
    }),
}));

vi.mock('../../../providers/App/useApp', () => ({
    default: () => ({
        user: {
            data: {
                userUuid: 'user-1',
                firstName: 'Ada',
                ability: new Ability(abilityRules.current),
            },
        },
        health: {
            data: {
                license: {
                    hasLicenseKey: license.current,
                    valid: license.current,
                },
            },
        },
    }),
}));

const renderCard = (onTryNow = vi.fn()) =>
    render(
        <MantineProvider>
            <TryNewHomepageCard organizationUuid="org-1" onTryNow={onTryNow} />
        </MantineProvider>,
    );

const renderModal = () =>
    render(
        <MantineProvider>
            <TryNewHomepageModal
                opened
                onClose={vi.fn()}
                projectUuid="project-1"
            />
        </MantineProvider>,
    );

describe('TryNewHomepageCard', () => {
    beforeEach(() => {
        localStorage.clear();
        mutateSettings.mockClear();
        aiState.current = { canAskAi: true };
        abilityRules.current = [{ action: 'manage', subject: 'Organization' }];
        license.current = true;
    });

    it('shows the invitation to org admins', () => {
        renderCard();
        expect(screen.getByText('A new Homepage is here')).toBeInTheDocument();
    });

    it('hides the invitation from non-admins', () => {
        abilityRules.current = [];
        renderCard();
        expect(screen.queryByText('A new Homepage is here')).toBeNull();
    });

    it('hides the invitation on unlicensed instances', () => {
        license.current = false;
        renderCard();
        expect(screen.queryByText('A new Homepage is here')).toBeNull();
    });

    it('stays dismissed after the close button', () => {
        const { unmount } = renderCard();
        fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
        expect(screen.queryByText('A new Homepage is here')).toBeNull();

        unmount();
        renderCard();
        expect(screen.queryByText('A new Homepage is here')).toBeNull();
    });
});

describe('TryNewHomepageModal', () => {
    beforeEach(() => {
        mutateSettings.mockClear();
        aiState.current = { canAskAi: true };
    });

    it('offers both openings and turns on the selected one org-wide', () => {
        renderModal();

        expect(screen.getByText('Ask first')).toBeInTheDocument();
        expect(screen.getByText('Content first')).toBeInTheDocument();

        fireEvent.click(screen.getByText('Ask first'));
        fireEvent.click(
            screen.getByRole('button', { name: 'Turn on for all projects' }),
        );

        expect(mutateSettings).toHaveBeenCalledWith(
            { enabled: true, opening: 'ask-first' },
            expect.anything(),
        );
    });

    it('skips the fork and goes content-first when AI is unavailable', () => {
        aiState.current = { canAskAi: false };
        renderModal();

        expect(screen.queryByText('Ask first')).toBeNull();
        fireEvent.click(
            screen.getByRole('button', { name: 'Turn on for all projects' }),
        );

        expect(mutateSettings).toHaveBeenCalledWith(
            { enabled: true, opening: 'content-first' },
            expect.anything(),
        );
    });
});
