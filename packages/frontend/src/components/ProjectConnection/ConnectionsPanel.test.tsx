import {
    FeatureFlags,
    ProjectType,
    WarehouseTypes,
    type Project,
    type WarehouseConnection,
} from '@lightdash/common';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
    type Mock,
} from 'vitest';
import { sharedLightdashApi } from '../../api';
import { renderWithProviders } from '../../testing/testUtils';
import ConnectionsPanel from './ConnectionsPanel';

const flag = vi.hoisted(() => ({ enabled: true, mixedTypesEnabled: true }));

vi.mock('../../api');

vi.mock('../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: (id: FeatureFlags) => ({
        data: {
            enabled:
                id === FeatureFlags.MixedWarehouseConnections
                    ? flag.mixedTypesEnabled
                    : flag.enabled,
        },
    }),
}));

const mockApi = sharedLightdashApi as unknown as Mock;

const original: WarehouseConnection = {
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
};

const extra: WarehouseConnection = {
    ...original,
    warehouseConnectionUuid: 'extra-uuid',
    name: 'Finance',
    isOriginal: false,
};

const listUrl = '/projects/project-uuid/warehouse-connections';

const organizationUuid = 'organization-uuid';

const projectRule = (action: 'manage' | 'update') => ({
    action,
    subject: 'Project' as const,
    conditions: { organizationUuid, projectUuid: 'project-uuid' },
});

const renderPanel = (
    type: ProjectType = ProjectType.DEFAULT,
    abilityRules = [projectRule('manage')],
    primaryRequiresUserCredentials = false,
) => {
    renderWithProviders(
        <ConnectionsPanel
            savedProject={
                {
                    projectUuid: 'project-uuid',
                    organizationUuid,
                    type,
                    warehouseConnection: {
                        type: WarehouseTypes.SNOWFLAKE,
                        requireUserCredentials: primaryRequiresUserCredentials,
                    },
                } as Project
            }
        />,
        { user: { abilityRules } },
    );
    return userEvent.setup();
};

