import { Ability } from '@casl/ability';
import {
    DirectAccessResourceType,
    ResourceViewItemType,
    SpaceMemberRole,
    type PossibleAbilities,
    type ResourceViewDocumentItem,
} from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen } from '@testing-library/react';
import DocumentResourceActionMenu from './DocumentResourceActionMenu';
import {
    getResourceName,
    getResourceTypeName,
    getResourceUrl,
    getViewStatsResourceType,
} from './resourceUtils';
import { ResourceViewItemAction } from './types';

const mocks = vi.hoisted(() => ({
    enabled: true,
    flagError: false,
    available: true,
    spaceRole: 'editor' as string | undefined,
    modal: vi.fn(),
    canDuplicate: false,
    duplicateModal: vi.fn(),
}));
vi.mock('../../../features/documents/useDocumentCreationSpaces', () => ({
    useDocumentCreationSpaces: () => ({
        writableSpaces: mocks.canDuplicate ? [{ uuid: 'destination' }] : [],
    }),
}));
vi.mock('../../../features/documents/DocumentDuplicateModal', () => ({
    default: (props: unknown) => {
        mocks.duplicateModal(props);
        return <div>Duplicate document form</div>;
    },
}));
const ability = new Ability<PossibleAbilities>([
    {
        action: 'delete',
        subject: 'Document',
        conditions: {
            organizationUuid: 'org',
            projectUuid: 'project',
            access: {
                $elemMatch: {
                    userUuid: 'user',
                    role: { $in: ['editor', 'admin'] },
                },
            },
        },
    },
    {
        action: 'update',
        subject: 'Document',
        conditions: {
            organizationUuid: 'org',
            projectUuid: 'project',
            access: {
                $elemMatch: {
                    userUuid: 'user',
                    role: { $in: ['editor', 'admin'] },
                },
            },
        },
    },
    {
        action: 'manage',
        subject: 'Space',
        conditions: {
            organizationUuid: 'org',
            projectUuid: 'project',
            access: { $elemMatch: { userUuid: 'user', role: 'admin' } },
        },
    },
]);
vi.mock('../../../providers/App/useApp', () => ({
    default: () => ({
        user: { data: { userUuid: 'user', organizationUuid: 'org', ability } },
    }),
}));
vi.mock('../../../providers/Ability/useAbilityContext', () => ({
    useAbilityContext: () => ability,
}));
vi.mock('../../../hooks/useSpaces', () => ({
    useSpaceSummaries: () => ({
        data: mocks.spaceRole
            ? [
                  {
                      uuid: 'space',
                      inheritsFromOrgOrProject: false,
                      userAccess: { userUuid: 'user', role: mocks.spaceRole },
                  },
              ]
            : [],
    }),
}));
vi.mock('../../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({
        data: { enabled: mocks.enabled },
        isError: mocks.flagError,
    }),
}));
vi.mock('../../../features/directAccess/hooks/useDirectAccess', () => ({
    useDirectAccessAvailability: () => ({ isAvailable: mocks.available }),
}));
vi.mock('../../../features/directAccess/components/DirectAccessModal', () => ({
    default: (props: unknown) => {
        mocks.modal(props);
        return <div>Access assignments</div>;
    },
}));

const item: ResourceViewDocumentItem = {
    type: ResourceViewItemType.DOCUMENT,
    data: {
        uuid: 'document',
        projectUuid: 'project',
        organizationUuid: 'org',
        spaceUuid: 'space',
        name: 'Weekly review',
        description: 'Analysis',
        slug: 'weekly-review',
        createdByUserUuid: null,
        directAccessRoles: [],
        updatedAt: new Date('2026-09-15'),
        updatedByUser: undefined,
        views: 0,
        firstViewedAt: null,
        pinnedListUuid: null,
        pinnedListOrder: null,
        verification: null,
    },
};

