import { type Document } from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen } from '@testing-library/react';
import DocumentOwnerModal from './DocumentOwnerModal';

const mocks = vi.hoisted(() => ({ mutate: vi.fn(), isLoading: false }));
vi.mock('./useUpdateDocumentMetadata', () => ({
    useUpdateDocumentMetadata: () => ({
        mutate: mocks.mutate,
        isLoading: mocks.isLoading,
        error: null,
    }),
}));
vi.mock('../../components/common/UserSelect', () => ({
    UserSelect: (props: {
        value: string | null;
        onChange: (value: string | null) => void;
    }) => (
        <>
            <output aria-label="Selected owner">{props.value ?? 'none'}</output>
            <button onClick={() => props.onChange('new-owner')}>
                Pick new owner
            </button>
            <button onClick={() => props.onChange(null)}>Clear owner</button>
        </>
    ),
}));

const document = {
    documentUuid: 'document',
    projectUuid: 'project',
    owner: {
        userUuid: 'current-owner',
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
    },
} as Document;

const renderModal = (onClose = vi.fn()) => {
    render(
        <MantineProvider>
            <DocumentOwnerModal document={document} opened onClose={onClose} />
        </MantineProvider>,
    );
    return onClose;
};

describe('DocumentOwnerModal', () => {
    beforeEach(() => {
        mocks.mutate.mockReset();
    });

    it('starts from the current owner and disables saving until it changes', () => {
        renderModal();
        expect(screen.getByLabelText('Selected owner')).toHaveTextContent(
            'current-owner',
        );
        expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    });

    it.each([
        ['Pick new owner', 'new-owner'],
        ['Clear owner', null],
    ])('%s saves ownerUserUuid %s', (action, ownerUserUuid) => {
        const onClose = renderModal();
        fireEvent.click(screen.getByRole('button', { name: action }));
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));
        expect(mocks.mutate).toHaveBeenCalledWith(
            { ownerUserUuid },
            { onSuccess: onClose },
        );
    });
});
