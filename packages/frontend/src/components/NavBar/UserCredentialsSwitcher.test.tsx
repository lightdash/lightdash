import {
    ProjectType,
    SnowflakeAuthenticationType,
    WarehouseTypes,
    type Connection,
    type Project,
    type UserWarehouseCredentials,
} from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { type PropsWithChildren } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    activeProject: undefined as Project | undefined,
    credentials: [] as UserWarehouseCredentials[],
    preferences: new Map<string, UserWarehouseCredentials | undefined>(),
    preferenceHook: vi.fn(),
    mutate: vi.fn(),
    createCredentialsModal: vi.fn(),
}));

vi.mock('../../hooks/useActiveProject', () => ({
    useActiveProjectUuid: () => ({
        activeProjectUuid: 'project-uuid',
        isLoading: false,
    }),
}));

vi.mock('../../hooks/useProject', () => ({
    useProject: () => ({
        data: mocks.activeProject,
        isInitialLoading: false,
    }),
}));

vi.mock(
    '../../hooks/userWarehouseCredentials/useProjectUserWarehouseCredentialsPreference',
    () => ({
        useProjectUserWarehouseCredentialsPreference: (
            projectUuid: string | undefined,
            connectionUuid: string | undefined,
        ) => {
            mocks.preferenceHook(projectUuid, connectionUuid);
            return {
                data: connectionUuid
                    ? mocks.preferences.get(connectionUuid)
                    : undefined,
            };
        },
        useProjectUserWarehouseCredentialsPreferenceMutation: () => ({
            mutate: mocks.mutate,
        }),
    }),
);

vi.mock(
    '../../hooks/userWarehouseCredentials/useUserWarehouseCredentials',
    () => ({
        useProjectUserWarehouseCredentials: () => ({
            data: mocks.credentials,
            isInitialLoading: false,
        }),
    }),
);

vi.mock('../../providers/App/useApp', () => ({
    default: () => ({
        user: { data: { organizationName: 'Lightdash' } },
    }),
}));

vi.mock('./NavBarPortalContext', () => ({
    useNavBarMenuProps: () => ({ withinPortal: false }),
}));

vi.mock(
    '../UserSettings/MyWarehouseConnectionsPanel/CreateCredentialsModal',
    () => ({
        CreateCredentialsModal: (props: {
            title?: string;
            warehouseType?: WarehouseTypes;
            connections?: Connection[];
        }) => {
            mocks.createCredentialsModal(props);
            return null;
        },
    }),
);

import UserCredentialsSwitcher from './UserCredentialsSwitcher';

const connection = (
    connectionUuid: string,
    warehouseType: WarehouseTypes,
    name: string = connectionUuid,
): Connection => ({
    connectionUuid,
    name,
    warehouseType,
    organizationWarehouseCredentialsUuid: null,
    listAllDatabases: false,
    additionalDatabases: [],
    createdAt: new Date('2026-09-17T00:00:00.000Z'),
});

const project = (connections: Connection[]): Project =>
    ({
        projectUuid: 'project-uuid',
        name: 'Project',
        type: ProjectType.DEFAULT,
        connections,
        requireUserCredentials: true,
    }) as Project;

const credentials = (
    uuid: string,
    name: string,
    type: WarehouseTypes.POSTGRES | WarehouseTypes.SNOWFLAKE,
): UserWarehouseCredentials => ({
    uuid,
    userUuid: 'user-uuid',
    name,
    createdAt: new Date('2026-09-17T00:00:00.000Z'),
    updatedAt: new Date('2026-09-17T00:00:00.000Z'),
    credentials:
        type === WarehouseTypes.POSTGRES
            ? { type, user: 'user' }
            : {
                  type,
                  user: 'user',
                  authenticationType: SnowflakeAuthenticationType.PASSWORD,
              },
    project: {
        projectUuid: 'project-uuid',
        name: 'Project',
        type: ProjectType.DEFAULT,
    },
});

const createWrapper = () => {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    });

    return function Wrapper({ children }: PropsWithChildren) {
        return (
            <QueryClientProvider client={queryClient}>
                <MantineProvider env="test">
                    <MemoryRouter
                        initialEntries={['/projects/project-uuid/sqlRunner']}
                    >
                        {children}
                    </MemoryRouter>
                </MantineProvider>
            </QueryClientProvider>
        );
    };
};

const renderSwitcher = () =>
    render(<UserCredentialsSwitcher />, { wrapper: createWrapper() });

const openSwitcher = () =>
    fireEvent.click(
        screen.getByRole('button', { name: 'Warehouse credentials' }),
    );