describe('Document resource actions', () => {
    beforeEach(() => {
        mocks.enabled = true;
        mocks.flagError = false;
        mocks.available = true;
        mocks.spaceRole = 'editor';
        mocks.modal.mockReset();
        mocks.canDuplicate = false;
        mocks.duplicateModal.mockReset();
    });
    const renderMenu = (roles: SpaceMemberRole[] = [], allowDelete = true) => {
        const onAction = vi.fn();
        render(
            <MantineProvider>
                <DocumentResourceActionMenu
                    item={{
                        ...item,
                        data: { ...item.data, directAccessRoles: roles },
                    }}
                    onAction={onAction}
                    isOpen
                    allowDelete={allowDelete}
                />
            </MantineProvider>,
        );
        return onAction;
    };
    it('moves with inherited editor access and never offers unsupported actions', () => {
        const onAction = renderMenu();
        fireEvent.click(screen.getByRole('menuitem', { name: 'Move' }));
        expect(onAction).toHaveBeenCalledWith({
            type: ResourceViewItemAction.TRANSFER_TO_SPACE,
            item,
        });
        for (const name of [
            'Share',
            'Edit',
            'Duplicate',
            'Add to favorites',
            'Pin to homepage',
            'Verify',
        ]) {
            expect(
                screen.queryByRole('menuitem', { name }),
            ).not.toBeInTheDocument();
        }
    });
    it('offers duplication to a reader who can create in another space', () => {
        mocks.spaceRole = 'viewer';
        mocks.canDuplicate = true;
        renderMenu([SpaceMemberRole.VIEWER]);
        expect(
            screen.queryByRole('menuitem', { name: 'Move' }),
        ).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('menuitem', { name: 'Duplicate' }));
        expect(mocks.duplicateModal).toHaveBeenCalledWith(
            expect.objectContaining({
                documentUuid: 'document',
                projectUuid: 'project',
            }),
        );
    });
    it('offers delete with inherited editor access', () => {
        const onAction = renderMenu();
        fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
        expect(onAction).toHaveBeenCalledWith({
            type: ResourceViewItemAction.DELETE,
            item,
        });
    });
    it('allows a full direct grant to delete without Space access', () => {
        mocks.spaceRole = undefined;
        const onAction = renderMenu([SpaceMemberRole.ADMIN]);
        fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
        expect(onAction).toHaveBeenCalledWith(
            expect.objectContaining({ type: ResourceViewItemAction.DELETE }),
        );
    });
    it('honors the caller delete restriction', () => {
        renderMenu([SpaceMemberRole.ADMIN], false);
        expect(
            screen.queryByRole('menuitem', { name: 'Delete' }),
        ).not.toBeInTheDocument();
    });
    it('full direct access shares the Document but cannot move it', () => {
        mocks.spaceRole = undefined;
        renderMenu([SpaceMemberRole.ADMIN]);
        expect(
            screen.queryByRole('menuitem', { name: 'Move' }),
        ).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('menuitem', { name: 'Share' }));
        expect(mocks.modal).toHaveBeenCalledWith(
            expect.objectContaining({
                projectUuid: 'project',
                resource: {
                    resourceType: DirectAccessResourceType.DOCUMENT,
                    resourceUuid: 'document',
                    name: 'Weekly review',
                },
            }),
        );
    });
    it.each([SpaceMemberRole.VIEWER, SpaceMemberRole.EDITOR])(
        'direct %s access cannot share or move',
        (role) => {
            mocks.spaceRole = undefined;
            renderMenu([role]);
            expect(
                screen.queryByRole('button', { name: 'Document actions' }),
            ).not.toBeInTheDocument();
        },
    );
    it.each([
        { enabled: false, flagError: false },
        { enabled: true, flagError: true },
    ])('fails closed for unavailable flag %j', (flag) => {
        Object.assign(mocks, flag);
        renderMenu([SpaceMemberRole.ADMIN]);
        expect(
            screen.queryByRole('button', { name: 'Document actions' }),
        ).not.toBeInTheDocument();
    });
    it('has canonical links and a Document label without view statistics', () => {
        expect(getResourceUrl('project', item, 'project-slug')).toBe(
            '/projects/project-slug/documents/weekly-review',
        );
        expect(getResourceName(item.type)).toBe('Document');
        expect(getResourceTypeName(item)).toBe('Document');
        expect(getViewStatsResourceType(item)).toBeUndefined();
    });

    it('uses the document UUID when its slug could be mistaken for another UUID', () => {
        expect(
            getResourceUrl(
                'project',
                {
                    ...item,
                    data: {
                        ...item.data,
                        slug: '591eb352-180d-4cfd-b2ce-b4c004edb6ce',
                    },
                },
                'project-slug',
            ),
        ).toBe('/projects/project-slug/documents/document');
    });
});
