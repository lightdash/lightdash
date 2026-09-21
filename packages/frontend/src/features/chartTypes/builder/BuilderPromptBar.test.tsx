import {
    type ApiAppVersionSummary,
    type AppVersionResources,
    type DataAppClaudeModel,
    type DataAppCodexModel,
} from '@lightdash/common';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
    forwardRef,
    useImperativeHandle,
    useRef,
    type ComponentProps,
    type ReactNode,
} from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { type ClarificationRound } from '../../apps/hooks/useClarificationRound';
import { type DataAppModelSelection } from '../../apps/hooks/useDataAppModelSelection';
import { type UseElementPickerResult } from '../../apps/hooks/useElementPicker';
import { appVersion } from '../../apps/testing/appVersionHistory';
import {
    type DataAppVizBuildState,
    type VizBuildRequest,
} from '../hooks/useDataAppVizBuild';
import { clarificationStub } from '../testing/clarificationRoundStub';
import BuilderPromptBar from './BuilderPromptBar';

const attachmentAdd = vi.hoisted(() => vi.fn());
const showToastError = vi.hoisted(() => vi.fn());
vi.mock('../../../hooks/toaster/useToaster', () => ({
    default: () => ({ showToastError }),
}));

const connections = vi.hoisted(() => ({
    linked: [] as {
        alias: string;
        connection: {
            externalConnectionUuid: string;
            name: string;
            origin: string;
        };
    }[],
    unlink: vi.fn(),
}));
vi.mock('../../../hooks/useProjectUuid', () => ({
    useProjectUuid: () => 'p1',
}));
vi.mock('../../../hooks/useProject', () => ({
    useProject: () => ({ data: undefined }),
}));
vi.mock('../../externalConnections/hooks/useExternalConnections', () => ({
    useExternalConnections: () => ({
        isInitialLoading: false,
        data: [
            {
                externalConnectionUuid: 'stores',
                name: 'Stores API',
                origin: 'https://stores.example.com',
            },
        ],
    }),
}));
vi.mock('../../externalConnections/hooks/useAppExternalConnections', () => ({
    useAppExternalConnections: () => ({ data: connections.linked }),
}));
vi.mock(
    '../../externalConnections/hooks/useUnlinkAppExternalConnection',
    () => ({
        useUnlinkAppExternalConnection: () => ({ mutate: connections.unlink }),
    }),
);

const themeQuery = vi.hoisted(() => ({
    data: [
        { designUuid: 'brand', name: 'Brand', isDefault: true },
        { designUuid: 'nvidia', name: 'Fake NVIDIA', isDefault: false },
    ],
    isLoading: false,
    isError: false,
    isSuccess: true,
    refetch: vi.fn(),
}));
vi.mock('../../organizationDesigns/hooks/useOrganizationDesigns', () => ({
    useOrganizationDesigns: () => themeQuery,
}));
const themedVersion = (designUuid: string | null = 'brand') =>
    appVersion({
        resources: {
            design:
                designUuid === null
                    ? null
                    : { designUuid, name: 'Saved brand', fileCount: 1 },
        } as AppVersionResources,
    });

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
            toolbarLeft: ReactNode;
            attachments: ReactNode;
            onEmptyChange: (isEmpty: boolean) => void;
            onSubmit: () => void;
            submitDisabled?: boolean;
            disabled?: boolean;
        }
    >(function MockComposer(
        {
            placeholder,
            toolbarRight,
            toolbarLeft,
            attachments,
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
                {toolbarLeft}
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
                {attachments}
            </div>
        );
    }),
}));