describe('ConnectionsPanel', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        flag.enabled = true;
        flag.mixedTypesEnabled = true;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('renders nothing and calls no API while the rollout flag is off', async () => {
        flag.enabled = false;
        renderPanel();

        await new Promise((resolve) => {
            setTimeout(resolve, 50);
        });
        expect(screen.queryByText('Connections')).not.toBeInTheDocument();
        expect(mockApi).not.toHaveBeenCalled();
    });

    it('renders nothing and calls no API for a preview project', async () => {
        renderPanel(ProjectType.PREVIEW);

        await new Promise((resolve) => {
            setTimeout(resolve, 50);
        });
        expect(screen.queryByText('Connections')).not.toBeInTheDocument();
        expect(mockApi).not.toHaveBeenCalled();
    });

    it('renders nothing for a single-connection project', async () => {
        mockApi.mockRejectedValue({
            status: 'error',
            error: {
                name: 'SingleConnectionProjectError',
                message: 'This project uses a single warehouse connection.',
                statusCode: 409,
                data: {},
            },
        });
        renderPanel();

        await waitFor(() =>
            expect(mockApi).toHaveBeenCalledWith(
                expect.objectContaining({ url: listUrl, method: 'GET' }),
            ),
        );
        await new Promise((resolve) => {
            setTimeout(resolve, 50);
        });
        expect(screen.queryByText('Connections')).not.toBeInTheDocument();
        expect(
            screen.queryByText('Failed to load connections.'),
        ).not.toBeInTheDocument();
    });

    it('renders nothing and calls no API when the viewer can update but not manage the project', async () => {
        renderPanel(ProjectType.DEFAULT, [projectRule('update')]);

        await new Promise((resolve) => {
            setTimeout(resolve, 50);
        });
        expect(screen.queryByText('Connections')).not.toBeInTheDocument();
        expect(mockApi).not.toHaveBeenCalled();
    });

    it('renders nothing when the server refuses the viewer (403)', async () => {
        mockApi.mockRejectedValue({
            status: 'error',
            error: {
                name: 'ForbiddenError',
                message: 'You do not have permission to manage this project',
                statusCode: 403,
                data: {},
            },
        });
        renderPanel();

        await waitFor(() => expect(mockApi).toHaveBeenCalled());
        await new Promise((resolve) => {
            setTimeout(resolve, 50);
        });
        expect(screen.queryByText('Connections')).not.toBeInTheDocument();
        expect(
            screen.queryByText('Failed to load connections.'),
        ).not.toBeInTheDocument();
    });

    it.each([false, true])(
        'gates a Trino original in the panel with the resolved mixed flag %s',
        async (enabled) => {
            flag.mixedTypesEnabled = enabled;
            mockApi.mockResolvedValue({
                connections: [
                    { ...original, warehouseType: WarehouseTypes.TRINO },
                ],
                capabilities: { canAddConnection: true, reason: null },
            });
            renderPanel();
            const button = await screen.findByRole('button', {
                name: 'Add connection',
            });
            await waitFor(() =>
                expect(button).toHaveProperty('disabled', !enabled),
            );
        },
    );

    it('lists connections and only offers edit and removal for extra connections', async () => {
        mockApi.mockResolvedValue({
            connections: [original, extra],
            capabilities: { canAddConnection: true, reason: null },
        });
        const user = renderPanel();

        await user.click(
            await screen.findByRole('button', {
                name: 'Actions for Warehouse',
            }),
        );
        const originalMenu = await screen.findByRole('menu');
        expect(
            within(originalMenu).getByRole('menuitem', { name: 'Rename' }),
        ).toBeInTheDocument();
        expect(
            within(originalMenu).queryByRole('menuitem', { name: 'Remove' }),
        ).not.toBeInTheDocument();
        expect(
            within(originalMenu).queryByRole('menuitem', { name: 'Edit' }),
        ).not.toBeInTheDocument();
        await user.keyboard('{Escape}');

        await user.click(
            screen.getByRole('button', { name: 'Actions for Finance' }),
        );
        const extraMenu = await screen.findByRole('menu');
        expect(
            within(extraMenu).getByRole('menuitem', { name: 'Remove' }),
        ).toBeInTheDocument();
        expect(
            within(extraMenu).getByRole('menuitem', { name: 'Edit' }),
        ).toBeInTheDocument();
    });

    it('offers SQL runner database settings only for supported warehouse types', async () => {
        mockApi.mockResolvedValue({
            connections: [
                { ...original, warehouseType: WarehouseTypes.SNOWFLAKE },
                { ...extra, warehouseType: WarehouseTypes.SNOWFLAKE },
            ],
            capabilities: { canAddConnection: true, reason: null },
        });
        const user = renderPanel();
        await user.click(
            await screen.findByRole('button', {
                name: 'Actions for Warehouse',
            }),
        );
        expect(
            within(await screen.findByRole('menu')).queryByRole('menuitem', {
                name: 'SQL runner databases',
            }),
        ).not.toBeInTheDocument();
    });

    it('renders Snowflake fields without fetching organization credentials', async () => {
        mockApi.mockImplementation(
            async ({ url, method }: { url: string; method: string }) => {
                if (url === listUrl && method === 'GET')
                    return {
                        connections: [
                            {
                                ...original,
                                warehouseType: WarehouseTypes.SNOWFLAKE,
                            },
                        ],
                        capabilities: { canAddConnection: true, reason: null },
                    };
                if (url === listUrl && method === 'POST') return extra;
                return undefined;
            },
        );
        const user = renderPanel();
        await user.click(
            await screen.findByRole('button', { name: 'Add connection' }),
        );
        expect(
            await screen.findByRole('textbox', { name: 'Account' }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('textbox', { name: 'Warehouse' }),
        ).toBeInTheDocument();
        expect(screen.getAllByRole('textbox', { name: 'Schema' })).toHaveLength(
            1,
        );
        expect(
            screen.queryByRole('radio', {
                name: 'Use organization credentials',
            }),
        ).not.toBeInTheDocument();
        expect(mockApi).not.toHaveBeenCalledWith(
            expect.objectContaining({ url: '/org/warehouse-credentials' }),
        );
    });

    it('saves manual credentials after changing the warehouse type', async () => {
        mockApi.mockImplementation(
            async ({ url, method }: { url: string; method: string }) => {
                if (url === listUrl && method === 'GET')
                    return {
                        connections: [
                            {
                                ...original,
                                warehouseType: WarehouseTypes.SNOWFLAKE,
                            },
                        ],
                        capabilities: { canAddConnection: true, reason: null },
                    };
                if (url === listUrl && method === 'POST') return extra;
                return undefined;
            },
        );
        const user = renderPanel();
        await user.click(
            await screen.findByRole('button', { name: 'Add connection' }),
        );
        await user.click(screen.getByLabelText(/^Name\s*\*?$/));
        await user.paste('Reporting');
        await user.click(screen.getByRole('combobox', { name: 'Type' }));
        await user.click(screen.getByRole('option', { name: 'Trino' }));
        for (const [name, value] of [
            ['Host', 'trino.internal'],
            ['User', 'reporter'],
            ['DB name', 'analytics'],
            ['Schema', 'public'],
        ]) {
            await user.click(
                screen.getByLabelText(new RegExp(`^${name}\\s*\\*?$`)),
            );
            await user.paste(value);
        }
        await user.click(screen.getByLabelText(/^Password/));
        await user.paste('trino-password');
        const dialog = screen
            .getByText('Add a connection')
            .closest<HTMLElement>('[role="alertdialog"], [role="dialog"]')!;
        await user.click(
            within(dialog).getByRole('button', { name: 'Add connection' }),
        );
        await waitFor(() =>
            expect(mockApi).toHaveBeenCalledWith(
                expect.objectContaining({
                    url: listUrl,
                    method: 'POST',
                    body: JSON.stringify({
                        name: 'Reporting',
                        warehouseConnection: {
                            type: WarehouseTypes.TRINO,
                            schema: 'public',
                            host: 'trino.internal',
                            user: 'reporter',
                            password: 'trino-password',
                            requireUserCredentials: false,
                            port: 443,
                            dbname: 'analytics',
                            http_scheme: 'https',
                            source: '',
                        },
                    }),
                }),
            ),
        );
    });

    it('disables adding a connection when the project cannot hold another', async () => {
        mockApi.mockResolvedValue({
            connections: [original],
            capabilities: {
                canAddConnection: false,
                reason: 'Extra connections are not enabled for this organisation yet.',
            },
        });
        renderPanel();

        expect(
            await screen.findByRole('button', { name: 'Add connection' }),
        ).toBeDisabled();
    });

    it('shows that a project extra inherits the primary credential setting', async () => {
        mockApi.mockResolvedValue({
            connections: [original],
            capabilities: { canAddConnection: true, reason: null },
        });
        const user = renderPanel();
        await user.click(
            await screen.findByRole('button', { name: 'Add connection' }),
        );
        const advanced = screen.getByRole('button', { name: /advanced/i });
        await user.click(advanced);
        expect(
            screen.getByText(
                'Require users to provide their own credentials follows the primary connection.',
            ),
        ).toBeInTheDocument();
        expect(
            screen.queryByText(
                'Require users to provide their own credentials',
            ),
        ).not.toBeInTheDocument();
    });

    it.each([true, false])(
        'offers None in the Snowflake add form only when the primary requires personal credentials: %s',
        async (required) => {
            mockApi.mockResolvedValue({
                connections: [
                    { ...original, warehouseType: WarehouseTypes.SNOWFLAKE },
                ],
                capabilities: { canAddConnection: true, reason: null },
            });
            const user = renderPanel(
                ProjectType.DEFAULT,
                [projectRule('manage')],
                required,
            );
            await user.click(
                await screen.findByRole('button', { name: 'Add connection' }),
            );
            await user.click(
                await screen.findByRole('combobox', {
                    name: /Authentication Type/,
                }),
            );
            expect(
                screen.queryByRole('option', { name: 'None' }) !== null,
            ).toBe(required);
            if (required) {
                await user.click(screen.getByRole('option', { name: 'None' }));
                expect(
                    screen.getByText(
                        /No project-level credentials will be used/,
                    ),
                ).toBeInTheDocument();
            }
        },
    );

    it.each([true, false])(
        'offers None in the Snowflake switch form only when the primary requires personal credentials: %s',
        async (required) => {
            mockApi.mockImplementation(({ url }: { url: string }) => {
                if (url === listUrl)
                    return Promise.reject({
                        status: 'error',
                        error: {
                            name: 'SingleConnectionProjectError',
                            message:
                                'This project uses a single warehouse connection.',
                            statusCode: 409,
                            data: {},
                        },
                    });
                if (url === '/projects/project-uuid/warehouse-connection-mode')
                    return Promise.resolve({
                        canSwitch: true,
                        reason: null,
                        originalWarehouseType: WarehouseTypes.SNOWFLAKE,
                    });
                return Promise.resolve(undefined);
            });
            const user = renderPanel(
                ProjectType.DEFAULT,
                [projectRule('manage')],
                required,
            );
            await user.click(
                await screen.findByRole('button', {
                    name: 'Enable multiple connections',
                }),
            );
            await user.click(
                await screen.findByRole('combobox', {
                    name: /Authentication Type/,
                }),
            );
            expect(
                screen.queryByRole('option', { name: 'None' }) !== null,
            ).toBe(required);
            if (required) {
                await user.click(screen.getByRole('option', { name: 'None' }));
                expect(
                    screen.getByText(
                        /No project-level credentials will be used/,
                    ),
                ).toBeInTheDocument();
            }
        },
    );

    it('edits an extra connection with the inherited user credential setting', async () => {
        const shared = {
            ...extra,
            name: 'Shared',
        };
        mockApi.mockImplementation(
            async ({ url, method }: { url: string; method: string }) => {
                if (url === listUrl && method === 'GET')
                    return {
                        connections: [original, shared],
                        capabilities: { canAddConnection: true, reason: null },
                    };
                if (url === `${listUrl}/extra-uuid` && method === 'GET')
                    return {
                        ...shared,
                        warehouseConnection: {
                            type: WarehouseTypes.POSTGRES,
                            host: 'shared.internal',
                            dbname: 'analytics',
                            schema: 'public',
                            port: 5432,
                            requireUserCredentials: true,
                        },
                    };
                if (url === `${listUrl}/extra-uuid` && method === 'PATCH')
                    return shared;
                throw new Error(`Unexpected ${method} ${url}`);
            },
        );
        const user = renderPanel();
        await user.click(
            await screen.findByRole('button', { name: 'Actions for Shared' }),
        );
        await user.click(await screen.findByRole('menuitem', { name: 'Edit' }));
        const title = await screen.findByText('Edit Shared');
        const dialog = title.closest<HTMLElement>(
            '[role="alertdialog"], [role="dialog"]',
        )!;
        await user.click(
            within(dialog).getByRole('button', { name: /advanced/i }),
        );
        expect(
            within(dialog).getByText(
                'Require users to provide their own credentials follows the primary connection.',
            ),
        ).toBeInTheDocument();
        expect(
            within(dialog).queryByText(
                'Require users to provide their own credentials',
            ),
        ).not.toBeInTheDocument();
        await user.click(
            within(dialog).getByRole('button', { name: 'Save changes' }),
        );
        await waitFor(() =>
            expect(
                mockApi.mock.calls.filter(
                    ([call]) => (call as { method: string }).method === 'PATCH',
                ),
            ).toHaveLength(1),
        );
        const patch = mockApi.mock.calls.find(
            ([call]) => (call as { method: string }).method === 'PATCH',
        )![0] as { body: string };
        expect(JSON.parse(patch.body)).toEqual({
            warehouseConnection: {
                type: WarehouseTypes.POSTGRES,
                host: 'shared.internal',
                dbname: 'analytics',
                schema: 'public',
                port: 5432,
                requireUserCredentials: true,
            },
        });
    });

    it('shows why a bound connection cannot be removed', async () => {
        const refusal =
            "Connection 'Finance' cannot be removed while content uses it. explores: orders.";
        mockApi.mockImplementation(({ method }: { method: string }) =>
            method === 'DELETE'
                ? Promise.reject({
                      status: 'error',
                      error: {
                          name: 'ConflictError',
                          message: refusal,
                          statusCode: 409,
                          data: {},
                      },
                  })
                : Promise.resolve({
                      connections: [original, extra],
                      capabilities: { canAddConnection: true, reason: null },
                  }),
        );
        const user = renderPanel();

        await user.click(
            await screen.findByRole('button', { name: 'Actions for Finance' }),
        );
        await user.click(
            await screen.findByRole('menuitem', { name: 'Remove' }),
        );
        const title = await screen.findByText('Remove connection');
        const dialog = title.closest<HTMLElement>(
            '[role="alertdialog"], [role="dialog"]',
        )!;
        await user.click(
            within(dialog).getByRole('button', { name: 'Remove' }),
        );

        expect(await within(dialog).findByText(refusal)).toBeInTheDocument();
        expect(mockApi).toHaveBeenCalledWith(
            expect.objectContaining({
                url: `${listUrl}/extra-uuid`,
                method: 'DELETE',
            }),
        );
    });

    it("edits the original's SQL runner databases and keeps named databases while listing all", async () => {
        mockApi.mockImplementation(({ method }: { method: string }) =>
            method === 'PATCH'
                ? Promise.resolve({ ...original, listAllDatabases: true })
                : Promise.resolve({
                      connections: [
                          { ...original, additionalDatabases: ['sales'] },
                          extra,
                      ],
                      capabilities: { canAddConnection: true, reason: null },
                  }),
        );
        const user = renderPanel();

        await user.click(
            await screen.findByRole('button', {
                name: 'Actions for Warehouse',
            }),
        );
        await user.click(
            await screen.findByRole('menuitem', {
                name: 'SQL runner databases',
            }),
        );
        const title = await screen.findByText(
            'SQL runner databases for Warehouse',
        );
        const dialog = title.closest<HTMLElement>(
            '[role="alertdialog"], [role="dialog"]',
        )!;
        const additional = within(dialog).getByPlaceholderText(
            'Type a database name and press Enter',
        );
        expect(additional).toBeEnabled();
        expect(within(dialog).getByText('sales')).toBeInTheDocument();

        await user.click(
            within(dialog).getByRole('switch', { name: /List all databases/ }),
        );
        expect(additional).toBeDisabled();
        await user.click(
            within(dialog).getByRole('button', { name: 'Save changes' }),
        );

        await waitFor(() =>
            expect(mockApi).toHaveBeenCalledWith({
                url: `${listUrl}/original-uuid`,
                method: 'PATCH',
                body: JSON.stringify({
                    listAllDatabases: true,
                    additionalDatabases: ['sales'],
                }),
            }),
        );
    });
});
