import { type Document, DirectAccessResourceType } from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import DocumentActions from './DocumentActions';

const mocks = vi.hoisted(() => ({
    canManage: true,
    isAvailable: true,
    modal: vi.fn(),
    deleteModal: vi.fn(),
    canDelete: false,
    navigate: vi.fn(),
    copy: vi.fn(),
    codeModal: vi.fn(),
}));
vi.mock('./DocumentAsCodeModal', () => ({
    default: (props: unknown) => {
        mocks.codeModal(props);
        return <div>Document code</div>;
    },
}));
vi.mock('../../hooks/useProjectRoute', () => ({
    useProjectUrlIdentifier: () => 'project-slug',
}));
vi.mock('../../components/common/CopyActionIcon', () => ({
    CopyActionIcon: (props: { value: string; copyLabel: string }) => {
        mocks.copy(props);
        return <button>{props.copyLabel}</button>;
    },
}));
vi.mock('react-router', () => ({ useNavigate: () => mocks.navigate }));
vi.mock('./useCanDeleteDocument', () => ({
    useCanDeleteDocument: () => mocks.canDelete,
}));
vi.mock('../../components/common/modal/DocumentDeleteModal', () => ({
    default: (props: { onConfirm: () => void }) => {
        mocks.deleteModal(props);
        return (
            <button onClick={props.onConfirm}>Confirm document deletion</button>
        );
    },
}));
vi.mock('../directAccess/hooks/useCanManageDirectAccess', () => ({
    useCanManageDirectAccess: () => mocks.canManage,
}));
vi.mock('../directAccess/hooks/useDirectAccess', () => ({
    useDirectAccessAvailability: () => ({ isAvailable: mocks.isAvailable }),
}));
vi.mock('../directAccess/components/DirectAccessModal', () => ({
    default: (props: unknown) => {
        mocks.modal(props);
        return <div>Access assignments</div>;
    },
}));

const document: Document = {
    documentUuid: 'document',
    projectUuid: 'project',
    organizationUuid: 'org',
    spaceUuid: 'space',
    name: 'Weekly report',
    slug: 'weekly-report',
    description: '',
    createdByUserUuid: null,
    createdAt: new Date('2026-09-15'),
    updatedAt: new Date('2026-09-15'),
    access: [],
    directAccessRoles: [],
    version: {
        versionUuid: 'version',
        versionNumber: 1,
        schemaVersion: 1,
        content: { cells: [] },
        createdByUserUuid: null,
        createdAt: new Date('2026-09-15'),
    },
};

describe('Document actions', () => {
    beforeEach(() => {
        mocks.canManage = true;
        mocks.isAvailable = true;
        mocks.modal.mockReset();
        mocks.canDelete = false;
        mocks.deleteModal.mockReset();
        mocks.navigate.mockReset();
        mocks.copy.mockReset();
        mocks.codeModal.mockReset();
    });
    const renderActions = () =>
        render(
            <MantineProvider>
                <DocumentActions document={document} />
            </MantineProvider>,
        );

    it('opens the shared access modal for the exact Document', () => {
        renderActions();
        expect(mocks.modal).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Share' }));
        expect(screen.getByText('Access assignments')).toBeInTheDocument();
        expect(mocks.modal).toHaveBeenCalledWith(
            expect.objectContaining({
                projectUuid: 'project',
                resource: {
                    resourceType: DirectAccessResourceType.DOCUMENT,
                    resourceUuid: 'document',
                    name: 'Weekly report',
                },
            }),
        );
    });

    it('copies a full project-slug and document-slug URL', () => {
        renderActions();
        expect(mocks.copy).toHaveBeenCalledWith(
            expect.objectContaining({
                value: `${window.location.origin}/projects/project-slug/documents/weekly-report`,
            }),
        );
    });

    it('confirms deletion for the exact Document before returning to its list', async () => {
        mocks.canDelete = true;
        renderActions();
        expect(mocks.deleteModal).not.toHaveBeenCalled();
        fireEvent.click(
            screen.getByRole('button', { name: 'Document actions' }),
        );
        fireEvent.click(
            await screen.findByRole('menuitem', { name: 'Delete' }),
        );
        await waitFor(() =>
            expect(mocks.deleteModal).toHaveBeenCalledWith(
                expect.objectContaining({
                    projectUuid: 'project',
                    uuid: 'document',
                    name: 'Weekly report',
                }),
            ),
        );
        expect(mocks.navigate).not.toHaveBeenCalled();
        fireEvent.click(
            screen.getByRole('button', { name: 'Confirm document deletion' }),
        );
        expect(mocks.navigate).toHaveBeenCalledWith(
            '/projects/project-slug/documents',
        );
    });

    it('lets a read-only reader view code without exposing deletion', async () => {
        mocks.canManage = false;
        renderActions();
        expect(mocks.codeModal).not.toHaveBeenCalled();
        fireEvent.click(
            screen.getByRole('button', { name: 'Document actions' }),
        );
        const viewCode = await screen.findByRole('menuitem', {
            name: 'View as code',
        });
        expect(
            screen.queryByRole('menuitem', { name: 'Delete' }),
        ).not.toBeInTheDocument();
        fireEvent.click(viewCode);
        expect(await screen.findByText('Document code')).toBeInTheDocument();
        expect(mocks.deleteModal).not.toHaveBeenCalled();
        expect(mocks.codeModal).toHaveBeenCalledWith(
            expect.objectContaining({ document, opened: true }),
        );
    });

    it.each([
        { canManage: false, isAvailable: true },
        { canManage: true, isAvailable: false },
    ])(
        'hides grant controls when access management is unavailable: %j',
        (permissions) => {
            Object.assign(mocks, permissions);
            renderActions();
            expect(
                screen.queryByRole('button', { name: 'Share' }),
            ).not.toBeInTheDocument();
            expect(
                screen.getByRole('button', { name: 'Copy document link' }),
            ).toBeInTheDocument();
            expect(mocks.modal).not.toHaveBeenCalled();
        },
    );
});