const menuItem = (name: string) => screen.getByRole('menuitem', { name });

const isRenderedBefore = (first: Element, second: Element) =>
    Boolean(
        first.compareDocumentPosition(second) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    );

const hasPreferenceTick = (item: HTMLElement) =>
    item.querySelector('.tabler-icon-check') !== null;

const postgresConnection = connection(
    'connection-a',
    WarehouseTypes.POSTGRES,
    'Postgres connection',
);
const snowflakeConnection = connection(
    'connection-b',
    WarehouseTypes.SNOWFLAKE,
    'Snowflake connection',
);
const postgresCredentials = credentials(
    'credentials-a',
    'Postgres credentials',
    WarehouseTypes.POSTGRES,
);
const snowflakeCredentials = credentials(
    'credentials-b',
    'Snowflake credentials',
    WarehouseTypes.SNOWFLAKE,
);

describe('UserCredentialsSwitcher', () => {
    beforeEach(() => {
        mocks.activeProject = undefined;
        mocks.credentials = [];
        mocks.preferences.clear();
        mocks.preferenceHook.mockClear();
        mocks.mutate.mockClear();
        mocks.createCredentialsModal.mockClear();
    });

    it('renders when project connection metadata arrives after mount', () => {
        const activeConnection = connection(
            'connection-a',
            WarehouseTypes.POSTGRES,
        );
        const view = renderSwitcher();

        expect(
            screen.queryByRole('button', { name: 'Warehouse credentials' }),
        ).not.toBeInTheDocument();

        mocks.activeProject = project([activeConnection]);
        view.rerender(<UserCredentialsSwitcher />);

        expect(
            screen.getByRole('button', { name: 'Warehouse credentials' }),
        ).toBeVisible();

        openSwitcher();

        expect(mocks.preferenceHook).toHaveBeenLastCalledWith(
            'project-uuid',
            'connection-a',
        );
    });

    it('uses the new connection preference after the active connection changes', () => {
        const connectionA = connection('connection-a', WarehouseTypes.POSTGRES);
        const connectionB = connection('connection-b', WarehouseTypes.POSTGRES);
        const credentialsA = credentials(
            'credentials-a',
            'Credentials A',
            WarehouseTypes.POSTGRES,
        );
        const credentialsB = credentials(
            'credentials-b',
            'Credentials B',
            WarehouseTypes.POSTGRES,
        );
        mocks.activeProject = project([connectionA]);
        mocks.credentials = [credentialsA, credentialsB];
        mocks.preferences.set('connection-a', credentialsA);
        mocks.preferences.set('connection-b', credentialsB);
        const view = renderSwitcher();

        openSwitcher();
        expect(hasPreferenceTick(menuItem('Credentials A'))).toBe(true);

        mocks.activeProject = project([connectionB]);
        view.rerender(<UserCredentialsSwitcher />);

        expect(mocks.preferenceHook).toHaveBeenLastCalledWith(
            'project-uuid',
            'connection-b',
        );
        const credentialsBItem = menuItem('Credentials B');
        expect(hasPreferenceTick(credentialsBItem)).toBe(true);

        fireEvent.click(credentialsBItem);
        expect(mocks.mutate).toHaveBeenCalledWith({
            projectUuid: 'project-uuid',
            userWarehouseCredentialsUuid: 'credentials-b',
            connectionUuid: 'connection-b',
        });
    });

    it('renders one section per connection for a multi-connection project', () => {
        mocks.activeProject = project([
            postgresConnection,
            snowflakeConnection,
        ]);
        mocks.credentials = [postgresCredentials, snowflakeCredentials];

        renderSwitcher();

        expect(
            screen.getByRole('button', { name: 'Warehouse credentials' }),
        ).toBeVisible();

        openSwitcher();

        const postgresLabel = screen.getByText('Postgres connection');
        const snowflakeLabel = screen.getByText('Snowflake connection');
        const postgresItem = menuItem('Postgres credentials');
        const snowflakeItem = menuItem('Snowflake credentials');
        const createNewItems = screen.getAllByRole('menuitem', {
            name: 'Create new',
        });

        expect(createNewItems).toHaveLength(2);
        expect(isRenderedBefore(postgresLabel, postgresItem)).toBe(true);
        expect(isRenderedBefore(postgresItem, createNewItems[0])).toBe(true);
        expect(isRenderedBefore(createNewItems[0], snowflakeLabel)).toBe(true);
        expect(isRenderedBefore(snowflakeLabel, snowflakeItem)).toBe(true);
        expect(isRenderedBefore(snowflakeItem, createNewItems[1])).toBe(true);
    });

    it('scopes preferences and mutations to the connection that owns the section', () => {
        mocks.activeProject = project([
            postgresConnection,
            snowflakeConnection,
        ]);
        const otherPostgresCredentials = credentials(
            'credentials-c',
            'Other postgres credentials',
            WarehouseTypes.POSTGRES,
        );
        mocks.credentials = [
            postgresCredentials,
            otherPostgresCredentials,
            snowflakeCredentials,
        ];
        mocks.preferences.set('connection-a', postgresCredentials);
        mocks.preferences.set('connection-b', snowflakeCredentials);

        renderSwitcher();
        openSwitcher();

        expect(mocks.preferenceHook).toHaveBeenCalledWith(
            'project-uuid',
            'connection-a',
        );
        expect(mocks.preferenceHook).toHaveBeenCalledWith(
            'project-uuid',
            'connection-b',
        );

        expect(hasPreferenceTick(menuItem('Postgres credentials'))).toBe(true);
        expect(hasPreferenceTick(menuItem('Other postgres credentials'))).toBe(
            false,
        );
        expect(hasPreferenceTick(menuItem('Snowflake credentials'))).toBe(true);

        fireEvent.click(menuItem('Snowflake credentials'));
        expect(mocks.mutate).toHaveBeenLastCalledWith({
            projectUuid: 'project-uuid',
            userWarehouseCredentialsUuid: 'credentials-b',
            connectionUuid: 'connection-b',
        });

        openSwitcher();
        fireEvent.click(menuItem('Other postgres credentials'));
        expect(mocks.mutate).toHaveBeenLastCalledWith({
            projectUuid: 'project-uuid',
            userWarehouseCredentialsUuid: 'credentials-c',
            connectionUuid: 'connection-a',
        });
    });

    it('keys the required credentials modal to the connection without credentials', () => {
        mocks.activeProject = project([
            postgresConnection,
            snowflakeConnection,
        ]);
        mocks.credentials = [postgresCredentials];

        renderSwitcher();

        expect(mocks.createCredentialsModal).toHaveBeenLastCalledWith(
            expect.objectContaining({
                title: 'Login to Snowflake',
                warehouseType: WarehouseTypes.SNOWFLAKE,
                connections: [snowflakeConnection],
            }),
        );
    });

    it('opens the create modal for the connection whose section was used', () => {
        mocks.activeProject = project([
            postgresConnection,
            snowflakeConnection,
        ]);
        mocks.credentials = [postgresCredentials, snowflakeCredentials];

        renderSwitcher();
        openSwitcher();

        expect(mocks.createCredentialsModal).not.toHaveBeenCalled();

        const createNewItems = screen.getAllByRole('menuitem', {
            name: 'Create new',
        });
        fireEvent.click(createNewItems[1]);

        expect(mocks.createCredentialsModal).toHaveBeenLastCalledWith(
            expect.objectContaining({
                title: undefined,
                warehouseType: WarehouseTypes.SNOWFLAKE,
                connections: [snowflakeConnection],
            }),
        );
    });

    it('lists compatible project credentials without a legacy warehouse connection', () => {
        mocks.activeProject = project([
            connection('connection-a', WarehouseTypes.POSTGRES),
        ]);
        mocks.credentials = [
            credentials(
                'credentials-a',
                'Credentials A',
                WarehouseTypes.POSTGRES,
            ),
            credentials(
                'credentials-b',
                'Credentials B',
                WarehouseTypes.POSTGRES,
            ),
            credentials(
                'credentials-c',
                'Snowflake credentials',
                WarehouseTypes.SNOWFLAKE,
            ),
        ];

        renderSwitcher();
        openSwitcher();

        expect(screen.getByText('Credentials A')).toBeVisible();
        expect(screen.getByText('Credentials B')).toBeVisible();
        expect(screen.queryByText('Snowflake credentials')).toBeNull();
    });

    it('keeps a single connection unlabelled with one create entry', () => {
        mocks.activeProject = project([
            connection('connection-a', WarehouseTypes.POSTGRES),
        ]);
        mocks.credentials = [
            credentials(
                'credentials-a',
                'Credentials A',
                WarehouseTypes.POSTGRES,
            ),
        ];

        renderSwitcher();
        openSwitcher();

        expect(screen.queryByText('connection-a')).toBeNull();
        expect(
            screen.getAllByRole('menuitem', { name: 'Create new' }),
        ).toHaveLength(1);
    });
});
