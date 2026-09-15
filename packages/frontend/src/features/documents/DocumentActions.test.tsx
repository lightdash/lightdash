import { type Document, DirectAccessResourceType } from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen } from '@testing-library/react';
import DocumentActions from './DocumentActions';

const mocks = vi.hoisted(() => ({
    canManage: true,
    isAvailable: true,
    modal: vi.fn(),
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
