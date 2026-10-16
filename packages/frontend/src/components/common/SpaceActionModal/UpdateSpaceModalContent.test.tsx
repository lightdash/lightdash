import { Ability } from '@casl/ability';
import { FeatureFlags, WarehouseTypes, type Space } from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { useForm } from '@mantine/form';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SpaceActionModal from '.';
import { ActionType } from './types';
import UpdateSpaceModalContent from './UpdateSpaceModalContent';

const mocks = vi.hoisted(() => ({
    enabled: true,
    canManage: true,
    multiConnectionEnabled: true,
    connectionsLoaded: true,
    update: vi.fn(),
}));

const space: Space = {
    organizationUuid: 'org',
    projectUuid: 'project',
    uuid: 'space',
    name: 'Reports',
    inheritsFromOrgOrProject: false,
    queries: [],
    dashboards: [],
    access: [],
    groupsAccess: [],
    pinnedListUuid: null,
    pinnedListOrder: null,
    slug: 'reports',
    childSpaces: [],
    parentSpaceUuid: null,
    inheritParentPermissions: false,
    projectMemberAccessRole: null,
    colorPaletteUuid: null,
    warehouseConnectionUuid: null,
    path: 'space',
};

vi.mock('../../../hooks/useProject', () => ({
    useProject: () => ({ data: { name: 'Project' } }),
}));
vi.mock('../../../hooks/appearance/useOrganizationAppearance', () => ({
    useColorPalettes: () => ({ data: [] }),
}));
vi.mock('../../../hooks/health/useHealth', () => ({
    default: () => ({ data: null }),
}));
vi.mock('../../../providers/App/useApp', () => ({
    default: () => ({
        user: {
            data: {
                organizationUuid: 'org',
                ability: new Ability(
                    mocks.canManage
                        ? [
                              {
                                  action: 'manage',
                                  subject: 'Project',
                                  conditions: {
                                      projectUuid: 'project',
                                      organizationUuid: 'org',
                                  },
                              },
                          ]
                        : [],
                ),
            },
        },
    }),
}));
vi.mock('../../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: (flag: FeatureFlags) => ({
        data: {
            enabled:
                flag === FeatureFlags.SpaceWarehouseConnections &&
                mocks.enabled,
        },
    }),
}));
vi.mock('../../../hooks/useWarehouseConnections', () => ({
    useWarehouseConnections: () => ({
        isEnabled: mocks.multiConnectionEnabled,
        data: mocks.connectionsLoaded
            ? {
                  connections: [
                      {
                          warehouseConnectionUuid: 'connection',
                          projectUuid: 'project',
                          name: 'Reporting warehouse',
                          isOriginal: true,
                          warehouseType: WarehouseTypes.POSTGRES,
                          organizationWarehouseCredentialsUuid: null,
                          listAllDatabases: false,
                          additionalDatabases: [],
                          createdAt: new Date(),
                          updatedAt: new Date(),
                      },
                  ],
                  capabilities: { canAddConnection: true, reason: null },
              }
            : undefined,
    }),
}));
vi.mock('../PalettePicker/PalettePicker', () => ({
    PalettePicker: () => null,
}));
vi.mock('../../../hooks/useProjectRoute', () => ({
    useOptionalProjectRoute: () => null,
}));
vi.mock('../../../hooks/toaster/useToaster', () => ({
    default: () => ({ showToastError: vi.fn() }),
}));
vi.mock('../../../hooks/useSpaces', () => ({
    useSpace: () => ({ data: space, isInitialLoading: false }),
    useCreateMutation: () => ({ mutateAsync: vi.fn(), isLoading: false }),
    useUpdateMutation: () => ({ mutateAsync: mocks.update, isLoading: false }),
    useSpaceDeleteMutation: () => ({ mutateAsync: vi.fn(), isLoading: false }),
}));
vi.mock('./CreateSpaceModalContent', () => ({ default: () => null }));
vi.mock('./DeleteSpaceModal', () => ({ DeleteSpaceModal: () => null }));

