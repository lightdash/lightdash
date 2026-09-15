import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
    act,
    fireEvent,
    render,
    screen,
    waitFor,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import DocumentDeleteModal from './DocumentDeleteModal';

const mocks = vi.hoisted(() => ({
    api: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    softDelete: { enabled: true, retentionDays: 14 as number | undefined },
}));
vi.mock('../../../api', () => ({ lightdashApi: mocks.api }));
vi.mock('../../../providers/App/useApp', () => ({
    default: () => ({ health: { data: { softDelete: mocks.softDelete } } }),
}));
vi.mock('../../../hooks/toaster/useToaster', () => ({
    default: () => ({
        showToastSuccess: mocks.success,
        showToastApiError: mocks.error,
    }),
}));

const renderModal = () => {
    const client = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
        logger: { log: () => {}, warn: () => {}, error: () => {} },
    });
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    const keys = [
        ['documents', 'project'],
        ['document', 'project', 'doc'],
        ['document-cell-query', 'project', 'doc'],
        ['deletedContent'],
        ['content'],
        ['space', 'project'],
    ];
    keys.forEach((key) => client.setQueryData(key, 'cached'));
    const { unmount } = render(
        <QueryClientProvider client={client}>
            <MemoryRouter>
                <MantineProvider env="test">
                    <DocumentDeleteModal
                        opened
                        projectUuid="project"
                        uuid="doc"
                        name="Weekly review"
                        onConfirm={onConfirm}
                        onClose={onClose}
                    />
                </MantineProvider>
            </MemoryRouter>
        </QueryClientProvider>,
    );
    return { client, keys, onConfirm, onClose, unmount };
};

describe('Document delete confirmation', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.api.mockResolvedValue(undefined);
        mocks.softDelete = { enabled: true, retentionDays: 14 };
    });
    it('deletes the selected document and refreshes discovery, viewer and trash after success', async () => {
        const { onConfirm, client, keys } = renderModal();
        expect(
            screen.getByText(/where it can be restored or permanently deleted/),
        ).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
        await waitFor(() => expect(onConfirm).toHaveBeenCalledOnce());
        expect(mocks.api).toHaveBeenCalledWith({
            version: 'v2',
            method: 'POST',
            url: '/content/project/delete',
            body: JSON.stringify({
                action: { type: 'delete' },
                item: { contentType: 'document', uuid: 'doc' },
            }),
        });
        keys.forEach((key) =>
            expect(client.getQueryState(key)?.isInvalidated).toBe(true),
        );
    });
    it('keeps confirmation open and reports a failed delete', async () => {
        mocks.api.mockRejectedValue({
            error: { message: 'No access', statusCode: 403 },
        });
        const { onConfirm, onClose } = renderModal();
        fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
        await waitFor(() =>
            expect(mocks.error).toHaveBeenCalledWith(
                expect.objectContaining({ title: 'Failed to delete content' }),
            ),
        );
        expect(onConfirm).not.toHaveBeenCalled();
        expect(onClose).not.toHaveBeenCalled();
        expect(
            screen.getByRole('dialog', { name: 'Delete document' }),
        ).toBeInTheDocument();
    });
    it('runs the success navigation even if the deleted viewer unmounts the modal first', async () => {
        const pending = Promise.withResolvers<void>();
        mocks.api.mockReturnValue(pending.promise);
        const { onConfirm, unmount } = renderModal();
        fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
        await waitFor(() => expect(mocks.api).toHaveBeenCalledOnce());
        unmount();
        await act(async () => pending.resolve());
        await waitFor(() => expect(onConfirm).toHaveBeenCalledOnce());
    });
    it('disables repeat confirmation and cancel while deletion is pending', async () => {
        mocks.api.mockReturnValue(new Promise(() => {}));
        renderModal();
        fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
        await waitFor(() =>
            expect(
                screen.getByRole('button', { name: 'Cancel' }),
            ).toBeDisabled(),
        );
        expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
    });
    it('cancels without deleting', () => {
        const { onClose } = renderModal();
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(onClose).toHaveBeenCalledOnce();
        expect(mocks.api).not.toHaveBeenCalled();
    });
    it('does not promise automatic retention cleanup', () => {
        mocks.softDelete.retentionDays = undefined;
        renderModal();
        expect(screen.queryByText(/removed after/)).not.toBeInTheDocument();
        expect(
            screen.getByText(/where it can be restored or permanently deleted/),
        ).toBeInTheDocument();
    });
    it('warns of permanent deletion when soft delete is disabled', () => {
        mocks.softDelete.enabled = false;
        renderModal();
        expect(
            screen.getByText(/all of its versions will be permanently deleted/),
        ).toBeInTheDocument();
        expect(screen.queryByText(/Recently deleted/)).not.toBeInTheDocument();
    });
});
