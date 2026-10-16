import { Ability } from '@casl/ability';
import {
    FeatureFlags,
    LightdashMode,
    type Space as SpaceType,
} from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type PropsWithChildren } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Space from './Space';

const mocks = vi.hoisted(() => ({
    enabled: true,
    connectionsLoaded: true,
    canManage: false,
    contentAuthoringEnabled: true,
}));
const space: SpaceType = {
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
    warehouseConnectionUuid: 'connection',
    path: 'space',
};

vi.mock('../hooks/useProjectUuid', () => ({ useProjectUuid: () => 'project' }));
vi.mock('../hooks/useProjectRoute', () => ({
    useProjectUrlIdentifier: () => 'project',
}));
vi.mock('../hooks/useSpaces', () => ({
    useSpace: () => ({ data: space, isInitialLoading: false, error: null }),
}));
vi.mock('../hooks/pinning/useSpaceMutation', () => ({
    useSpacePinningMutation: () => ({ mutate: vi.fn() }),
}));
vi.mock('../hooks/useContent', () => ({
    useContentAction: () => ({ mutateAsync: vi.fn(), isLoading: false }),
}));
vi.mock('../hooks/useContentAuthoringEnabled', () => ({
    useContentAuthoringEnabled: () => mocks.contentAuthoringEnabled,
}));
vi.mock('../providers/Tracking/useTracking', () => ({
    default: () => ({ track: vi.fn() }),
}));
vi.mock('../providers/App/useApp', () => ({
    default: () => ({
        user: {
            data: {
                organizationUuid: 'org',
                ability: new Ability(
                    mocks.canManage
                        ? [{ action: 'manage', subject: 'all' }]
                        : [{ action: 'view', subject: 'Space' }],
                ),
            },
        },
        health: { data: { mode: LightdashMode.DEFAULT } },
    }),
}));
vi.mock('../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: (flag: FeatureFlags) => ({
        data: {
            enabled:
                flag === FeatureFlags.SpaceWarehouseConnections &&
                mocks.enabled,
        },
    }),
}));
vi.mock('../hooks/useWarehouseConnections', () => ({
    useWarehouseConnections: () => ({
        data: mocks.connectionsLoaded
            ? {
                  connections: [
                      {
                          warehouseConnectionUuid: 'connection',
                          name: 'Reporting warehouse',
                      },
                  ],
              }
            : undefined,
    }),
}));
vi.mock('../providers/Ability', () => ({ Can: () => null }));
vi.mock('../providers/Favorites/FavoritesProvider', () => ({
    FavoritesProvider: ({ children }: PropsWithChildren) => <>{children}</>,
}));
vi.mock('../components/common/Page/Page', () => ({
    default: ({ children }: PropsWithChildren) => <>{children}</>,
}));
vi.mock('../components/common/PageBreadcrumbs', () => ({
    default: () => null,
}));
vi.mock('../components/common/ResourceView/InfiniteResourceTable', () => ({
    default: () => null,
}));
vi.mock('../components/common/modal/DashboardCreateModal', () => ({
    default: () => null,
}));
vi.mock('../components/common/ShareSpaceModal', () => ({
    default: () => null,
}));
vi.mock('../components/common/SpaceActionModal', () => ({
    default: () => null,
}));
vi.mock('../components/common/TransferItemsModal/TransferItemsModal', () => ({
    default: () => null,
}));
vi.mock('../components/Explorer/SpaceBrowser/CreateResourceToSpace', () => ({
    default: () => null,
}));
vi.mock('../components/Explorer/SpaceBrowser/SpaceBrowserMenu', () => ({
    SpaceBrowserMenu: () => null,
}));
vi.mock('../components/ForbiddenPanel', () => ({ default: () => null }));
vi.mock('../features/documents/DocumentCreateModal', () => ({
    default: () => null,
}));

const renderSpace = () =>
    render(
        <MemoryRouter>
            <MantineProvider env="test">
                <Space />
            </MantineProvider>
        </MemoryRouter>,
    );

describe('space warehouse connection badge', () => {
    beforeEach(() => {
        mocks.canManage = false;
        mocks.contentAuthoringEnabled = true;
        mocks.enabled = true;
        mocks.connectionsLoaded = true;
        space.warehouseConnectionUuid = 'connection';
    });

    it('shows the connection name and tooltip to a space viewer', async () => {
        const user = userEvent.setup();
        renderSpace();
        const badge = screen.getByText('Reporting warehouse');
        expect(badge.closest('.mantine-Badge-root')).toBeInTheDocument();
        await user.hover(badge);
        expect(await screen.findByRole('tooltip')).toHaveTextContent(
            'Content in this space queries with this connection',
        );
    });

    it('keeps creation controls hidden for viewers', () => {
        renderSpace();
        expect(
            screen.queryByRole('button', { name: 'Add' }),
        ).not.toBeInTheDocument();
    });

    it('keeps permitted creation actions available to project managers', async () => {
        mocks.canManage = true;
        const user = userEvent.setup();
        renderSpace();
        await user.click(screen.getByRole('button', { name: 'Add' }));
        expect(
            screen.getByRole('menuitem', { name: 'Create space' }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('menuitem', { name: 'Create new chart' }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('menuitem', { name: 'Create new dashboard' }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('menuitem', { name: 'Create new document' }),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('menuitem', { name: 'Create new data app' }),
        ).not.toBeInTheDocument();
    });

    it('keeps content authoring gates on the extracted header', async () => {
        mocks.canManage = true;
        mocks.contentAuthoringEnabled = false;
        const user = userEvent.setup();
        renderSpace();
        await user.click(screen.getByRole('button', { name: 'Add' }));
        expect(
            screen.getByRole('menuitem', { name: 'Create space' }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('menuitem', { name: 'Create new chart' }),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('menuitem', { name: 'Create new dashboard' }),
        ).not.toBeInTheDocument();
    });

    it('hides the badge when the flag is off', () => {
        mocks.enabled = false;
        renderSpace();
        expect(
            screen.queryByText('Reporting warehouse'),
        ).not.toBeInTheDocument();
    });

    it('hides the badge when the space inherits its connection', () => {
        space.warehouseConnectionUuid = null;
        renderSpace();
        expect(
            screen.queryByText('Reporting warehouse'),
        ).not.toBeInTheDocument();
    });

    it('hides the badge until the connection name is available', () => {
        mocks.connectionsLoaded = false;
        renderSpace();
        expect(
            screen.queryByText('Reporting warehouse'),
        ).not.toBeInTheDocument();
    });

    it('does not show an unrelated connection name', () => {
        space.warehouseConnectionUuid = 'another-connection';
        renderSpace();
        expect(
            screen.queryByText('Reporting warehouse'),
        ).not.toBeInTheDocument();
    });
});
