import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import { ModelCodeView } from './ModelTabs';
import { draftModel, draftOf, workspaceOf } from './studioCheckout.mock';
import {
    StudioCheckoutProvider,
    type StudioCheckoutState,
} from './useStudioCheckout';

vi.mock('./pierreEditor', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    createEditor: () => null,
}));
vi.mock('@pierre/diffs/react', () => ({
    WorkerPoolContextProvider: ({ children }: PropsWithChildren) => children,
    EditProvider: ({ children }: PropsWithChildren) => children,
    File: ({
        file,
        edit,
        onEditChange,
    }: {
        file: { contents: string };
        edit?: boolean;
        onEditChange?: (event: {
            file: { contents: string };
            editor: { canUndo: boolean; canRedo: boolean };
        }) => void;
    }) =>
        edit ? (
            <textarea
                data-testid="editor"
                defaultValue={file.contents}
                onChange={(event) =>
                    onEditChange?.({
                        file: { contents: event.target.value },
                        editor: { canUndo: true, canRedo: false },
                    })
                }
            />
        ) : (
            <pre data-testid="code">{file.contents}</pre>
        ),
    Virtualizer: ({ children }: PropsWithChildren) => children,
    MultiFileDiff: ({ newFile }: { newFile: { contents: string } }) => (
        <pre data-testid="code" data-marked>
            {newFile.contents}
        </pre>
    ),
}));
type Request = { url: string; method: string; body: string | undefined };
const api = vi.hoisted(() => vi.fn<(request: Request) => Promise<unknown>>());
vi.mock('../../providers/LightdashApi/useLightdashApi', () => ({
    useLightdashApi: () => api,
}));
vi.mock('../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({ data: { enabled: true } }),
}));

type SaveResult = { status: 'ready' } | { status: 'failed'; error: string };

const MODELS = '/projects/project/semantic-studio/models/';
const SAVE = '/projects/project/semantic-studio/draft/models/orders/edit';

/** A server whose only stored model is orders, answering a save of it with `saved`. */
const serve = (saved: SaveResult = { status: 'ready' }) => {
    api.mockReset();
    api.mockImplementation(({ url }) => {
        if (url.endsWith('/status')) {
            return Promise.resolve({
                enabled: true,
                blocker: null,
                appliesAs: 'live',
            });
        }
        if (url.startsWith(MODELS)) {
            const name = url.slice(MODELS.length);
            return Promise.resolve(
                name === 'orders'
                    ? { name, content: 'live orders', version: 3, history: [] }
                    : null,
            );
        }
        if (url === SAVE) return Promise.resolve(saved);
        return Promise.resolve(null);
    });
};
const savedBodies = () =>
    api.mock.calls.flatMap(([{ url, body }]) =>
        url === SAVE && body ? [JSON.parse(body)] : [],
    );

const on = (
    uuid: string | null,
    models: Parameters<typeof draftOf>[0] = [],
): StudioCheckoutState => ({
    shown: uuid
        ? { workspace: workspaceOf(uuid), draft: draftOf(models) }
        : { workspace: null, draft: null },
    isSwitching: false,
    error: null,
});

const codeOf = (
    state: StudioCheckoutState,
    modelName: string,
    readOnlyReason: string | null = null,
) => (
    <QueryClientProvider client={client}>
        <StudioCheckoutProvider value={state}>
            <ModelCodeView
                projectUuid="project"
                modelName={modelName}
                fieldName={null}
                readOnlyReason={readOnlyReason}
                startsEditing={false}
            />
        </StudioCheckoutProvider>
    </QueryClientProvider>
);

// Kept across rerenders, so only a newly opened model is read again.
let client = new QueryClient();

/** Waits for the model and status reads to answer. */
const settle = () => waitFor(() => expect(client.isFetching()).toBe(0));

const type = (contents: string) =>
    fireEvent.change(screen.getByTestId('editor'), {
        target: { value: contents },
    });