const FormContent = () => {
    const form = useForm<Space>({ initialValues: space });
    return <UpdateSpaceModalContent form={form} projectUuid="project" />;
};

const renderContent = () =>
    render(
        <MantineProvider env="test">
            <FormContent />
        </MantineProvider>,
    );

const renderModal = () =>
    render(
        <MemoryRouter>
            <MantineProvider env="test">
                <SpaceActionModal
                    actionType={ActionType.UPDATE}
                    title="Update space"
                    confirmButtonLabel="Update"
                    projectUuid="project"
                    spaceUuid="space"
                    parentSpaceUuid={null}
                />
            </MantineProvider>
        </MemoryRouter>,
    );

describe('space warehouse connection selection', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        Object.assign(mocks, {
            enabled: true,
            canManage: true,
            multiConnectionEnabled: true,
            connectionsLoaded: true,
        });
        space.warehouseConnectionUuid = null;
        mocks.update.mockResolvedValue(space);
    });

    it('shows inheritance and each connection for project managers', async () => {
        const user = userEvent.setup();
        renderContent();
        const select = screen.getByRole('combobox', {
            name: 'Warehouse connection',
        });
        expect(select).toHaveValue('Inherit from parent space or project');
        expect(
            screen.getByText(
                'Content in this space and its sub-spaces queries with this connection. People who can edit this space can also pick it in the SQL runner.',
            ),
        ).toBeInTheDocument();
        await user.click(select);
        await user.click(
            screen.getByRole('option', { name: 'Reporting warehouse' }),
        );
        expect(select).toHaveValue('Reporting warehouse');
    });

    it.each([
        { enabled: false },
        { canManage: false },
        { multiConnectionEnabled: false },
        { connectionsLoaded: false },
    ])('hides the field when a prerequisite is missing: %j', (state) => {
        Object.assign(mocks, state);
        renderContent();
        expect(
            screen.queryByRole('combobox', { name: 'Warehouse connection' }),
        ).not.toBeInTheDocument();
    });

    it('sends the selected connection when the modal is saved', async () => {
        const user = userEvent.setup();
        renderModal();
        await user.click(
            screen.getByRole('combobox', { name: 'Warehouse connection' }),
        );
        await user.click(
            screen.getByRole('option', { name: 'Reporting warehouse' }),
        );
        await user.click(screen.getByRole('button', { name: 'Update' }));
        await waitFor(() =>
            expect(mocks.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    warehouseConnectionUuid: 'connection',
                }),
            ),
        );
    });

    it('sends null when reverting to inheritance', async () => {
        space.warehouseConnectionUuid = 'connection';
        const user = userEvent.setup();
        renderModal();
        expect(
            screen.getByRole('combobox', { name: 'Warehouse connection' }),
        ).toHaveValue('Reporting warehouse');
        await user.click(
            screen.getByRole('combobox', { name: 'Warehouse connection' }),
        );
        await user.click(
            screen.getByRole('option', {
                name: 'Inherit from parent space or project',
            }),
        );
        await user.click(screen.getByRole('button', { name: 'Update' }));
        await waitFor(() =>
            expect(mocks.update).toHaveBeenCalledWith(
                expect.objectContaining({ warehouseConnectionUuid: null }),
            ),
        );
    });

    it.each([{ enabled: false }, { canManage: false }, {}])(
        'omits the unchanged connection when saving other fields: %j',
        async (state) => {
            Object.assign(mocks, state);
            space.warehouseConnectionUuid = 'connection';
            const user = userEvent.setup();
            renderModal();
            await user.type(
                screen.getByRole('textbox', {
                    name: 'Enter a memorable name for your space',
                }),
                ' updated',
            );
            await user.click(screen.getByRole('button', { name: 'Update' }));
            await waitFor(() =>
                expect(mocks.update).toHaveBeenCalledWith({
                    name: 'Reports updated',
                    inheritParentPermissions: false,
                    colorPaletteUuid: null,
                }),
            );
        },
    );
});
