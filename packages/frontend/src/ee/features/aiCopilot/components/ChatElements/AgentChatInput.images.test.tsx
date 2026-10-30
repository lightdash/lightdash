import { FeatureFlags } from '@lightdash/common';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ComponentProps } from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router';
import { renderWithProviders } from '../../../../../testing/testUtils';
import type * as AiAgentApiHooks from '../../hooks/useProjectAiAgents';
import {
    type ThreadFileAttachment,
    type ThreadImageAttachment,
} from '../../hooks/useThreadFileAttachment';
import { store } from '../../store';
import { AgentChatInput } from './AgentChatInput';

const mocks = vi.hoisted(() => {
    const ready: { callback: (file: ThreadFileAttachment) => void } = {
        callback: () => undefined,
    };
    return {
        ready,
        imagesEnabled: true,
        active: false,
        images: vi.fn<(files: File[]) => Promise<void>>(),
        documents: vi.fn<(files: File[]) => Promise<void>>(),
        retain: vi.fn(),
        release: vi.fn(),
        clear: vi.fn(),
        discard: vi.fn(),
        toast: vi.fn(),
        info: vi.fn(),
        steer: vi.fn(),
    };
});
vi.mock('../../hooks/useThreadFileAttachment', () => ({
    useThreadFileAttachment: ({
        onReady,
    }: {
        onReady: (file: ThreadFileAttachment) => void;
    }) => {
        mocks.ready.callback = onReady;
        return {
            attachFiles: mocks.documents,
            attachImages: mocks.images,
            imagesEnabled: mocks.imagesEnabled,
            cancelPendingFile: vi.fn(),
            clearPreviews: mocks.clear,
            releaseFiles: mocks.release,
            discardFile: mocks.discard,
            isUploading: false,
            pendingFiles: [],
            retainFiles: mocks.retain,
        };
    },
}));
vi.mock('../../../../../hooks/toaster/useToaster', () => ({
    default: () => ({ showToastError: mocks.toast, showToastInfo: mocks.info }),
}));
vi.mock('../../../../../features/aiAccess/api', () => ({
    useMyAiAccess: () => ({
        isAccessRequired: true,
        data: { refusal: null },
        isLoading: false,
        isFetching: false,
        isError: false,
        refetch: vi.fn(),
    }),
}));
vi.mock('../../../../../hooks/useSnowflake', () => ({
    useSnowflakeAiLoginPopup: () => ({
        mutate: vi.fn(),
        isLoading: false,
        error: null,
    }),
}));
vi.mock('../../../../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: (flag: FeatureFlags) => ({
        data: {
            enabled:
                flag === FeatureFlags.AiThreadImages && mocks.imagesEnabled,
        },
    }),
}));
vi.mock('../../hooks/useAgentSuggestions', () => ({
    useAgentSuggestions: () => ({
        data: {
            chips: [
                {
                    kind: 'prompt',
                    label: 'Show revenue',
                    prompt: 'Show revenue',
                    tool: 'query',
                },
            ],
        },
        isError: false,
    }),
}));
vi.mock('../../hooks/useDeepResearch', () => ({
    useHasActiveDeepResearchRun: () => false,
}));
vi.mock('../../streaming/useAiAgentThreadStreamQuery', () => ({
    useAiAgentThreadStreamQuery: () =>
        mocks.active
            ? {
                  connection: { status: 'streaming' },
                  messageUuid: 'assistant-1',
              }
            : undefined,
}));
vi.mock('../../hooks/useProjectAiAgents', async (importOriginal) => ({
    ...(await importOriginal<typeof AiAgentApiHooks>()),
    useCreateAiAgentThreadMessageSteerMutation: () => ({
        mutateAsync: mocks.steer,
        isLoading: false,
    }),
}));

const image: ThreadImageAttachment = {
    type: 'thread_image',
    fileUuid: 'image-1',
    fileName: 'chart.png',
    sizeBytes: 1024,
    mediaType: 'image/png',
    width: 1600,
    height: 900,
    expiresAt: '2100-01-01T00:00:00.000Z',
    previewUrl: 'blob:private-preview',
};
const deferred = () => {
    let resolve: (value: unknown) => void = () => undefined;
    let reject: (error: Error) => void = () => undefined;
    const promise = new Promise<unknown>((accept, fail) => {
        resolve = accept;
        reject = fail;
    });
    return { promise, resolve, reject };
};
const renderInput = (
    props: Partial<ComponentProps<typeof AgentChatInput>> = {},
) => {
    const element = (
        inputProps: Partial<ComponentProps<typeof AgentChatInput>>,
    ) => (
        <Provider store={store}>
            <MemoryRouter>
                <AgentChatInput
                    projectUuid="project-1"
                    agentUuid="agent-1"
                    threadUuid="thread-1"
                    defaultValue="Recreate this chart"
                    showSuggestions={false}
                    onSubmit={() => undefined}
                    {...inputProps}
                />
            </MemoryRouter>
        </Provider>
    );
    const rendered = renderWithProviders(element(props));
    return {
        ...rendered,
        rerenderInput: (next: Partial<ComponentProps<typeof AgentChatInput>>) =>
            rendered.rerender(element({ ...props, ...next })),
    };
};
const attachReadyImage = () => {
    act(() => {
        mocks.ready.callback(image);
    });
};
const send = () => {
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
};
const paste = (file: File) =>
    fireEvent.paste(screen.getByRole('textbox'), {
        clipboardData: {
            items: [{ kind: 'file', type: file.type, getAsFile: () => file }],
            getData: () => '',
        },
    });
