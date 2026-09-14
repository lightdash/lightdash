import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../../testing/testUtils';
import { store } from '../../store';
import { AgentChatInput } from './AgentChatInput';

const { useHasActiveDeepResearchRunMock, useServerFeatureFlagMock } =
    vi.hoisted(() => ({
        useHasActiveDeepResearchRunMock: vi.fn(() => false),
        useServerFeatureFlagMock: vi.fn(() => ({
            data: { enabled: false },
        })),
    }));

vi.mock('../../hooks/useDeepResearch', () => ({
    useHasActiveDeepResearchRun: useHasActiveDeepResearchRunMock,
}));

vi.mock('../../../../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: useServerFeatureFlagMock,
}));

const renderInput = ({
    onStartDeepResearch = vi.fn().mockResolvedValue(undefined),
    onSubmit = vi.fn(),
    disabled = false,
    threadUuid = 'thread-1',
    sqlMode = false,
    onSqlModeChange,
    showAgentSelector = false,
    enableCsvAttachment = false,
}: {
    onStartDeepResearch?:
        | ((args: { question: string }) => Promise<void>)
        | null;
    onSubmit?: (args: { message: string; toolHints: string[] }) => void;
    disabled?: boolean;
    threadUuid?: string | null;
    sqlMode?: boolean;
    onSqlModeChange?: (enabled: boolean) => void;
    showAgentSelector?: boolean;
    enableCsvAttachment?: boolean;
} = {}) => {
    const agent = {
        uuid: 'agent-1',
        name: 'Aurora',
        imageUrl: null,
        adminOnly: false,
    };
    if (enableCsvAttachment) {
        useServerFeatureFlagMock.mockReturnValue({
            data: { enabled: true },
        });
    }

    renderWithProviders(
        <Provider store={store}>
            <MemoryRouter>
                <AgentChatInput
                    onSubmit={onSubmit}
                    onStartDeepResearch={onStartDeepResearch ?? undefined}
                    disabled={disabled}
                    projectUuid="project-1"
                    agentUuid="agent-1"
                    threadUuid={threadUuid ?? undefined}
                    defaultValue="Why did enterprise retention fall?"
                    showSuggestions={false}
                    sqlMode={sqlMode}
                    onSqlModeChange={onSqlModeChange}
                    agents={showAgentSelector ? [agent] : undefined}
                    selectedAgent={showAgentSelector ? agent : undefined}
                />
            </MemoryRouter>
        </Provider>,
        enableCsvAttachment
            ? {
                  user: {
                      abilityRules: [
                          {
                              action: 'manage',
                              subject: 'ExternalSource',
                              conditions: {
                                  organizationUuid:
                                      '172a2270-000f-42be-9c68-c4752c23ae51',
                                  projectUuid: 'project-1',
                              },
                          },
                          {
                              action: 'manage',
                              subject: 'Explore',
                              conditions: {
                                  organizationUuid:
                                      '172a2270-000f-42be-9c68-c4752c23ae51',
                                  projectUuid: 'project-1',
                              },
                          },
                      ],
                  },
              }
            : undefined,
    );
    return { onStartDeepResearch, onSubmit };
};

