import { screen } from '@testing-library/react';
import { type PropsWithChildren } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import { ModelCodeView } from './ModelTabs';
import { draftModel, draftOf, workspaceOf } from './studioCheckout.mock';
import {
    StudioCheckoutProvider,
    type StudioCheckoutState,
} from './useStudioCheckout';

vi.mock('@pierre/diffs/react', () => ({
    WorkerPoolContextProvider: ({ children }: PropsWithChildren) => children,
    File: ({ file }: { file: { contents: string } }) => (
        <pre data-testid="code">{file.contents}</pre>
    ),
    Virtualizer: ({ children }: PropsWithChildren) => children,
    MultiFileDiff: ({ newFile }: { newFile: { contents: string } }) => (
        <pre data-testid="code" data-marked>
            {newFile.contents}
        </pre>
    ),
}));
vi.mock('./useSemanticLayerModel', () => ({
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
    isPicking: { current: false },
});

const codeOf = (state: StudioCheckoutState, modelName: string) => (
    <StudioCheckoutProvider value={state}>
        <ModelCodeView
            projectUuid="project"
            modelName={modelName}
            fieldName={null}
        />
    </StudioCheckoutProvider>
);

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

        rerender(codeOf(on(null), 'orders'));
        expect(screen.getByTestId('code')).toHaveTextContent('live orders');
        expect(screen.getByTestId('code')).not.toHaveAttribute('data-marked');
    });

    it('shows a model the change adds, and says when it removes one', () => {
        const change = on('A', [
            draftModel('payments', null, 'payments in A'),
            draftModel('orders', 'live orders', null),
        ]);
        const { rerender } = renderWithProviders(codeOf(change, 'payments'));
        expect(screen.getByTestId('code')).toHaveTextContent('payments in A');
        expect(screen.getByTestId('code')).not.toHaveAttribute('data-marked');

        rerender(codeOf(change, 'orders'));
        expect(
            screen.getByText('This draft removes this model.'),
        ).toBeInTheDocument();

        rerender(codeOf(on(null), 'payments'));
        expect(screen.queryByTestId('code')).not.toBeInTheDocument();
    });
});