const composerAttachments = vi.hoisted(() => ({
    fileIds: [] as string[],
    clear: vi.fn(),
}));
vi.mock('../hooks/useVizComposerAttachments', () => ({
    useVizComposerAttachments: () => ({
        attachments: [],
        fileIds: composerAttachments.fileIds,
        isUploading: false,
        add: attachmentAdd,
        remove: vi.fn(),
        clear: composerAttachments.clear,
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
    latestVersion = null,
    hasVersions = true,
    isNewChart = !hasVersions,
    model = modelSelection('sonnet'),
    onCancelBuild = isBuilding ? vi.fn() : null,
    narration = { reasoning: [], activity: [] },
    // A round with nothing to ask passes the request straight to the build,
    // which is what most of these tests are watching for.
    clarification = clarificationStub({ send: build.send }),
    buildContext,
    elementPicker,
    onCaptureScreenshot,
    dataPill,
    suggestion = null,
}: {
    build?: DataAppVizBuildState;
    isBuilding?: boolean;
    latestReadyVersion?: number | null;
    latestVersion?: ApiAppVersionSummary | null;
    hasVersions?: boolean;
    isNewChart?: boolean;
    model?: DataAppModelSelection;
    onCancelBuild?: (() => void) | null;
    narration?: { reasoning: string[]; activity: string[] };
    clarification?: ClarificationRound<VizBuildRequest>;
    buildContext?: VizBuildRequest['context'];
    elementPicker?: UseElementPickerResult;
    onCaptureScreenshot?: () => Promise<File>;
    dataPill?: ReactNode;
    suggestion?: ComponentProps<typeof BuilderPromptBar>['suggestion'];
} = {}) => (
    <MemoryRouter>
        <BuilderPromptBar
            projectUuid="p1"
            composerAppUuid="draft-1"
            sessionKey="session-1"
            hasVersions={hasVersions}
            isNewChart={isNewChart}
            latestVersion={latestVersion}
            isBuilding={isBuilding}
            buildingPrompt={isBuilding ? 'make it teal' : null}
            elapsed={isBuilding ? '0:07' : null}
            latestReadyVersion={latestReadyVersion}
            build={build}
            onCancelBuild={onCancelBuild}
            narration={narration}
            modelSelection={model}
            clarification={clarification}
            buildContext={buildContext}
            elementPicker={elementPicker}
            onCaptureScreenshot={onCaptureScreenshot}
            dataPill={dataPill}
            suggestion={suggestion}
        />
    </MemoryRouter>
);

describe('BuilderPromptBar', () => {
    beforeEach(() => {
        attachmentAdd.mockClear();
        composerAttachments.fileIds = [];
        composerAttachments.clear.mockClear();
        showToastError.mockClear();
        connections.linked = [];
        connections.unlink.mockClear();
        themeQuery.isLoading = false;
        themeQuery.isError = false;
        themeQuery.isSuccess = true;
    });

    it('keeps the host data selector in the context tray', () => {
        renderWithProviders(
            promptBar({ dataPill: <div>Data: Sample data</div> }),
        );

        const tray = screen.getByRole('group', {
            name: 'Selected chart context',
        });
        expect(tray).toHaveTextContent('Data: Sample data');
    });

    it('stages a captured render as a screenshot', async () => {
        const screenshot = new File(['png'], 'screenshot.png', {
            type: 'image/png',
        });
        renderWithProviders(
            promptBar({
                onCaptureScreenshot: vi.fn().mockResolvedValue(screenshot),
            }),
        );

        await userEvent.click(
            screen.getByRole('button', { name: 'Attach screenshot' }),
        );

        await waitFor(() =>
            expect(attachmentAdd).toHaveBeenCalledWith([screenshot], {
                kind: 'screenshot',
            }),
        );
    });

    it('reports a screenshot capture failure', async () => {
        renderWithProviders(
            promptBar({
                onCaptureScreenshot: vi
                    .fn()
                    .mockRejectedValue(new Error('Preview unavailable')),
            }),
        );

        await userEvent.click(
            screen.getByRole('button', { name: 'Attach screenshot' }),
        );

        await waitFor(() =>
            expect(showToastError).toHaveBeenCalledWith({
                title: 'Failed to capture screenshot',
                subtitle: 'Preview unavailable',
            }),
        );
        expect(attachmentAdd).not.toHaveBeenCalled();
    });

    it.each([
        { label: 'missing', sampleRows: undefined },
        { label: 'empty', sampleRows: [] },
    ])(
        'hides sample sharing when real query rows are $label',
        ({ sampleRows }) => {
            renderWithProviders(
                promptBar({
                    buildContext: {
                        schema: {
                            fields: [],
                            configOptions: [],
                            colorPalette: null,
                        },
                        sampleRows,
                    },
                }),
            );
            expect(
                screen.queryByRole('button', { name: 'Include sample data' }),
            ).not.toBeInTheDocument();
        },
    );

    it('omits sample consent when query rows disappear before sending', async () => {
        const send = vi.fn();
        const view = renderWithProviders(
            promptBar({
                build: buildState({ send }),
                buildContext: { sampleRows: [{ orders_status: 'paid' }] },
            }),
        );
        await userEvent.click(
            screen.getByRole('button', { name: 'Include sample data' }),
        );
        view.rerender(
            promptBar({
                build: buildState({ send }),
                buildContext: {
                    schema: {
                        fields: [],
                        configOptions: [],
                        colorPalette: null,
                    },
                },
            }),
        );
        await userEvent.type(
            screen.getByPlaceholderText('Ask for a change…'),
            'Make the labels larger',
        );
        await userEvent.keyboard('{Enter}');
        expect(send.mock.lastCall?.[0].includeSampleData).not.toBe(true);
        expect(send.mock.lastCall?.[0].context).not.toHaveProperty(
            'sampleRows',
        );
    });

    it('keeps current sample rows out of a prompt until explicitly selected', async () => {
        const send = vi.fn();
        const sampleRows = Array.from({ length: 12 }, (_, i) => ({
            orders_status: `status-${i}`,
        }));
        renderWithProviders(
            promptBar({
                build: buildState({ send }),
                buildContext: {
                    schema: { fields: [] },
                    fieldMapping: {},
                    sampleRows,
                } as never,
            }),
        );

        await userEvent.type(
            screen.getByPlaceholderText('Ask for a change…'),
            'First',
        );
        await userEvent.keyboard('{Enter}');
        expect(send.mock.lastCall?.[0].context).not.toHaveProperty(
            'sampleRows',
        );

        const sampleDataButton = screen.getByRole('button', {
            name: 'Include sample data',
        });
        expect(sampleDataButton).toHaveAttribute('aria-pressed', 'false');
        await userEvent.click(sampleDataButton);
        expect(sampleDataButton).toHaveAttribute('aria-pressed', 'true');
        await userEvent.keyboard(' ');
        expect(sampleDataButton).toHaveAttribute('aria-pressed', 'false');
        await userEvent.keyboard(' ');
        expect(sampleDataButton).toHaveAttribute('aria-pressed', 'true');
        await userEvent.type(
            screen.getByPlaceholderText('Ask for a change…'),
            'Second',
        );
        await userEvent.keyboard('{Enter}');
        expect(send.mock.lastCall?.[0].context.sampleRows).toEqual(
            sampleRows.slice(0, 10),
        );
        expect(
            screen.getByRole('button', { name: 'Include sample data' }),
        ).toHaveAttribute('aria-pressed', 'false');

        await userEvent.type(
            screen.getByPlaceholderText('Ask for a change…'),
            'Third',
        );
        await userEvent.keyboard('{Enter}');
        expect(send.mock.lastCall?.[0].context).not.toHaveProperty(
            'sampleRows',
        );
    });

    it('hides sample data consent when the server disables it', async () => {
        const send = vi.fn();
        renderWithProviders(
            promptBar({
                build: buildState({ send }),
                buildContext: { sampleRows: [{ orders_status: 'paid' }] },
            }),
            {
                health: {
                    dataApps: { previewOrigin: null, sampleDataEnabled: false },
                },
            },
        );

        await waitFor(() =>
            expect(
                screen.queryByRole('button', {
                    name: 'Include sample data',
                }),
            ).not.toBeInTheDocument(),
        );
        await userEvent.type(
            screen.getByPlaceholderText('Ask for a change…'),
            'Make a chart',
        );
        await userEvent.keyboard('{Enter}');
        expect(send.mock.lastCall?.[0].includeSampleData).not.toBe(true);
        expect(send.mock.lastCall?.[0].context).toBeUndefined();
    });

    it('shows selected elements and lets the author remove one', async () => {
        const remove = vi.fn();
        const elementPicker = {
            available: true,
            enabled: false,
            refs: [{ tag: 'button', text: 'Save', loc: '' }],
            toggle: vi.fn(),
            remove,
            clear: vi.fn(),
            iframeProps: {},
        } as unknown as UseElementPickerResult;
        renderWithProviders(promptBar({ elementPicker }));

        await userEvent.click(
            screen.getByRole('button', { name: 'Remove <button> Save' }),
        );
        expect(remove).toHaveBeenCalledWith(elementPicker.refs[0]);
    });

    it('keeps theme selection in the context tray, outside composer options', async () => {
        renderWithProviders(promptBar({ hasVersions: false }));
        await userEvent.click(
            screen.getByRole('button', { name: 'Composer options' }),
        );
        expect(
            screen.queryByRole('button', { name: /Choose theme|Apply theme/ }),
        ).not.toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Attach an image or file' }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Add external connections' }),
        ).toBeInTheDocument();
        await userEvent.keyboard('{Escape}');
        await userEvent.click(
            screen.getByRole('button', { name: 'Theme: Brand' }),
        );
        expect(
            screen.queryByRole('button', { name: 'Back to composer options' }),
        ).not.toBeInTheDocument();
        await userEvent.click(
            screen.getByRole('menuitem', { name: 'Fake NVIDIA' }),
        );
        expect(
            screen.getByRole('button', { name: 'Theme: Fake NVIDIA' }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Back to composer options' }),
        ).not.toBeInTheDocument();
    });

    it('changes the inline model without sending the draft', async () => {
        const model = modelSelection('sonnet');
        const send = vi.fn();
        renderWithProviders(promptBar({ model, build: buildState({ send }) }));
        await userEvent.type(
            screen.getByPlaceholderText('Ask for a change…'),
            'Keep this draft',
        );
        await userEvent.click(screen.getByRole('button', { name: 'Sonnet' }));
        await userEvent.click(screen.getByRole('menuitem', { name: /Opus/ }));
        expect(model.setModel).toHaveBeenCalledWith('opus');
        expect(screen.getByPlaceholderText('Ask for a change…')).toHaveValue(
            'Keep this draft',
        );
        expect(send).not.toHaveBeenCalled();
    });

    it('opens the file chooser from composer options', async () => {
        const { container } = renderWithProviders(promptBar());
        const input =
            container.querySelector<HTMLInputElement>('input[type="file"]')!;
        const click = vi.spyOn(input, 'click');
        await userEvent.click(
            screen.getByRole('button', { name: 'Composer options' }),
        );
        await userEvent.click(
            screen.getByRole('button', { name: 'Attach an image or file' }),
        );
        expect(click).toHaveBeenCalledOnce();
    });

    it('keeps back navigation available in the connections panel', async () => {
        renderWithProviders(promptBar());
        await userEvent.click(
            screen.getByRole('button', { name: 'Composer options' }),
        );
        await userEvent.click(
            screen.getByRole('button', { name: 'Add external connections' }),
        );
        await userEvent.click(
            screen.getByRole('button', { name: 'Back to composer options' }),
        );
        expect(
            screen.getByRole('button', { name: 'Attach an image or file' }),
        ).toBeInTheDocument();
    });

    it('adds connection chips, removes them, and sends only the selected connections', async () => {
        const send = vi.fn();
        renderWithProviders(promptBar({ build: buildState({ send }) }));
        await userEvent.click(
            screen.getByRole('button', { name: 'Composer options' }),
        );
        await userEvent.click(
            screen.getByRole('button', { name: 'Add external connections' }),
        );
        await userEvent.click(
            screen.getByRole('checkbox', { name: /Stores API/ }),
        );
        await userEvent.click(screen.getByRole('button', { name: 'Done' }));
        expect(
            screen.getByRole('button', {
                name: 'Remove connection: Stores API',
            }),
        ).toBeInTheDocument();
        await userEvent.click(
            screen.getByRole('button', {
                name: 'Remove connection: Stores API',
            }),
        );
        expect(screen.queryByText('Stores API')).not.toBeInTheDocument();
        await userEvent.click(
            screen.getByRole('button', { name: 'Composer options' }),
        );
        await userEvent.click(
            screen.getByRole('button', { name: 'Add external connections' }),
        );
        await userEvent.click(
            screen.getByRole('checkbox', { name: /Stores API/ }),
        );
        await userEvent.click(screen.getByRole('button', { name: 'Done' }));
        await userEvent.type(
            screen.getByPlaceholderText('Ask for a change…'),
            'Plot the stores',
        );
        await userEvent.click(screen.getByLabelText('Send'));
        expect(send).toHaveBeenCalledWith(
            expect.objectContaining({
                externalConnections: [
                    {
                        externalConnectionUuid: 'stores',
                        name: 'Stores API',
                        alias: 'stores_api',
                    },
                ],
            }),
        );
    });

    it('shows linked connections as chips and preserves the unlink confirmation', async () => {
        connections.linked = [
            {
                alias: 'stores_api',
                connection: {
                    externalConnectionUuid: 'stores',
                    name: 'Stores API',
                    origin: 'https://stores.example.com',
                },
            },
        ];
        renderWithProviders(promptBar());
        await userEvent.click(
            screen.getByRole('button', {
                name: 'Manage connection: Stores API',
            }),
        );
        await userEvent.click(
            screen.getByRole('checkbox', { name: /Stores API/ }),
        );
        expect(
            screen.getByRole('dialog', { name: 'Unlink Stores API?' }),
        ).toHaveTextContent('Unlink Stores API?');
        expect(connections.unlink).not.toHaveBeenCalled();
        await userEvent.click(
            screen.getByRole('button', { name: 'Keep connection' }),
        );
        expect(connections.unlink).not.toHaveBeenCalled();
    });

    it('uses the organization default for a new chart and sends the selected theme after clarification', async () => {
        const send = vi.fn();
        renderWithProviders(
            promptBar({
                hasVersions: false,
                clarification: clarificationStub({ send }),
            }),
        );
        expect(
            screen.getByRole('button', { name: 'Theme: Brand' }),
        ).toBeInTheDocument();
        await userEvent.click(
            screen.getByRole('button', { name: 'Theme: Brand' }),
        );
        await userEvent.click(
            screen.getByRole('menuitem', { name: 'Fake NVIDIA' }),
        );
        expect(send).not.toHaveBeenCalled();
        await userEvent.type(
            screen.getByPlaceholderText('Describe a new chart type…'),
            'A heatmap',
        );
        await userEvent.click(screen.getByLabelText('Send'));
        expect(send).toHaveBeenCalledWith(
            expect.objectContaining({
                description: 'A heatmap',
                designUuid: 'nvidia',
            }),
        );
    });

    it('sends explicit no theme for new charts instead of restoring the organization default', async () => {
        const send = vi.fn();
        renderWithProviders(
            promptBar({ hasVersions: false, build: buildState({ send }) }),
        );
        await userEvent.click(
            screen.getByRole('button', { name: 'Theme: Brand' }),
        );
        await userEvent.click(
            screen.getByRole('menuitem', { name: /^No theme/ }),
        );
        expect(
            screen.getByRole('button', { name: 'Apply theme' }),
        ).toBeInTheDocument();
        await userEvent.type(
            screen.getByPlaceholderText('Describe a new chart type…'),
            'A heatmap',
        );
        await userEvent.click(screen.getByLabelText('Send'));
        expect(send).toHaveBeenCalledWith(
            expect.objectContaining({ designUuid: null }),
        );
    });

    it('reopens with the saved theme and rebuilds on a theme change without sending the draft prompt', async () => {
        const send = vi.fn();
        renderWithProviders(
            promptBar({
                latestVersion: themedVersion(),
                build: buildState({ send }),
            }),
        );
        await userEvent.type(
            screen.getByPlaceholderText('Ask for a change…'),
            'Keep this draft',
        );
        await userEvent.click(
            screen.getByRole('button', { name: 'Theme: Brand' }),
        );
        await userEvent.click(
            screen.getByRole('menuitem', { name: 'Fake NVIDIA' }),
        );
        expect(send).toHaveBeenCalledWith({
            description: 'Apply theme: Fake NVIDIA',
            designUuid: 'nvidia',
            fileIds: [],
            clarifications: [],
            externalConnections: [],
            claudeModel: 'sonnet',
        });
        expect(screen.getByPlaceholderText('Ask for a change…')).toHaveValue(
            'Keep this draft',
        );
    });

    it('keeps existing unthemed charts unthemed and ordinary edits inherit', async () => {
        const send = vi.fn();
        renderWithProviders(
            promptBar({
                latestVersion: themedVersion(null),
                build: buildState({ send }),
            }),
        );
        expect(
            screen.getByRole('button', { name: 'Apply theme' }),
        ).toBeInTheDocument();
        await userEvent.type(
            screen.getByPlaceholderText('Ask for a change…'),
            'Change the labels',
        );
        await userEvent.click(screen.getByLabelText('Send'));
        expect(send.mock.calls[0][0]).not.toHaveProperty('designUuid');
    });

    it('removes an existing theme with an explicit null', async () => {
        const send = vi.fn();
        renderWithProviders(
            promptBar({
                latestVersion: themedVersion(),
                build: buildState({ send }),
            }),
        );
        await userEvent.click(
            screen.getByRole('button', { name: 'Theme: Brand' }),
        );
        await userEvent.click(
            screen.getByRole('menuitem', { name: /^No theme/ }),
        );
        expect(send).toHaveBeenCalledWith(
            expect.objectContaining({
                description: 'Remove theme',
                designUuid: null,
            }),
        );
    });

    it('disables theme changes during builds and while themes load', () => {
        const { rerender } = renderWithProviders(
            promptBar({ isBuilding: true, latestVersion: themedVersion() }),
        );
        expect(
            screen.getByRole('button', { name: 'Theme: Brand' }),
        ).toBeDisabled();
        themeQuery.isLoading = true;
        themeQuery.isSuccess = false;
        rerender(promptBar({ hasVersions: false }));
        expect(
            screen.getByRole('button', { name: 'Theme: Loading themes…' }),
        ).toBeDisabled();
    });

    it('keeps the saved theme name when it no longer exists in the organization list', () => {
        renderWithProviders(
            promptBar({ latestVersion: themedVersion('deleted') }),
        );
        expect(
            screen.getByRole('button', { name: 'Theme: Saved brand' }),
        ).toBeInTheDocument();
    });

    it('does not attach a theme change to prompts queued during the first build', async () => {
        const send = vi.fn();
        const { rerender } = renderWithProviders(
            promptBar({
                hasVersions: false,
                isBuilding: true,
                build: buildState({ send }),
            }),
        );
        await userEvent.type(
            screen.getByPlaceholderText('Ask for another change…'),
            'Keep the labels',
        );
        await userEvent.click(screen.getByLabelText('Queue message'));
        rerender(
            promptBar({
                latestReadyVersion: 1,
                latestVersion: themedVersion(),
                build: buildState({ send }),
            }),
        );
        await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
        expect(send.mock.calls[0][0]).toMatchObject({
            description: 'Keep the labels',
        });
        expect(send.mock.calls[0][0]).not.toHaveProperty('designUuid');
    });

    it('sends the organization default on the first build without requiring a selection', async () => {
        const send = vi.fn();
        renderWithProviders(
            promptBar({ hasVersions: false, build: buildState({ send }) }),
        );
        await userEvent.type(
            screen.getByPlaceholderText('Describe a new chart type…'),
            'A bar chart',
        );
        await userEvent.click(screen.getByLabelText('Send'));
        expect(send).toHaveBeenCalledWith(
            expect.objectContaining({ designUuid: 'brand' }),
        );
    });

    it('retries a failed theme listing', async () => {
        themeQuery.isError = true;
        themeQuery.isSuccess = false;
        renderWithProviders(promptBar({ latestVersion: themedVersion() }));
        expect(
            screen.getByRole('button', { name: 'Theme: Brand' }),
        ).toBeDisabled();
        await userEvent.click(
            screen.getByRole('button', { name: 'Retry themes' }),
        );
        expect(themeQuery.refetch).toHaveBeenCalled();
    });

    it('blocks a first build when the theme list could not be loaded', async () => {
        themeQuery.isError = true;
        themeQuery.isSuccess = false;
        const send = vi.fn();
        renderWithProviders(
            promptBar({ hasVersions: false, build: buildState({ send }) }),
        );
        await userEvent.type(
            screen.getByPlaceholderText('Describe a new chart type…'),
            'A bar chart',
        );
        expect(
            screen.getByRole('button', { name: 'Theme: Themes unavailable' }),
        ).toBeDisabled();
        expect(screen.getByLabelText('Send')).toBeDisabled();
        expect(send).not.toHaveBeenCalled();
    });

    it('does not rebuild when selecting the current theme', async () => {
        const send = vi.fn();
        renderWithProviders(
            promptBar({
                latestVersion: themedVersion(),
                build: buildState({ send }),
            }),
        );
        await userEvent.click(
            screen.getByRole('button', { name: 'Theme: Brand' }),
        );
        await userEvent.click(
            screen.getByRole('menuitem', { name: /Brand Default/ }),
        );
        expect(send).not.toHaveBeenCalled();
    });

    it('disables an already-open theme menu when a build begins', async () => {
        const send = vi.fn();
        const { rerender } = renderWithProviders(
            promptBar({
                latestVersion: themedVersion(),
                build: buildState({ send }),
            }),
        );
        await userEvent.click(
            screen.getByRole('button', { name: 'Theme: Brand' }),
        );
        rerender(
            promptBar({
                latestVersion: themedVersion(),
                isBuilding: true,
                build: buildState({ send }),
            }),
        );
        expect(
            screen.getByRole('menuitem', { name: 'Fake NVIDIA' }),
        ).toBeDisabled();
        await userEvent.click(
            screen.getByRole('menuitem', { name: 'Fake NVIDIA' }),
        );
        expect(send).not.toHaveBeenCalled();
    });

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
            externalConnections: [],
        });
    });

    it('shows the model it will build with beside send', () => {
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
            externalConnections: [],
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
                context: undefined,
                includeSampleData: false,
                fileIds: [],
                claudeModel: 'sonnet',
                clarifications: [],
                externalConnections: [],
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

    it('refreshes queued schema, mapping, and opted-in sample data', async () => {
        const send = vi.fn();
        const oldContext = {
            schema: {
                fields: [
                    {
                        name: 'old',
                        label: 'Old',
                        type: 'dimension',
                        required: true,
                    },
                ],
            },
            fieldMapping: { old: 'orders_old' },
            sampleRows: [{ orders_old: 'at submit' }],
        } as unknown as NonNullable<VizBuildRequest['context']>;
        const newContext = {
            schema: {
                fields: [
                    {
                        name: 'new',
                        label: 'New',
                        type: 'dimension',
                        required: true,
                    },
                ],
            },
            fieldMapping: { new: 'orders_new' },
            sampleRows: [{ orders_new: 'after build' }],
        } as unknown as NonNullable<VizBuildRequest['context']>;
        const view = renderWithProviders(
            promptBar({
                build: buildState({ isBuilding: true, send }),
                isBuilding: true,
                buildContext: oldContext,
            }),
        );

        await userEvent.click(
            screen.getByRole('button', { name: 'Include sample data' }),
        );
        await userEvent.type(
            screen.getByPlaceholderText('Ask for another change…'),
            'Revise it',
        );
        await userEvent.keyboard('{Enter}');

        view.rerender(
            promptBar({
                build: buildState({ send }),
                latestReadyVersion: 2,
                buildContext: newContext,
            }),
        );

        await waitFor(() =>
            expect(send).toHaveBeenCalledWith(
                expect.objectContaining({
                    context: {
                        schema: newContext.schema,
                        fieldMapping: newContext.fieldMapping,
                        sampleRows: newContext.sampleRows,
                    },
                }),
            ),
        );
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
                context: undefined,
                includeSampleData: false,
                fileIds: [],
                claudeModel: 'sonnet',
                clarifications: [],
                externalConnections: [],
            }),
        );
    });

    it('switches a single build action between stop and queue as the draft changes', async () => {
        const cancel = vi.fn();
        renderWithProviders(
            promptBar({ isBuilding: true, onCancelBuild: cancel }),
        );
        const input = screen.getByPlaceholderText('Ask for another change…');
        expect(
            screen.getByRole('button', { name: 'Stop generation' }),
        ).toBeEnabled();
        expect(
            screen.queryByRole('button', { name: 'Queue message' }),
        ).not.toBeInTheDocument();
        await userEvent.type(input, 'Make it green');
        expect(
            screen.queryByRole('button', { name: 'Stop generation' }),
        ).not.toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Queue message' }),
        ).toBeEnabled();
        expect(screen.queryByText('Enter to queue')).not.toBeInTheDocument();
        await userEvent.clear(input);
        expect(
            screen.getByRole('button', { name: 'Stop generation' }),
        ).toBeEnabled();
        expect(
            screen.queryByRole('button', { name: 'Queue message' }),
        ).not.toBeInTheDocument();
        await userEvent.click(
            screen.getByRole('button', { name: 'Stop generation' }),
        );
        expect(cancel).toHaveBeenCalledOnce();
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

        expect(
            screen.queryByRole('button', { name: 'Stop generation' }),
        ).not.toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Queue message' }),
        ).toBeEnabled();

        await userEvent.click(
            screen.getByRole('button', { name: 'Queue message' }),
        );
        expect(
            screen.getByRole('button', { name: 'Stop generation' }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Queue message' }),
        ).not.toBeInTheDocument();

        await userEvent.click(screen.getByText('Cancel'));

        expect(discard).toHaveBeenCalledOnce();
        expect(interrupt).not.toHaveBeenCalled();
    });

    it('stops an active build without draining queued prompts', async () => {
        const send = vi.fn();
        const cancel = vi.fn();
        const view = renderWithProviders(
            promptBar({
                build: buildState({ isBuilding: true, send }),
                isBuilding: true,
                latestReadyVersion: 1,
                onCancelBuild: cancel,
            }),
        );

        await userEvent.type(
            screen.getByPlaceholderText('Ask for another change…'),
            'make the markers red',
        );
        await userEvent.keyboard('{Enter}');

        await userEvent.click(
            screen.getByRole('button', { name: 'Stop generation' }),
        );
        expect(cancel).toHaveBeenCalledOnce();

        view.rerender(
            promptBar({
                build: buildState({ send }),
                latestReadyVersion: 2,
            }),
        );

        expect(send).not.toHaveBeenCalled();
        expect(screen.getByText('make the markers red')).toBeInTheDocument();
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
            externalConnections: [],
        });
    });

    it('reports the wait on the clarifier, and hands the prompt back on cancel', async () => {
        const abandon = vi.fn(
            (): VizBuildRequest => ({
                description: 'show revenue split by team',
                fileIds: [],
                claudeModel: 'haiku',
                clarifications: [],
                externalConnections: [],
            }),
        );
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

    it('offers attaching external connections from composer options', async () => {
        renderWithProviders(promptBar());
        await userEvent.click(
            screen.getByRole('button', { name: 'Composer options' }),
        );
        expect(
            screen.getByRole('button', { name: 'Add external connections' }),
        ).toBeInTheDocument();
    });

    it('restores the attached connections when the clarifier is cancelled', async () => {
        const abandon = vi.fn(
            (): VizBuildRequest => ({
                description: 'a map of stores',
                fileIds: [],
                claudeModel: 'haiku',
                clarifications: [],
                externalConnections: [
                    {
                        externalConnectionUuid: 'connection-1',
                        name: 'Stores API',
                        alias: 'stores_api',
                    },
                ],
            }),
        );
        renderWithProviders(
            promptBar({
                clarification: clarificationStub({
                    clarifyingPrompt: 'a map of stores',
                    abandon,
                }),
            }),
        );

        await userEvent.click(screen.getByText('Cancel'));

        expect(
            screen.getByRole('button', {
                name: 'Remove connection: Stores API',
            }),
        ).toBeInTheDocument();
    });

    describe('data suggestion round', () => {
        const suggestionStub = (
            overrides: Partial<
                NonNullable<
                    ComponentProps<typeof BuilderPromptBar>['suggestion']
                >
            > = {},
        ) => ({
            startFromPrompt: vi.fn(() => true),
            submitHint: vi.fn(() => false),
            isRequesting: false,
            isOpen: false,
            pendingBuild: null,
            clearPendingBuild: vi.fn(),
            sheet: null,
            ...overrides,
        });

        it('hands a send to the suggestion round instead of the build', async () => {
            const clarification = clarificationStub();
            const suggestion = suggestionStub();
            renderWithProviders(promptBar({ clarification, suggestion }));

            await userEvent.type(
                screen.getByPlaceholderText('Ask for a change…'),
                'A Sankey of channel to plan',
            );
            await userEvent.click(screen.getByLabelText('Send'));

            expect(suggestion.startFromPrompt).toHaveBeenCalledWith(
                expect.objectContaining({
                    description: 'A Sankey of channel to plan',
                }),
            );
            expect(clarification.send).not.toHaveBeenCalled();
        });

        it('sends as usual when the round declines the prompt', async () => {
            const clarification = clarificationStub();
            const suggestion = suggestionStub({
                startFromPrompt: vi.fn(() => false),
            });
            renderWithProviders(promptBar({ clarification, suggestion }));

            await userEvent.type(
                screen.getByPlaceholderText('Ask for a change…'),
                'Make it teal',
            );
            await userEvent.click(screen.getByLabelText('Send'));

            expect(clarification.send).toHaveBeenCalledOnce();
        });

        it('takes what the author meant back to the round, not to a build', async () => {
            const clarification = clarificationStub();
            const suggestion = suggestionStub({
                isOpen: true,
                submitHint: vi.fn(() => true),
                sheet: <div>Data for this chart</div>,
            });
            renderWithProviders(promptBar({ clarification, suggestion }));

            expect(screen.getByText('Data for this chart')).toBeInTheDocument();
            await userEvent.type(
                screen.getByPlaceholderText(
                    'Tell Chart Studio what data you had in mind…',
                ),
                'Use orders instead',
            );
            await userEvent.click(screen.getByLabelText('Send'));

            expect(suggestion.submitHint).toHaveBeenCalledWith(
                'Use orders instead',
            );
            expect(suggestion.startFromPrompt).not.toHaveBeenCalled();
            expect(clarification.send).not.toHaveBeenCalled();
        });

        it('waits for the round rather than taking text while it asks', () => {
            renderWithProviders(
                promptBar({
                    suggestion: suggestionStub({ isRequesting: true }),
                }),
            );

            expect(
                screen.getByPlaceholderText('Finding data for your prompt…'),
            ).toBeDisabled();
        });

        it('sends the build a resolved round released, with the rows it ran', () => {
            const clarification = clarificationStub();
            const suggestion = suggestionStub({
                pendingBuild: {
                    request: {
                        description: 'A Sankey of channel to plan',
                        fileIds: [],
                        clarifications: [],
                        externalConnections: [],
                        claudeModel: 'opus',
                    },
                    hasRows: true,
                },
            });
            renderWithProviders(
                promptBar({
                    clarification,
                    suggestion,
                    buildContext: { sampleRows: [{ channel: 'Paid' }] },
                }),
            );

            expect(suggestion.clearPendingBuild).toHaveBeenCalledOnce();
            expect(clarification.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    description: 'A Sankey of channel to plan',
                    includeSampleData: true,
                    context: { sampleRows: [{ channel: 'Paid' }] },
                }),
            );
        });

        it('sends nothing on its own while the round is still open', () => {
            const clarification = clarificationStub();
            renderWithProviders(
                promptBar({
                    clarification,
                    suggestion: suggestionStub({ isOpen: true }),
                }),
            );

            expect(clarification.send).not.toHaveBeenCalled();
        });

        it('carries a file attached while the sheet was open into the build', () => {
            composerAttachments.fileIds = ['file-2'];
            const clarification = clarificationStub();
            const suggestion = suggestionStub({
                pendingBuild: {
                    request: {
                        description: 'A Sankey of channel to plan',
                        fileIds: ['file-1'],
                        clarifications: [],
                        externalConnections: [],
                        claudeModel: 'opus',
                    },
                    hasRows: false,
                },
            });
            renderWithProviders(promptBar({ clarification, suggestion }));

            expect(clarification.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    description: 'A Sankey of channel to plan',
                    fileIds: ['file-1', 'file-2'],
                }),
            );
            expect(composerAttachments.clear).toHaveBeenCalledOnce();
        });

        it('builds once from one released round, whatever the re-renders', () => {
            const clarification = clarificationStub();
            const suggestion = suggestionStub({
                pendingBuild: {
                    request: {
                        description: 'A Sankey of channel to plan',
                        fileIds: [],
                        clarifications: [],
                        externalConnections: [],
                        claudeModel: 'opus',
                    },
                    hasRows: false,
                },
            });
            const view = promptBar({ clarification, suggestion });
            const { rerender } = renderWithProviders(view);
            rerender(view);
            rerender(view);

            expect(clarification.send).toHaveBeenCalledTimes(1);
        });
    });
});