describe('ModelCodeView', () => {
    beforeEach(() => {
        client = new QueryClient({
            defaultOptions: { queries: { retry: false } },
        });
        serve();
    });

    it('shows the code of whatever is checked out, from A to B to Published', async () => {
        const { rerender } = renderWithProviders(
            codeOf(
                on('A', [draftModel('orders', 'live orders', 'orders in A')]),
                'orders',
            ),
        );
        await settle();
        expect(screen.getByTestId('code')).toHaveTextContent('orders in A');
        // A file the draft changes shows its lines marked.
        expect(screen.getByTestId('code')).toHaveAttribute('data-marked');
        expect(screen.queryByRole('radio')).not.toBeInTheDocument();

        rerender(
            codeOf(
                on('B', [draftModel('orders', 'live orders', 'orders in B')]),
                'orders',
            ),
        );
        await settle();
        expect(screen.getByTestId('code')).toHaveTextContent('orders in B');

        // Published has nothing to mark, so it opens ready to edit.
        rerender(codeOf(on(null), 'orders'));
        await settle();
        expect(screen.getByTestId('editor')).toHaveValue('live orders');
    });

    it('opens a model the change adds ready to edit, and says when it removes one', async () => {
        const change = on('A', [
            draftModel('payments', null, 'payments in A'),
            draftModel('orders', 'live orders', null),
        ]);
        const { rerender } = renderWithProviders(codeOf(change, 'payments'));
        await settle();
        expect(screen.getByTestId('editor')).toHaveValue('payments in A');

        rerender(codeOf(change, 'orders'));
        await settle();
        expect(
            screen.getByText('This draft removes this model.'),
        ).toBeInTheDocument();

        rerender(codeOf(on(null), 'payments'));
        await settle();
        expect(screen.queryByTestId('code')).not.toBeInTheDocument();
        expect(screen.queryByTestId('editor')).not.toBeInTheDocument();
    });

    it('edits Published and saves it as a new draft, from what the edit started on', async () => {
        const user = userEvent.setup();
        renderWithProviders(codeOf(on(null), 'orders'));
        await settle();
        expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Redo' })).toBeDisabled();
        expect(
            screen.queryByRole('button', { name: 'Discard' }),
        ).not.toBeInTheDocument();
        type('edited orders');
        expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled();
        expect(
            screen.getByRole('button', { name: 'Discard' }),
        ).toBeInTheDocument();
        await user.click(
            screen.getByRole('button', { name: 'Save as a new draft' }),
        );
        await waitFor(() =>
            expect(savedBodies()).toEqual([
                { base: 'live orders', content: 'edited orders' },
            ]),
        );
    });

    it('saves into the draft on a draft, and shows why a save failed', async () => {
        serve({ status: 'failed', error: 'Not today.' });
        const user = userEvent.setup();
        renderWithProviders(
            codeOf(
                on('A', [draftModel('orders', 'live orders', 'orders in A')]),
                'orders',
            ),
        );
        await settle();
        // The draft's marked lines read first; clicking them starts editing.
        await user.click(screen.getByTestId('code'));
        type('edited orders');
        await user.click(screen.getByRole('button', { name: 'Save' }));
        expect(await screen.findByText('Not today.')).toBeInTheDocument();
        expect(screen.getByTestId('editor')).toHaveValue('edited orders');
    });

    it('says why the code cannot be edited', async () => {
        renderWithProviders(
            codeOf(on(null), 'orders', 'Only Ana can edit this draft.'),
        );
        await settle();
        expect(
            screen.getByText('Only Ana can edit this draft.'),
        ).toBeInTheDocument();
        expect(screen.getByTestId('code')).toHaveTextContent('live orders');
        expect(
            screen.queryByRole('button', { name: 'Undo' }),
        ).not.toBeInTheDocument();
    });

    it('keeps unsaved text when the model changes under it, and says so', async () => {
        const user = userEvent.setup();
        const { rerender } = renderWithProviders(
            codeOf(
                on('A', [draftModel('orders', 'live orders', 'orders in A')]),
                'orders',
            ),
        );
        await settle();
        await user.click(screen.getByTestId('code'));
        type('my orders');
        rerender(
            codeOf(
                on('A', [draftModel('orders', 'live orders', 'agent orders')]),
                'orders',
            ),
        );
        await settle();
        expect(screen.getByTestId('editor')).toHaveValue('my orders');
        expect(
            screen.getByText(/This model changed while you were editing/),
        ).toBeInTheDocument();
    });
});
