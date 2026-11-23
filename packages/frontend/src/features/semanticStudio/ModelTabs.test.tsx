import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type PropsWithChildren } from 'react';
import { describe, expect, it, vi } from 'vitest';
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
const saveModel = vi.hoisted(() => vi.fn());
vi.mock('./useSemanticLayerModel', () => ({
    useSaveDraftModel: () => ({ mutate: saveModel, isLoading: false }),
    useSemanticLayerModel: (_projectUuid: string, name: string) => ({
        isLoading: false,
        data:
            name === 'orders'
                ? { name, content: 'live orders', version: 3, history: [] }
                : null,
    }),
    useAppliesAsPullRequest: () => false,
    useUndoSemanticLayerChanges: () => ({ mutate: vi.fn() }),
}));

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
    <StudioCheckoutProvider value={state}>
        <ModelCodeView
            projectUuid="project"
            modelName={modelName}
            fieldName={null}
            readOnlyReason={readOnlyReason}
            startsEditing={false}
        />
    </StudioCheckoutProvider>
);

const type = (contents: string) =>
    fireEvent.change(screen.getByTestId('editor'), {
        target: { value: contents },
    });

describe('ModelCodeView', () => {
    it('shows the code of whatever is checked out, from A to B to Published', () => {
        const { rerender } = renderWithProviders(
            codeOf(
                on('A', [draftModel('orders', 'live orders', 'orders in A')]),
                'orders',
            ),
        );
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
        expect(screen.getByTestId('code')).toHaveTextContent('orders in B');

        // Published has nothing to mark, so it opens ready to edit.
        rerender(codeOf(on(null), 'orders'));
        expect(screen.getByTestId('editor')).toHaveValue('live orders');
    });

    it('opens a model the change adds ready to edit, and says when it removes one', () => {
        const change = on('A', [
            draftModel('payments', null, 'payments in A'),
            draftModel('orders', 'live orders', null),
        ]);
        const { rerender } = renderWithProviders(codeOf(change, 'payments'));
        expect(screen.getByTestId('editor')).toHaveValue('payments in A');

        rerender(codeOf(change, 'orders'));
        expect(
            screen.getByText('This draft removes this model.'),
        ).toBeInTheDocument();

        rerender(codeOf(on(null), 'payments'));
        expect(screen.queryByTestId('code')).not.toBeInTheDocument();
        expect(screen.queryByTestId('editor')).not.toBeInTheDocument();
    });

    it('edits Published and saves it as a new draft, from what the edit started on', async () => {
        saveModel.mockReset();
        const user = userEvent.setup();
        renderWithProviders(codeOf(on(null), 'orders'));
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
        expect(saveModel).toHaveBeenCalledWith(
            { model: 'orders', base: 'live orders', content: 'edited orders' },
            expect.anything(),
        );
    });

    it('saves into the draft on a draft, and shows why a save failed', async () => {
        saveModel.mockReset();
        saveModel.mockImplementation((_input, { onSuccess }) =>
            onSuccess({ status: 'failed', error: 'Not today.' }),
        );
        const user = userEvent.setup();
        renderWithProviders(
            codeOf(
                on('A', [draftModel('orders', 'live orders', 'orders in A')]),
                'orders',
            ),
        );
        // The draft's marked lines read first; clicking them starts editing.
        await user.click(screen.getByTestId('code'));
        type('edited orders');
        await user.click(screen.getByRole('button', { name: 'Save' }));
        expect(screen.getByText('Not today.')).toBeInTheDocument();
        expect(screen.getByTestId('editor')).toHaveValue('edited orders');
    });

    it('says why the code cannot be edited', () => {
        renderWithProviders(
            codeOf(on(null), 'orders', 'Only Ana can edit this draft.'),
        );
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
        await user.click(screen.getByTestId('code'));
        type('my orders');
        rerender(
            codeOf(
                on('A', [draftModel('orders', 'live orders', 'agent orders')]),
                'orders',
            ),
        );
        expect(screen.getByTestId('editor')).toHaveValue('my orders');
        expect(
            screen.getByText(/This model changed while you were editing/),
        ).toBeInTheDocument();
    });
});
