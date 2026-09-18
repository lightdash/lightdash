import { Ability } from '@casl/ability';
import { SpaceMemberRole, type PossibleAbilities } from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import DocumentDuplicateModal from './DocumentDuplicateModal';

const mocks = vi.hoisted(() => ({
    api: vi.fn(),
    navigate: vi.fn(),
    invalidate: vi.fn(),
    close: vi.fn(),
    spacesLoading: false,
    spacesError: false,
}));
vi.mock('../../api', () => ({ lightdashApi: mocks.api }));
vi.mock('../../hooks/useContent', () => ({
    invalidateContent: mocks.invalidate,
}));
vi.mock('../../hooks/useProjectRoute', () => ({
    useProjectUrlIdentifier: () => 'project-slug',
}));
vi.mock('react-router', () => ({ useNavigate: () => mocks.navigate }));
const ability = new Ability<PossibleAbilities>([
    {
        action: 'create',
        subject: 'Document',
        conditions: {
            projectUuid: 'project',
            access: {
                $elemMatch: { userUuid: 'user', role: SpaceMemberRole.EDITOR },
            },
        },
    },
]);
vi.mock('../../providers/App/useApp', () => ({
    default: () => ({
        user: { data: { userUuid: 'user', organizationUuid: 'org', ability } },
    }),
}));
vi.mock('../../hooks/useSpaces', () => ({
    useSpaceSummaries: () => ({
        data: [SpaceMemberRole.VIEWER, SpaceMemberRole.EDITOR].map((role) => ({
            uuid: role,
            name: `${role} space`,
            path: role,
            access: [],
            inheritsFromOrgOrProject: false,
            userAccess: { userUuid: 'user', role, hasDirectAccess: true },
        })),
        isLoading: mocks.spacesLoading,
        isError: mocks.spacesError,
        error: mocks.spacesError
            ? { error: { message: 'Cannot load spaces' } }
            : null,
    }),
}));

describe('Duplicate document', () => {
    const clients: QueryClient[] = [];
    beforeEach(() => {
        mocks.api.mockReset();
        mocks.navigate.mockReset();
        mocks.invalidate.mockReset();
        mocks.close.mockReset();
        mocks.spacesLoading = false;
        mocks.spacesError = false;
    });
    afterEach(() => clients.forEach((client) => client.clear()));
    const renderModal = () => {
        const client = new QueryClient({
            defaultOptions: { mutations: { retry: false } },
        });
        clients.push(client);
        return render(
            <QueryClientProvider client={client}>
                <MantineProvider env="test">
                    <DocumentDuplicateModal
                        projectUuid="project"
                        documentUuid="source"
                        name="Weekly report"
                        description="Summary"
                        spaceUuid="viewer"
                        opened
                        onClose={mocks.close}
                    />
                </MantineProvider>
            </QueryClientProvider>,
        );
    };

    it('requires create rights in the chosen space and navigates to the returned copy', async () => {
        mocks.api.mockResolvedValue({
            documentUuid: 'fresh-id',
            slug: 'fresh-copy',
        });
        renderModal();
        const submit = screen.getByRole('button', { name: 'Create duplicate' });
        expect(
            screen.getByRole('textbox', { name: 'Document name' }),
        ).toHaveValue('Copy of Weekly report');
        expect(
            screen.getByRole('textbox', { name: 'Description' }),
        ).toHaveValue('Summary');
        expect(submit).toBeDisabled();
        fireEvent.click(screen.getByText('viewer space'));
        expect(submit).toBeDisabled();
        fireEvent.click(screen.getByText('editor space'));
        expect(submit).toBeEnabled();
        fireEvent.change(
            screen.getByRole('textbox', { name: 'Document name' }),
            { target: { value: 'My copy' } },
        );
        fireEvent.change(screen.getByRole('textbox', { name: 'Description' }), {
            target: { value: 'Edited description' },
        });
        fireEvent.click(submit);
        await waitFor(() =>
            expect(mocks.api).toHaveBeenCalledWith({
                url: '/projects/project/documents/source/duplicate',
                method: 'POST',
                body: JSON.stringify({
                    name: 'My copy',
                    description: 'Edited description',
                    spaceUuid: 'editor',
                }),
            }),
        );
        expect(mocks.invalidate).toHaveBeenCalledWith(
            expect.any(QueryClient),
            'project',
        );
        await waitFor(() =>
            expect(mocks.navigate).toHaveBeenCalledWith(
                '/projects/project-slug/documents/fresh-copy',
            ),
        );
        expect(mocks.close).toHaveBeenCalledOnce();
    });

    it('blocks empty names and duplicate submissions while saving', async () => {
        mocks.api.mockReturnValue(new Promise(() => {}));
        renderModal();
        fireEvent.click(screen.getByText('editor space'));
        const name = screen.getByRole('textbox', { name: 'Document name' });
        fireEvent.change(name, { target: { value: '  ' } });
        expect(
            screen.getByRole('button', { name: 'Create duplicate' }),
        ).toBeDisabled();
        fireEvent.change(name, { target: { value: 'Copy' } });
        fireEvent.click(
            screen.getByRole('button', { name: 'Create duplicate' }),
        );
        await waitFor(() => expect(name).toBeDisabled());
        expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
        expect(mocks.api).toHaveBeenCalledOnce();
        expect(mocks.navigate).not.toHaveBeenCalled();
    });

    it('retains the form and error on failure', async () => {
        mocks.api.mockRejectedValue({
            status: 'error',
            error: { statusCode: 403, message: 'Cannot create in this space' },
        });
        renderModal();
        fireEvent.click(screen.getByText('editor space'));
        fireEvent.click(
            screen.getByRole('button', { name: 'Create duplicate' }),
        );
        expect(
            await screen.findByText('Cannot create in this space'),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Create duplicate' }),
        ).toBeEnabled();
        expect(mocks.navigate).not.toHaveBeenCalled();
        expect(mocks.close).not.toHaveBeenCalled();
    });

    it('shows space loading and unavailable errors', () => {
        mocks.spacesLoading = true;
        const view = renderModal();
        expect(screen.getByText('Loading spaces')).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Create duplicate' }),
        ).toBeDisabled();
        view.unmount();
        mocks.spacesLoading = false;
        mocks.spacesError = true;
        renderModal();
        expect(screen.getByText('Cannot load spaces')).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Create duplicate' }),
        ).toBeDisabled();
    });
});