beforeAll(() => {
    Range.prototype.getClientRects = () => document.body.getClientRects();
    Range.prototype.getBoundingClientRect = () => new DOMRect();
});
beforeEach(() => {
    vi.clearAllMocks();
    mocks.retain.mockReset();
    mocks.imagesEnabled = true;
    mocks.active = false;
    mocks.images.mockResolvedValue(undefined);
    mocks.documents.mockResolvedValue(undefined);
    mocks.steer.mockResolvedValue(undefined);
});

test('image submit retains before invoking the real promise, preserves rejected drafts and strips preview URLs', async () => {
    const request = deferred();
    const order: string[] = [];
    mocks.retain.mockImplementation(() => {
        order.push('retain');
    });
    const onSubmit = vi.fn<ComponentProps<typeof AgentChatInput>['onSubmit']>(
        () => {
            order.push('submit');
            return request.promise;
        },
    );
    renderInput({ onSubmit });
    attachReadyImage();
    send();
    expect(order).toEqual(['retain', 'submit']);
    expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
            context: [{ type: 'thread_image', fileUuid: 'image-1' }],
            optimisticContext: [
                expect.objectContaining({
                    type: 'thread_image',
                    width: 1600,
                    expiresAt: image.expiresAt,
                }),
            ],
        }),
    );
    expect(JSON.stringify(onSubmit.mock.calls)).not.toContain('previewUrl');
    expect(JSON.stringify(onSubmit.mock.calls)).not.toContain('blob:');
    expect(screen.getByAltText('chart.png')).toHaveAttribute(
        'src',
        image.previewUrl,
    );
    expect(screen.getByRole('textbox')).toHaveTextContent(
        'Recreate this chart',
    );
    expect(mocks.clear).not.toHaveBeenCalled();
    await act(async () => {
        request.reject(new Error('Claim failed'));
        await request.promise.catch(() => undefined);
    });
    expect(mocks.release).toHaveBeenCalledWith(['image-1']);
    expect(mocks.discard).not.toHaveBeenCalled();
    expect(mocks.clear).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox')).toHaveTextContent(
        'Recreate this chart',
    );
    expect(screen.getByAltText('chart.png')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send message' })).toBeEnabled();
});

test('successful image submission clears draft and releases preview resources only after acknowledgment', async () => {
    const request = deferred();
    const onSubmit = vi.fn(() => request.promise);
    renderInput({ onSubmit });
    attachReadyImage();
    send();
    send();
    expect(onSubmit).toHaveBeenCalledOnce();
    expect(mocks.clear).not.toHaveBeenCalled();
    await act(async () => {
        request.resolve(undefined);
        await request.promise;
    });
    expect(screen.getByRole('textbox').textContent).toBe('');
    expect(screen.queryByAltText('chart.png')).not.toBeInTheDocument();
    expect(mocks.clear).toHaveBeenCalledWith(['image-1']);
    expect(mocks.release).not.toHaveBeenCalled();
});

test('text-only submissions still clear synchronously even if the returned promise later rejects', async () => {
    const request = deferred();
    renderInput({ onSubmit: () => request.promise });
    send();
    expect(screen.getByRole('textbox').textContent).toBe('');
    await act(async () => {
        request.reject(new Error('Text failed'));
        await request.promise.catch(() => undefined);
    });
    expect(mocks.release).not.toHaveBeenCalled();
});

test('clearOnSubmit false keeps the draft and preview after acknowledgment', async () => {
    renderInput({ clearOnSubmit: false, onSubmit: async () => undefined });
    attachReadyImage();
    send();
    await waitFor(() =>
        expect(
            screen.getByRole('button', { name: 'Send message' }),
        ).toBeEnabled(),
    );
    expect(screen.getByRole('textbox')).toHaveTextContent(
        'Recreate this chart',
    );
    expect(screen.getByAltText('chart.png')).toBeInTheDocument();
    expect(mocks.clear).not.toHaveBeenCalled();
});

