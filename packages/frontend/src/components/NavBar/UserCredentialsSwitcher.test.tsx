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
    () => ({ CreateCredentialsModal: () => null }),
);

import UserCredentialsSwitcher from './UserCredentialsSwitcher';

const connection = (
    connectionUuid: string,
    warehouseType: WarehouseTypes,
): Connection => ({
    connectionUuid,
    name: connectionUuid,
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

describe('UserCredentialsSwitcher', () => {
    beforeEach(() => {
        mocks.activeProject = undefined;
        mocks.credentials = [];
        mocks.preferences.clear();
        mocks.preferenceHook.mockClear();
        mocks.mutate.mockClear();
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
        expect(
            screen
                .getByRole('menuitem', { name: 'Credentials A' })
                .querySelector('.tabler-icon-check'),
        ).not.toBeNull();

        mocks.activeProject = project([connectionB]);
        view.rerender(<UserCredentialsSwitcher />);

        expect(mocks.preferenceHook).toHaveBeenLastCalledWith(
            'project-uuid',
            'connection-b',
        );
        const credentialsBItem = screen.getByRole('menuitem', {
            name: 'Credentials B',
        });
        expect(
            credentialsBItem.querySelector('.tabler-icon-check'),
        ).not.toBeNull();

        fireEvent.click(credentialsBItem);
        expect(mocks.mutate).toHaveBeenCalledWith({
            projectUuid: 'project-uuid',
            userWarehouseCredentialsUuid: 'credentials-b',
            connectionUuid: 'connection-b',
        });
    });

    it('does not infer the first connection for a multi-connection project', () => {
        mocks.activeProject = project([
            connection('connection-a', WarehouseTypes.POSTGRES),
            connection('connection-b', WarehouseTypes.SNOWFLAKE),
        ]);

        renderSwitcher();

        expect(mocks.preferenceHook).toHaveBeenLastCalledWith(
            'project-uuid',
            undefined,
        );
        expect(
            screen.queryByRole('button', { name: 'Warehouse credentials' }),
        ).not.toBeInTheDocument();
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
});
