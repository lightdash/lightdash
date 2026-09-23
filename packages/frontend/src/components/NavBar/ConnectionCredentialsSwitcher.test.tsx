import {
    WarehouseTypes,
    type Project,
    type UserWarehouseCredentials,
    type WarehouseConnection,
    type WarehouseConnectionUserCredentials,
} from '@lightdash/common';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { lightdashApi } from '../../api';
import { renderWithProviders } from '../../testing/testUtils';
import ConnectionCredentialsSwitcher from './ConnectionCredentialsSwitcher';

vi.mock('../../api', () => ({
    lightdashApi: vi.fn(),
}));

const mockApi = lightdashApi as unknown as Mock;

const connection = (
    overrides: Partial<WarehouseConnection>,
): WarehouseConnection => ({
    warehouseConnectionUuid: 'original-uuid',
    projectUuid: 'project-uuid',
    name: 'Warehouse',
    isOriginal: true,
    warehouseType: WarehouseTypes.POSTGRES,
    organizationWarehouseCredentialsUuid: null,
    listAllDatabases: false,
    additionalDatabases: [],
    createdAt: new Date('2026-09-01T00:00:00Z'),
    updatedAt: new Date('2026-09-01T00:00:00Z'),
    ...overrides,
});

const personal = (
    uuid: string,
    name: string,
    type: WarehouseTypes,
): UserWarehouseCredentials => ({
    uuid,
    userUuid: 'user-uuid',
    name,
    createdAt: new Date('2026-09-01T00:00:00Z'),
    updatedAt: new Date('2026-09-01T00:00:00Z'),
    credentials: { type } as UserWarehouseCredentials['credentials'],
    project: null,
});

const project = (requireUserCredentials: boolean) =>
    ({
        projectUuid: 'project-uuid',
        name: 'Jaffle',
        warehouseConnection: {
            type: WarehouseTypes.POSTGRES,
            requireUserCredentials,
        },
    }) as Project;

const serve = ({
    extraRequires,
    extraPreference,
}: {
    extraRequires: boolean;
    extraPreference: string | null;
}) => {
    const responses: Record<string, unknown> = {
        'GET /projects/project-uuid/warehouse-connections': {
            connections: [
                connection({}),
                connection({
                    warehouseConnectionUuid: 'finance-uuid',
                    name: 'Finance',
                    isOriginal: false,
                }),
            ],
            capabilities: { canAddConnection: true, reason: null },
        },
        'GET /projects/project-uuid/warehouse-connections/finance-uuid/user-credentials':
            {
                warehouseConnectionUuid: 'finance-uuid',
                warehouseType: WarehouseTypes.POSTGRES,
                requireUserCredentials: extraRequires,
                allowsOptionalUserCredentials: false,
                userWarehouseCredentials: extraPreference
                    ? personal(
                          extraPreference,
                          'Finance login',
                          WarehouseTypes.POSTGRES,
                      )
                    : null,
            } satisfies WarehouseConnectionUserCredentials,
        'GET /projects/project-uuid/user-warehouse-credentials': [
            personal('pg-main', 'Main login', WarehouseTypes.POSTGRES),
            personal('pg-finance', 'Finance login', WarehouseTypes.POSTGRES),
            personal('sf', 'Snowflake login', WarehouseTypes.SNOWFLAKE),
        ],
        'GET /projects/project-uuid/user-credentials': personal(
            'pg-main',
            'Main login',
            WarehouseTypes.POSTGRES,
        ),
    };
    mockApi.mockImplementation(
        async ({ url, method }: { url: string; method: string }) => {
            if (method === 'PATCH') return undefined;
            const key = `${method} ${url}`;
            if (!(key in responses)) {
                throw new Error(`Unexpected request ${key}`);
            }
            return responses[key];
        },
    );
};

describe('ConnectionCredentialsSwitcher', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('lists one section per connection that needs personal credentials, with only credentials of its type and each saved choice checked', async () => {
        serve({ extraRequires: true, extraPreference: 'pg-finance' });
        renderWithProviders(
            <ConnectionCredentialsSwitcher
                project={project(true)}
                onPreferenceSaved={vi.fn()}
            />,
        );
        const user = userEvent.setup();

        await user.click(
            await screen.findByRole('button', {
                name: 'Warehouse credentials',
            }),
        );

        expect(await screen.findByText('Warehouse')).toBeInTheDocument();
        expect(await screen.findByText('Finance')).toBeInTheDocument();
        expect(screen.getAllByText('Main login')).toHaveLength(2);
        expect(screen.getAllByText('Finance login')).toHaveLength(2);
        expect(screen.queryByText('Snowflake login')).not.toBeInTheDocument();
        const items = screen.getAllByRole('menuitem');
        const checked = items.filter((item) =>
            item.querySelector('[data-position="right"] svg'),
        );
        expect(checked.map((item) => item.textContent)).toEqual([
            'Main login',
            'Finance login',
        ]);
    });

    it('saves a choice for an extra connection through the connection endpoint only', async () => {
        serve({ extraRequires: true, extraPreference: null });
        const onPreferenceSaved = vi.fn();
        renderWithProviders(
            <ConnectionCredentialsSwitcher
                project={project(false)}
                onPreferenceSaved={onPreferenceSaved}
            />,
        );
        const user = userEvent.setup();

        await user.click(
            await screen.findByRole('button', {
                name: 'Warehouse credentials',
            }),
        );
        expect(screen.queryByText('Warehouse')).not.toBeInTheDocument();
        await user.click(await screen.findByText('Main login'));

        await waitFor(() => expect(onPreferenceSaved).toHaveBeenCalled());
        const patches = mockApi.mock.calls
            .map(([request]) => request as { url: string; method: string })
            .filter(({ method }) => method === 'PATCH');
        expect(patches).toEqual([
            expect.objectContaining({
                url: '/projects/project-uuid/warehouse-connections/finance-uuid/user-credentials/pg-main',
            }),
        ]);
    });

    it('renders nothing when no connection needs personal credentials', async () => {
        serve({ extraRequires: false, extraPreference: null });
        renderWithProviders(
            <ConnectionCredentialsSwitcher
                project={project(false)}
                onPreferenceSaved={vi.fn()}
            />,
        );

        await waitFor(() =>
            expect(mockApi).toHaveBeenCalledWith(
                expect.objectContaining({
                    url: '/projects/project-uuid/warehouse-connections/finance-uuid/user-credentials',
                }),
            ),
        );
        await new Promise((resolve) => {
            setTimeout(resolve, 50);
        });
        expect(
            screen.queryByRole('button', { name: 'Warehouse credentials' }),
        ).not.toBeInTheDocument();
    });
});
