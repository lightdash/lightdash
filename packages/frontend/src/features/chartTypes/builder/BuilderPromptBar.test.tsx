import {
    type DataAppClaudeModel,
    type DataAppCodexModel,
} from '@lightdash/common';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { forwardRef, useImperativeHandle, useRef, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { type ClarificationRound } from '../../apps/hooks/useClarificationRound';
import { type DataAppModelSelection } from '../../apps/hooks/useDataAppModelSelection';
import {
    type DataAppVizBuildState,
    type VizBuildRequest,
} from '../hooks/useDataAppVizBuild';
import { clarificationStub } from '../testing/clarificationRoundStub';
import BuilderPromptBar from './BuilderPromptBar';

// The real composer is TipTap; a text input carries the same handle contract.
vi.mock('../../../components/common/PromptComposer/PromptComposer', () => ({
    default: forwardRef<
        {
            getText: () => string;
            clear: () => void;
            insertContent: (content: { text?: string }[]) => void;
        },
        {
            placeholder: string;
            toolbarRight: ReactNode;
            onEmptyChange: (isEmpty: boolean) => void;
            onSubmit: () => void;
            submitDisabled?: boolean;
            disabled?: boolean;
        }
    >(function MockComposer(
        {
            placeholder,
            toolbarRight,
            onEmptyChange,
            onSubmit,
            submitDisabled,
            disabled,
        },
        ref,
    ) {
        const inputRef = useRef<HTMLInputElement>(null);
        useImperativeHandle(ref, () => ({
            getText: () => inputRef.current?.value ?? '',
            clear: () => {
                if (inputRef.current) inputRef.current.value = '';
                onEmptyChange(true);
            },
            insertContent: (content) => {
                if (inputRef.current) {
                    inputRef.current.value = content
                        .map((item) => item.text ?? '')
                        .join('');
                }
                onEmptyChange(false);
            },
        }));
        return (
            <div>
                <input
                    ref={inputRef}
                    placeholder={placeholder}
                    disabled={disabled}
                    onChange={(event) =>
                        onEmptyChange(event.target.value === '')
                    }
                    onKeyDown={(event) => {
                        if (
                            event.key === 'Enter' &&
                            !event.shiftKey &&
                            !submitDisabled
                        ) {
                            event.preventDefault();
                            onSubmit();
                        }
                    }}
                />
                {toolbarRight}
            </div>
        );
    }),
}));

vi.mock('../hooks/useVizComposerAttachments', () => ({
    useVizComposerAttachments: () => ({
        attachments: [],
        fileIds: [],
        isUploading: false,
        add: vi.fn(),
        remove: vi.fn(),
        clear: vi.fn(),
    }),
}));

const buildState = (
    overrides: Partial<DataAppVizBuildState> = {},
): DataAppVizBuildState => ({
    draftAppUuid: 'draft-1',
    appUuid: null,
    draft: null,
    startedAt: null,
    claimedVersion: null,
    isBuilding: false,
    isCancelling: false,
    cancelError: null,
    pendingPrompt: null,
    error: null,
    send: vi.fn(),
    retry: null,
    interrupt: null,
    cancel: null,
    discard: null,
    ...overrides,
});

const modelSelection = (
    selectedModel: DataAppModelSelection['selectedModel'],
    codingAgent: DataAppModelSelection['codingAgent'] = 'claude',
): DataAppModelSelection => ({
    codingAgent,
    selectedModel,
    modelRequest:
        codingAgent === 'codex'
            ? { codexModel: selectedModel as DataAppCodexModel }
            : { claudeModel: selectedModel as DataAppClaudeModel },
    visibleModels:
        codingAgent === 'codex'
            ? ['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna']
            : ['opus', 'sonnet', 'haiku'],
    isLoading: false,
    setModel: vi.fn(),
    clearPick: vi.fn(),
});

const promptBar = ({
    build = buildState(),
    isBuilding = false,
    latestReadyVersion = null,
    model = modelSelection('sonnet'),
    onCancelBuild = isBuilding ? vi.fn() : null,
    narration = { reasoning: [], activity: [] },
    // A round with nothing to ask passes the request straight to the build,
    // which is what most of these tests are watching for.
    clarification = clarificationStub({ send: build.send }),
}: {
    build?: DataAppVizBuildState;
    isBuilding?: boolean;
    latestReadyVersion?: number | null;
    model?: DataAppModelSelection;
    onCancelBuild?: (() => void) | null;
    narration?: { reasoning: string[]; activity: string[] };
    clarification?: ClarificationRound<VizBuildRequest>;
} = {}) => (
    <BuilderPromptBar
        projectUuid="p1"
        composerAppUuid="draft-1"
        sessionKey="session-1"
        hasVersions
        isBuilding={isBuilding}
        buildingPrompt={isBuilding ? 'make it teal' : null}
        elapsed={isBuilding ? '0:07' : null}
        latestReadyVersion={latestReadyVersion}
        build={build}
        onCancelBuild={onCancelBuild}
        narration={narration}
        modelSelection={model}
        clarification={clarification}
    />
);

describe('BuilderPromptBar', () => {
    it('builds with the picked model', async () => {
        const send = vi.fn();
        renderWithProviders(
            promptBar({
                build: buildState({ send }),
                model: modelSelection('haiku'),
            }),
        );

        await userEvent.type(
            screen.getByPlaceholderText('Ask for a change…'),
            'a funnel of signup steps',
        );
        await userEvent.click(screen.getByLabelText('Send'));

        expect(send).toHaveBeenCalledWith({
            description: 'a funnel of signup steps',
            fileIds: [],
            claudeModel: 'haiku',
            clarifications: [],
        });
    });

    it('shows the model it will build with', () => {
        renderWithProviders(promptBar({ model: modelSelection('opus') }));

        expect(screen.getByText('Opus')).toBeInTheDocument();
    });

    it('builds with the picked Codex model', async () => {
        const send = vi.fn();
        renderWithProviders(
            promptBar({
                build: buildState({ send }),
                model: modelSelection('gpt-5.6-sol', 'codex'),
            }),
        );

        await userEvent.type(
            screen.getByPlaceholderText('Ask for a change…'),
            'a complex cohort analysis',
        );
        await userEvent.click(screen.getByLabelText('Send'));

        expect(send).toHaveBeenCalledWith({
            description: 'a complex cohort analysis',
            fileIds: [],
            codexModel: 'gpt-5.6-sol',
            clarifications: [],
        });
    });

    it('queues a prompt during a build and drains it when the build finishes', async () => {
        const send = vi.fn();
        const activeBuild = buildState({
            isBuilding: true,
            send,
            interrupt: vi.fn(),
        });
        const view = renderWithProviders(
            promptBar({ build: activeBuild, isBuilding: true }),
        );

        await userEvent.type(
            screen.getByPlaceholderText('Ask for another change…'),
            'hide the axis labels',
        );
        await userEvent.keyboard('{Enter}');

        expect(send).not.toHaveBeenCalled();
        expect(screen.getByText('hide the axis labels')).toBeInTheDocument();
        expect(
            screen.getByRole('list', { name: '1 queued prompt' }),
        ).toBeInTheDocument();
        expect(screen.getByText('Queued')).toBeInTheDocument();
        expect(screen.getByText('· 1 queued')).toBeInTheDocument();

        view.rerender(
            promptBar({
                build: buildState({ send }),
                latestReadyVersion: 1,
            }),
        );

        await waitFor(() =>
            expect(send).toHaveBeenCalledWith({
                description: 'hide the axis labels',
                fileIds: [],
                claudeModel: 'sonnet',
                clarifications: [],
            }),
        );

        view.rerender(
            promptBar({
                build: buildState({ isBuilding: true, send }),
                isBuilding: true,
                latestReadyVersion: 1,
            }),
        );

        expect(screen.queryByText('Sending…')).not.toBeInTheDocument();
    });

    it('moves queued prompts back into the composer for editing', async () => {
        const model = modelSelection('sonnet');
        renderWithProviders(
            promptBar({
                build: buildState({
                    isBuilding: true,
                    interrupt: vi.fn(),
                }),
                isBuilding: true,
                model,
            }),
        );
        const composer = screen.getByPlaceholderText('Ask for another change…');
        await userEvent.type(composer, 'make the bars thicker');
        await userEvent.keyboard('{Enter}');

        await userEvent.click(
            screen.getByLabelText('Edit queued prompt: make the bars thicker'),
        );

        expect(composer).toHaveValue('make the bars thicker');
        expect(screen.queryByText('Queued')).not.toBeInTheDocument();
        expect(model.setModel).toHaveBeenCalledWith('sonnet');
    });

    it('removes a queued prompt', async () => {
        renderWithProviders(
            promptBar({
                build: buildState({
                    isBuilding: true,
                    interrupt: vi.fn(),
                }),
                isBuilding: true,
            }),
        );
        await userEvent.type(
            screen.getByPlaceholderText('Ask for another change…'),
            'hide the labels',
        );
        await userEvent.keyboard('{Enter}');

        await userEvent.click(
            screen.getByLabelText('Remove queued prompt: hide the labels'),
        );

        expect(screen.queryByText('hide the labels')).not.toBeInTheDocument();
    });

    it('interrupts the current build before sending a queued prompt now', async () => {
        const send = vi.fn();
        const interrupt = vi.fn();
        const view = renderWithProviders(
            promptBar({
                build: buildState({
                    isBuilding: true,
                    send,
                    interrupt,
                }),
                isBuilding: true,
            }),
        );
        await userEvent.type(
            screen.getByPlaceholderText('Ask for another change…'),
            'group by quarter instead',
        );
        await userEvent.keyboard('{Enter}');

        await userEvent.click(screen.getByText('Send now'));
        expect(interrupt).toHaveBeenCalledOnce();
        expect(send).not.toHaveBeenCalled();

        view.rerender(
            promptBar({
                build: buildState({
                    isBuilding: true,
                    isCancelling: true,
                    send,
                    interrupt,
                }),
                isBuilding: true,
            }),
        );

        expect(screen.queryByText('Send now')).not.toBeInTheDocument();

        view.rerender(promptBar({ build: buildState({ send }) }));

        await waitFor(() =>
            expect(send).toHaveBeenCalledWith({
                description: 'group by quarter instead',
                fileIds: [],
                claudeModel: 'sonnet',
                clarifications: [],
            }),
        );
    });

    it('preserves the existing first-build cancel behavior with queued prompts', async () => {
        const interrupt = vi.fn();
        const discard = vi.fn();
        renderWithProviders(
            promptBar({
                build: buildState({
                    isBuilding: true,
                    interrupt,
                    discard,
                }),
                isBuilding: true,
                onCancelBuild: discard,
            }),
        );
        await userEvent.type(
            screen.getByPlaceholderText('Ask for another change…'),
            'make the markers red',
        );
        await userEvent.keyboard('{Enter}');

        await userEvent.click(screen.getByText('Cancel'));

        expect(discard).toHaveBeenCalledOnce();
        expect(interrupt).not.toHaveBeenCalled();
    });

    it('does not drain queued prompts after cancellation', async () => {
        const send = vi.fn();
        const view = renderWithProviders(
            promptBar({
                build: buildState({ isBuilding: true, send }),
                isBuilding: true,
                latestReadyVersion: 1,
            }),
        );
        await userEvent.type(
            screen.getByPlaceholderText('Ask for another change…'),
            'make the markers red',
        );
        await userEvent.keyboard('{Enter}');

        view.rerender(
            promptBar({
                build: buildState({ send }),
                latestReadyVersion: 1,
            }),
        );

        expect(send).not.toHaveBeenCalled();
        expect(screen.getByText('make the markers red')).toBeInTheDocument();
    });

    it('anchors the active build status in the composer', () => {
        renderWithProviders(
            promptBar({
                build: buildState({ isBuilding: true }),
                isBuilding: true,
            }),
        );

        expect(screen.getByText('Building… 0:07')).toBeInTheDocument();
        expect(screen.getByText('“make it teal”')).toBeInTheDocument();
        expect(screen.getByText('Cancel')).toBeInTheDocument();
    });

    it('shows live reasoning and activity with the active build', () => {
        const view = renderWithProviders(
            promptBar({
                build: buildState({ isBuilding: true }),
                isBuilding: true,
                narration: {
                    reasoning: ['Choosing a horizontal layout'],
                    activity: ['Updating Chart.tsx'],
                },
            }),
        );

        expect(screen.getByText('Reasoning')).toBeInTheDocument();
        expect(
            screen.getAllByText('Choosing a horizontal layout').length,
        ).toBeGreaterThan(0);
        expect(screen.getByText('Activity')).toBeInTheDocument();
        expect(
            screen.getAllByText('Updating Chart.tsx').length,
        ).toBeGreaterThan(0);

        view.rerender(
            promptBar({
                build: buildState({ isBuilding: true }),
                isBuilding: true,
                narration: {
                    reasoning: [
                        'Choosing a horizontal layout',
                        'Sorting the categories by value',
                    ],
                    activity: ['Updating Chart.tsx'],
                },
            }),
        );

        expect(
            screen.getAllByText('Sorting the categories by value').length,
        ).toBeGreaterThan(0);
    });

    it('keeps queued prompts above the active build narration', async () => {
        renderWithProviders(
            promptBar({
                build: buildState({ isBuilding: true }),
                isBuilding: true,
                narration: {
                    reasoning: ['Choosing a horizontal layout'],
                    activity: [],
                },
            }),
        );
        const composer = screen.getByPlaceholderText('Ask for another change…');

        await userEvent.type(composer, 'use the brand palette');
        await userEvent.keyboard('{Enter}');
        await userEvent.type(composer, 'add a target line');
        await userEvent.keyboard('{Enter}');

        expect(
            screen.getByRole('list', { name: '2 queued prompts' }),
        ).toBeInTheDocument();
        expect(screen.getByText('Reasoning')).toBeInTheDocument();
        expect(screen.queryByText('Activity')).not.toBeInTheDocument();
        expect(screen.getByText('Building… 0:07')).toBeInTheDocument();
    });

    it('removes live narration when the build settles', () => {
        const narration = {
            reasoning: ['Choosing a horizontal layout'],
            activity: ['Updating Chart.tsx'],
        };
        const view = renderWithProviders(
            promptBar({
                build: buildState({ isBuilding: true }),
                isBuilding: true,
                narration,
            }),
        );

        view.rerender(promptBar({ narration }));

        expect(screen.queryByText('Reasoning')).not.toBeInTheDocument();
        expect(screen.queryByText('Activity')).not.toBeInTheDocument();
    });

    it('shows when cancellation is in progress', () => {
        renderWithProviders(
            promptBar({
                build: buildState({
                    isBuilding: true,
                    isCancelling: true,
                }),
                isBuilding: true,
            }),
        );

        expect(screen.getByText('Cancelling…')).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Cancelling generation' }),
        ).toBeDisabled();
    });

    it('sends a first prompt into the clarifying round rather than the build', async () => {
        const send = vi.fn();
        const clarifySend = vi.fn();
        renderWithProviders(
            promptBar({
                build: buildState({ send }),
                clarification: clarificationStub({ send: clarifySend }),
            }),
        );

        await userEvent.type(
            screen.getByPlaceholderText('Ask for a change…'),
            'show revenue split by team',
        );
        await userEvent.click(screen.getByLabelText('Send'));

        expect(send).not.toHaveBeenCalled();
        expect(clarifySend).toHaveBeenCalledWith({
            description: 'show revenue split by team',
            fileIds: [],
            claudeModel: 'sonnet',
            clarifications: [],
        });
    });

    it('reports the wait on the clarifier, and hands the prompt back on cancel', async () => {
        const abandon = vi.fn(() => 'show revenue split by team');
        renderWithProviders(
            promptBar({
                clarification: clarificationStub({
                    clarifyingPrompt: 'show revenue split by team',
                    abandon,
                }),
            }),
        );

        expect(screen.getByText('Reading your prompt…')).toBeInTheDocument();
        expect(
            screen.getByPlaceholderText('Reading your prompt…'),
        ).toBeDisabled();

        await userEvent.click(screen.getByText('Cancel'));

        expect(abandon).toHaveBeenCalled();
        expect(
            screen.getByDisplayValue('show revenue split by team'),
        ).toBeInTheDocument();
    });

    it('locks the composer while the questions are open, and builds with the answers', async () => {
        const send = vi.fn();
        const build = vi.fn();
        const answer = vi.fn();
        renderWithProviders(
            promptBar({
                build: buildState({ send }),
                clarification: clarificationStub({
                    pending: {
                        prompt: 'show revenue split by team',
                        questions: ['Over time, or one period?'],
                    },
                    answers: [''],
                    answer,
                    build,
                }),
            }),
        );

        const composer = screen.getByPlaceholderText(
            'Answer the questions, or skip, to build…',
        );
        expect(composer).toBeDisabled();
        expect(screen.getByLabelText('Send')).toBeDisabled();
        expect(screen.getByText('0 of 1 answered')).toBeInTheDocument();

        await userEvent.type(
            screen.getByLabelText('Over time, or one period?'),
            'monthly',
        );
        expect(answer).toHaveBeenCalled();

        await userEvent.click(screen.getByRole('button', { name: 'Build' }));

        expect(build).toHaveBeenCalledWith(false);
        expect(send).not.toHaveBeenCalled();
    });

    it('skips the questions and builds anyway', async () => {
        const build = vi.fn();
        renderWithProviders(
            promptBar({
                clarification: clarificationStub({
                    pending: {
                        prompt: 'show revenue split by team',
                        questions: ['Over time, or one period?'],
                    },
                    answers: [''],
                    build,
                }),
            }),
        );

        await userEvent.click(screen.getByText('Skip and build anyway'));

        expect(build).toHaveBeenCalledWith(true);
    });

    it('surfaces a cancellation failure and keeps cancel available', () => {
        renderWithProviders(
            promptBar({
                build: buildState({
                    isBuilding: true,
                    cancelError: 'Request timed out',
                }),
                isBuilding: true,
            }),
        );

        expect(screen.getByRole('alert')).toHaveTextContent(
            'Could not cancel: Request timed out',
        );
        expect(screen.getByText('Cancel')).toBeEnabled();
    });
});
