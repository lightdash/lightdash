import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { forwardRef, useImperativeHandle, useRef, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { type DataAppModelSelection } from '../hooks/useDataAppModelSelection';
import { type DataAppVizBuildState } from '../hooks/useDataAppVizBuild';
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
        }
    >(function MockComposer(
        { placeholder, toolbarRight, onEmptyChange, onSubmit, submitDisabled },
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
): DataAppModelSelection => ({
    selectedModel,
    visibleModels: ['opus', 'sonnet', 'haiku'],
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
}: {
    build?: DataAppVizBuildState;
    isBuilding?: boolean;
    latestReadyVersion?: number | null;
    model?: DataAppModelSelection;
    onCancelBuild?: (() => void) | null;
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
        modelSelection={model}
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
        });
    });

    it('shows the model it will build with', () => {
        renderWithProviders(promptBar({ model: modelSelection('opus') }));

        expect(screen.getByText('Opus')).toBeInTheDocument();
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