describe('AgentChatInput Deep Research mode', () => {
    beforeEach(() => {
        useHasActiveDeepResearchRunMock.mockReturnValue(false);
        useServerFeatureFlagMock.mockReturnValue({
            data: { enabled: false },
        });
    });

    const openComposerOptions = async () => {
        const user = userEvent.setup();
        await user.click(
            await screen.findByRole('button', { name: 'Composer options' }),
        );
        return user;
    };

    const expectAllComposerActions = () => {
        expect(screen.getByRole('menu')).toHaveAttribute(
            'data-position',
            'bottom-start',
        );
        expect(
            screen
                .getAllByRole('menuitem')
                .map((menuItem) => menuItem.textContent),
        ).toEqual(['Attach a CSV', 'SQL Runner', 'Deep research']);
        expect(
            screen.getByRole('menuitem', { name: 'Enable SQL Runner' }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('menuitem', { name: 'Enable deep research' }),
        ).toBeInTheDocument();
        expect(screen.getByRole('separator')).toBeInTheDocument();
    };

    it('exposes every action from one menu in an existing thread', async () => {
        renderInput({
            onSqlModeChange: vi.fn(),
            enableCsvAttachment: true,
        });

        expect(
            screen.queryByRole('button', { name: 'Enable deep research' }),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Toggle SQL Runner' }),
        ).not.toBeInTheDocument();
        expect(
            screen
                .getByRole('button', { name: 'Composer options' })
                .compareDocumentPosition(screen.getByRole('textbox')) &
                Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();

        await openComposerOptions();

        expectAllComposerActions();
    });

    it('uses the same action menu in the regular composer', async () => {
        renderInput({
            threadUuid: null,
            onSqlModeChange: vi.fn(),
            showAgentSelector: true,
            enableCsvAttachment: true,
        });

        await openComposerOptions();

        expectAllComposerActions();
    });

    it('opens the CSV file picker from the action menu', async () => {
        renderInput({
            onStartDeepResearch: null,
            enableCsvAttachment: true,
        });
        const user = await openComposerOptions();
        const inputClick = vi.spyOn(HTMLInputElement.prototype, 'click');

        await user.click(
            screen.getByRole('menuitem', { name: 'Attach a CSV' }),
        );

        expect(inputClick).toHaveBeenCalledOnce();
        inputClick.mockRestore();
    });

    it('toggles SQL Runner from the action menu', async () => {
        const onSqlModeChange = vi.fn();
        renderInput({ onSqlModeChange });
        const user = await openComposerOptions();

        await user.click(
            screen.getByRole('menuitem', { name: 'Enable SQL Runner' }),
        );

        expect(onSqlModeChange).toHaveBeenCalledWith(true);
        expect(screen.getByRole('menu')).toBeInTheDocument();
    });

    it('disables SQL Runner from its active menu state', async () => {
        const onSqlModeChange = vi.fn();
        renderInput({ sqlMode: true, onSqlModeChange });
        const user = await openComposerOptions();

        await user.click(
            screen.getByRole('menuitem', { name: 'Disable SQL Runner' }),
        );

        expect(onSqlModeChange).toHaveBeenCalledWith(false);
        expect(screen.getByRole('menu')).toBeInTheDocument();
    });

    it('keeps the action menu open in deep research mode', async () => {
        renderInput({ enableCsvAttachment: true });
        const user = await openComposerOptions();

        await user.click(
            screen.getByRole('menuitem', { name: 'Enable deep research' }),
        );

        expect(
            screen.getByRole('menuitem', { name: 'Disable deep research' }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('menuitem', {
                name: 'Attach a CSV unavailable in deep research',
            }),
        ).toBeDisabled();
    });

    it('starts research after selection and resets the mode after submission', async () => {
        const { onStartDeepResearch, onSubmit } = renderInput();

        const user = await openComposerOptions();
        await user.click(
            screen.getByRole('menuitem', { name: 'Enable deep research' }),
        );
        expect(
            screen.getByRole('menuitem', { name: 'Disable deep research' }),
        ).toBeInTheDocument();
        await user.click(
            screen.getByRole('menuitem', { name: 'Disable deep research' }),
        );
        expect(
            screen.getByRole('button', { name: 'Send message' }),
        ).toBeInTheDocument();

        await user.click(
            screen.getByRole('menuitem', { name: 'Enable deep research' }),
        );
        await user.keyboard('{Escape}');

        await user.click(
            screen.getByRole('button', { name: 'Start research' }),
        );

        expect(onStartDeepResearch).toHaveBeenCalledWith({
            question: 'Why did enterprise retention fall?',
        });
        expect(onSubmit).not.toHaveBeenCalled();
        expect(
            screen.getByRole('button', { name: 'Send message' }),
        ).toBeInTheDocument();
    });

    it('keeps the prompt and enabled mode when starting fails', async () => {
        renderInput({
            onStartDeepResearch: vi
                .fn()
                .mockRejectedValue(new Error('Could not start')),
        });

        const user = await openComposerOptions();
        await user.click(
            screen.getByRole('menuitem', { name: 'Enable deep research' }),
        );
        await user.click(
            screen.getByRole('button', { name: 'Start research' }),
        );

        expect(
            screen.getByRole('button', { name: 'Start research' }),
        ).toBeInTheDocument();
        expect(
            screen.getByText('Why did enterprise retention fall?'),
        ).toBeInTheDocument();
    });

    it('hides the action menu when no actions are available', () => {
        renderInput({ onStartDeepResearch: null });

        expect(
            screen.queryByRole('button', { name: 'Composer options' }),
        ).not.toBeInTheDocument();
    });

    it('hides the action menu while the composer is disabled', () => {
        const onStartDeepResearch = vi.fn().mockResolvedValue(undefined);
        renderInput({ onStartDeepResearch, disabled: true });

        expect(
            screen.queryByRole('button', { name: 'Composer options' }),
        ).not.toBeInTheDocument();
        expect(onStartDeepResearch).not.toHaveBeenCalled();
    });

    it('keeps regular chat available while deep research is active', async () => {
        const user = userEvent.setup();
        useHasActiveDeepResearchRunMock.mockReturnValue(true);
        const { onStartDeepResearch, onSubmit } = renderInput();

        await openComposerOptions();
        const disabledReason =
            'Only one deep research run can be active in a thread at a time.';
        expect(
            screen.getByRole('menuitem', {
                name: `Deep research unavailable. ${disabledReason}`,
            }),
        ).toBeDisabled();
        expect(screen.getByText(disabledReason)).toBeVisible();

        await user.click(screen.getByRole('button', { name: 'Send message' }));

        expect(onSubmit).toHaveBeenCalledWith({
            message: 'Why did enterprise retention fall?',
            toolHints: [],
        });
        expect(onStartDeepResearch).not.toHaveBeenCalled();
    });
});