test('the picker is available for eligible chat and image clipboard paste alone is intercepted', async () => {
    renderInput();
    expect(
        screen.getAllByLabelText('Image attachments').length,
    ).toBeGreaterThan(0);
    const file = new File(['png'], 'clipboard.png', { type: 'image/png' });
    expect(paste(file)).toBe(false);
    expect(mocks.images).toHaveBeenCalledWith([file]);
    mocks.images.mockClear();
    fireEvent.paste(screen.getByRole('textbox'), {
        clipboardData: {
            items: [],
            getData: (type: string) =>
                type === 'text/plain' ? ' ordinary text' : '',
        },
    });
    expect(screen.getByRole('textbox')).toHaveTextContent('ordinary text');
    expect(mocks.images).not.toHaveBeenCalled();
});

test('flag-off drops reach the image gate, never the document endpoint', async () => {
    mocks.imagesEnabled = false;
    const { container } = renderInput();
    expect(
        screen.queryByLabelText('Image attachments'),
    ).not.toBeInTheDocument();
    const file = new File(['png'], 'chart.png', { type: 'image/png' });
    fireEvent.drop(screen.getByRole('textbox').parentElement ?? container, {
        dataTransfer: { types: ['Files'], files: [file] },
    });
    await waitFor(() => expect(mocks.images).toHaveBeenCalledWith([file]));
    expect(mocks.documents).not.toHaveBeenCalled();
});

test('magic-sniffed images route before filename-based CSV fallback while documents stay unchanged', async () => {
    const { container } = renderInput();
    const disguised = new File(
        [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])],
        'looks-like.csv',
        { type: 'text/plain' },
    );
    const notes = new File(['notes'], 'notes.txt', { type: 'text/plain' });
    const csv = new File(['a,b\n1,2'], 'actual.csv', { type: 'text/csv' });
    fireEvent.drop(screen.getByRole('textbox').parentElement ?? container, {
        dataTransfer: { types: ['Files'], files: [disguised, notes, csv] },
    });
    await waitFor(() => expect(mocks.images).toHaveBeenCalledWith([disguised]));
    expect(mocks.documents).toHaveBeenCalledWith([notes, csv]);
});

test('unsupported host modes hide the picker and block image paste/drop without changing document routing', async () => {
    const reason = 'Choose an agent to attach images';
    const { container } = renderInput({
        imageAttachmentsUnavailableReason: reason,
    });
    expect(
        screen.queryByLabelText('Image attachments'),
    ).not.toBeInTheDocument();
    const file = new File(['png'], 'chart.png', { type: 'image/png' });
    const notes = new File(['notes'], 'notes.txt');
    expect(paste(file)).toBe(false);
    fireEvent.drop(screen.getByRole('textbox').parentElement ?? container, {
        dataTransfer: { types: ['Files'], files: [file, notes] },
    });
    await waitFor(() => expect(mocks.documents).toHaveBeenCalledWith([notes]));
    expect(mocks.toast).toHaveBeenCalledWith({ title: reason });
    expect(mocks.images).not.toHaveBeenCalled();
});

test('changing to battle/auto after attachment blocks submit before retain and preserves every draft resource', () => {
    const onSubmit = vi.fn();
    const { rerenderInput } = renderInput({ onSubmit });
    attachReadyImage();
    rerenderInput({
        imageAttachmentsUnavailableReason:
            'Start a single conversation to attach images',
    });
    send();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(mocks.retain).not.toHaveBeenCalled();
    expect(mocks.clear).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledWith({
        title: 'Start a single conversation to attach images',
    });
    expect(screen.getByRole('textbox')).toHaveTextContent(
        'Recreate this chart',
    );
    expect(screen.getByAltText('chart.png')).toBeInTheDocument();
});

test('deep research cannot silently consume an image-bearing draft', async () => {
    const onResearch = vi.fn(async () => undefined);
    renderInput({ onStartDeepResearch: onResearch });
    attachReadyImage();
    await userEvent.click(
        screen.getByRole('button', { name: 'Composer options' }),
    );
    await userEvent.click(
        screen.getByRole('menuitem', { name: 'Enable deep research' }),
    );
    send();
    expect(onResearch).not.toHaveBeenCalled();
    expect(mocks.retain).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledWith({
        title: 'Remove the images or ask in regular chat',
    });
    expect(screen.getByRole('textbox')).toHaveTextContent(
        'Recreate this chart',
    );
    expect(screen.getByAltText('chart.png')).toBeInTheDocument();
});

test('urgent steering remains text-only and keeps the image for the next normal prompt', async () => {
    const { rerenderInput } = renderInput();
    attachReadyImage();
    mocks.active = true;
    rerenderInput({});
    send();
    await waitFor(() =>
        expect(mocks.steer).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'Recreate this chart' }),
        ),
    );
    expect(mocks.info).toHaveBeenCalledWith({
        title: 'Images stay attached and go with your next message',
    });
    expect(mocks.retain).not.toHaveBeenCalled();
    expect(mocks.clear).not.toHaveBeenCalled();
    expect(screen.getByAltText('chart.png')).toBeInTheDocument();
});
