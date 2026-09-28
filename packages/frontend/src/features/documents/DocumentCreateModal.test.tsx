import { Ability } from '@casl/ability';
import { SpaceMemberRole, type PossibleAbilities } from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import DocumentCreateModal from './DocumentCreateModal';

const mocks = vi.hoisted(() => ({
    api: vi.fn(),
    navigate: vi.fn(),
    invalidate: vi.fn(),
    close: vi.fn(),
    spacesLoading: false,
    spacesError: false,
    noWritableSpaces: false,
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
        data: (mocks.noWritableSpaces
            ? [SpaceMemberRole.VIEWER]
            : [SpaceMemberRole.VIEWER, SpaceMemberRole.EDITOR]
        ).map((role) => ({
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

describe('Create document', () => {
    const clients: QueryClient[] = [];
    beforeEach(() => {
        mocks.api.mockReset();
        mocks.navigate.mockReset();
        mocks.invalidate.mockReset();
        mocks.close.mockReset();
        mocks.spacesLoading = false;
        mocks.spacesError = false;
        mocks.noWritableSpaces = false;
    });
    afterEach(() => clients.forEach((client) => client.clear()));
    const renderModal = (defaultSpaceUuid: string | null = 'editor') => {
        const client = new QueryClient({
            defaultOptions: { mutations: { retry: false } },
        });
        clients.push(client);
        return render(
            <QueryClientProvider client={client}>
                <MantineProvider env="test">
                    <DocumentCreateModal
                        projectUuid="project"
                        defaultSpaceUuid={defaultSpaceUuid}
                        onClose={mocks.close}
                    />
                </MantineProvider>
            </QueryClientProvider>,
        );
    };
    const nameInput = () =>
        screen.getByRole('textbox', { name: 'Document name' });
    const submit = () => screen.getByRole('button', { name: 'Create' });

    it('creates an empty document in the current space and opens it in the editor', async () => {
        mocks.api.mockResolvedValue({
            documentUuid: 'fresh-id',
            slug: 'weekly-review',
        });
        renderModal();
        expect(submit()).toBeDisabled();
        fireEvent.change(nameInput(), {
            target: { value: '  Weekly review ' },
        });
        fireEvent.change(screen.getByRole('textbox', { name: 'Description' }), {
            target: { value: 'Context' },
        });
        expect(submit()).toBeEnabled();
        fireEvent.click(submit());
        await waitFor(() =>
            expect(mocks.api).toHaveBeenCalledWith({
                url: '/projects/project/documents',
                method: 'POST',
                body: JSON.stringify({
                    name: 'Weekly review',
                    description: 'Context',
                    spaceUuid: 'editor',
                    schemaVersion: 1,
                    content: { cells: [] },
                }),
            }),
        );
        await waitFor(() => expect(mocks.close).toHaveBeenCalledOnce());
        expect(mocks.invalidate).toHaveBeenCalled();
        expect(mocks.navigate).toHaveBeenCalledWith(
            '/projects/project-slug/documents/weekly-review',
            { state: { startEditing: true } },
        );
    });

    it('ignores a default space the viewer cannot create in until one is chosen', () => {
        renderModal('viewer');
        fireEvent.change(nameInput(), { target: { value: 'Report' } });
        expect(submit()).toBeDisabled();
        fireEvent.click(screen.getByText('viewer space'));
        expect(submit()).toBeDisabled();
        fireEvent.click(screen.getByText('editor space'));
        expect(submit()).toBeEnabled();
    });

    it('requires a name', () => {
        renderModal();
        fireEvent.change(nameInput(), { target: { value: '   ' } });
        expect(submit()).toBeDisabled();
    });

    it('keeps the dialog open and shows the server error when creation is denied', async () => {
        mocks.api.mockRejectedValue({
            error: {
                statusCode: 403,
                message:
                    'You do not have permission to create Documents in this Space',
            },
        });
        renderModal();
        fireEvent.change(nameInput(), { target: { value: 'Report' } });
        fireEvent.click(submit());
        expect(
            await screen.findByText(
                'You do not have permission to create Documents in this Space',
            ),
        ).toBeInTheDocument();
        expect(mocks.close).not.toHaveBeenCalled();
        expect(mocks.navigate).not.toHaveBeenCalled();
    });

    it('explains when the viewer cannot create documents in any space', () => {
        mocks.noWritableSpaces = true;
        renderModal(null);
        expect(
            screen.getByText(
                'You do not have permission to create documents in any space in this project.',
            ),
        ).toBeInTheDocument();
        fireEvent.change(nameInput(), { target: { value: 'Report' } });
        expect(submit()).toBeDisabled();
    });

    it('shows a space loading failure instead of the selector', () => {
        mocks.spacesError = true;
        renderModal();
        expect(screen.getByText('Cannot load spaces')).toBeInTheDocument();
        fireEvent.change(nameInput(), { target: { value: 'Report' } });
        expect(submit()).toBeDisabled();
    });
});
