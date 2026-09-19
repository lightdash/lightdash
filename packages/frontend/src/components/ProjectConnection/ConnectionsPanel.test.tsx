import {
    CONNECTION_NAME_CONFLICT_MESSAGE,
    WarehouseTypes,
    type Connection,
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
import { lightdashApi } from '../../api';
import { renderWithProviders } from '../../testing/testUtils';
import ConnectionsPanel from './ConnectionsPanel';

vi.mock('../../api', () => ({
    lightdashApi: vi.fn(),
}));

const mockApi = lightdashApi as unknown as Mock;

const CONNECTIONS_URL = '/projects/project-uuid/connections';

const primaryConnection: Connection = {
    connectionUuid: 'connection-1',
    name: 'Analytics warehouse',
    warehouseType: WarehouseTypes.POSTGRES,
    organizationWarehouseCredentialsUuid: null,
    listAllDatabases: false,
    additionalDatabases: [],
    createdAt: new Date('2026-09-01T10:00:00.000Z'),
};

const secondConnection: Connection = {
    connectionUuid: 'connection-2',
    name: 'Reporting warehouse',
    warehouseType: WarehouseTypes.POSTGRES,
    organizationWarehouseCredentialsUuid: 'org-credential-uuid',
    listAllDatabases: true,
    additionalDatabases: ['raw'],
    createdAt: new Date('2026-09-10T10:00:00.000Z'),
};

const storedCredentials = {
    type: WarehouseTypes.POSTGRES,
    host: 'localhost',
    dbname: 'acc_marketing',
    schema: 'public',
    port: 6132,
};

const nameConflict = () =>
    Promise.reject({
        status: 'error',
        error: {
            statusCode: 409,
            name: 'ConflictError',
            message: CONNECTION_NAME_CONFLICT_MESSAGE,
        },
    });

const routeApi = (options: {
    connections: Connection[];
    canAddConnection: boolean;
    reason?: string;
    deleteError?: string;
    nameIsTaken?: boolean;
}) => {
    mockApi.mockImplementation(
        ({ url, method }: { url: string; method: string }) => {
            if (url === CONNECTIONS_URL && method === 'GET') {
                return Promise.resolve({
                    connections: options.connections,
                    capabilities: {
                        canAddConnection: options.canAddConnection,
                        ...(options.reason ? { reason: options.reason } : {}),
                    },
                });
            }
            if (url === CONNECTIONS_URL && method === 'POST') {
                return options.nameIsTaken
                    ? nameConflict()
                    : Promise.resolve(options.connections[0]);
            }
            if (
                url === `${CONNECTIONS_URL}/connection-1/name` &&
                method === 'PATCH'
            ) {
                return options.nameIsTaken
                    ? nameConflict()
                    : Promise.resolve(options.connections[0]);
            }
            if (url === `${CONNECTIONS_URL}/connection-1` && method === 'GET') {
                return Promise.resolve({
                    ...options.connections[0],
                    warehouseConnection: storedCredentials,
                });
            }
            if (
                url === `${CONNECTIONS_URL}/connection-2` &&
                method === 'DELETE'
            ) {
                if (options.deleteError) {
                    return Promise.reject({
                        status: 'error',
                        error: {
                            statusCode: 409,
                            name: 'ConflictError',
                            message: options.deleteError,
                        },
                    });
                }
                return Promise.resolve(undefined);
            }
            return Promise.resolve(undefined);
        },
    );
};

describe('ConnectionsPanel', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('stays hidden while one connection is all the project may hold', async () => {
        routeApi({
            connections: [primaryConnection],
            canAddConnection: false,
            reason: 'This project can hold one connection.',
        });
        renderWithProviders(<ConnectionsPanel projectUuid="project-uuid" />);

        await waitFor(() =>
            expect(
                screen.queryByRole('button', { name: 'Add connection' }),
            ).not.toBeInTheDocument(),
        );
        expect(screen.queryByText('Connections')).not.toBeInTheDocument();
        expect(
            screen.queryByText('Analytics warehouse'),
        ).not.toBeInTheDocument();
    });

    it('appears for a project that already holds several connections', async () => {
        routeApi({
            connections: [primaryConnection, secondConnection],
            canAddConnection: false,
            reason: 'A second connection is not enabled for this organisation yet.',
        });
        renderWithProviders(<ConnectionsPanel projectUuid="project-uuid" />);

        expect(await screen.findByText('Connections')).toBeInTheDocument();
        expect(
            await screen.findByText('Reporting warehouse'),
        ).toBeInTheDocument();
    });

    it('lists every connection with its type and organisation credential tag', async () => {
        routeApi({
            connections: [primaryConnection, secondConnection],
            canAddConnection: true,
        });
        renderWithProviders(<ConnectionsPanel projectUuid="project-uuid" />);

        expect(
            await screen.findByText('Analytics warehouse'),
        ).toBeInTheDocument();
        expect(screen.getByText('Reporting warehouse')).toBeInTheDocument();
        expect(screen.getAllByText(/PostgreSQL · added/)).toHaveLength(2);
        expect(screen.getAllByText('Organisation credential')).toHaveLength(1);
    });

    it('does not show the project credential policy in the connection modal', async () => {
        routeApi({
            connections: [primaryConnection],
            canAddConnection: true,
        });
        const user = userEvent.setup();
        renderWithProviders(<ConnectionsPanel projectUuid="project-uuid" />);

        await user.click(
            await screen.findByRole('button', { name: 'Add connection' }),
        );

        const dialog = await screen.findByRole('dialog');
        expect(
            within(dialog).queryByLabelText(
                'Require users to provide their own credentials',
            ),
        ).not.toBeInTheDocument();
    });

    it('disables Add connection and explains why when a second one is not allowed', async () => {
        const reason =
            'A second connection is not enabled for this organisation yet.';
        routeApi({
            connections: [primaryConnection, secondConnection],
            canAddConnection: false,
            reason,
        });
        const user = userEvent.setup();
        renderWithProviders(<ConnectionsPanel projectUuid="project-uuid" />);

        const addButton = await screen.findByRole('button', {
            name: 'Add connection',
        });
        expect(addButton).toBeDisabled();

        await user.hover(addButton.parentElement!);
        expect(await screen.findByText(reason)).toBeInTheDocument();
    });

    it('offers no Remove action while the project holds one connection', async () => {
        routeApi({
            connections: [primaryConnection],
            canAddConnection: true,
        });
        const user = userEvent.setup();
        renderWithProviders(<ConnectionsPanel projectUuid="project-uuid" />);

        await user.click(
            await screen.findByRole('button', {
                name: 'Actions for Analytics warehouse',
            }),
        );

        expect(
            await screen.findByRole('menuitem', { name: 'Edit' }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('menuitem', { name: 'Remove' }),
        ).not.toBeInTheDocument();
    });

    it('shows the bound-content counts when a removal is refused', async () => {
        routeApi({
            connections: [primaryConnection, secondConnection],
            canAddConnection: true,
            deleteError:
                'Connection cannot be deleted because it is used by 3 cached explores, 1 dbt source.',
        });
        const user = userEvent.setup();
        renderWithProviders(<ConnectionsPanel projectUuid="project-uuid" />);

        await user.click(
            await screen.findByRole('button', {
                name: 'Actions for Reporting warehouse',
            }),
        );
        await user.click(
            await screen.findByRole('menuitem', { name: 'Remove' }),
        );

        const dialog = await screen.findByRole('dialog');
        await user.click(
            within(dialog).getByRole('button', { name: 'Remove' }),
        );

        expect(
            await screen.findByText(
                'Connection cannot be deleted because it is used by 3 cached explores, 1 dbt source.',
            ),
        ).toBeInTheDocument();
        await waitFor(() =>
            expect(screen.getByRole('dialog')).toBeInTheDocument(),
        );
    });

    it('puts a duplicate name on the Name field of the add dialog', async () => {
        routeApi({
            connections: [primaryConnection, secondConnection],
            canAddConnection: true,
            nameIsTaken: true,
        });
        const user = userEvent.setup();
        renderWithProviders(<ConnectionsPanel projectUuid="project-uuid" />);

        await user.click(
            await screen.findByRole('button', { name: 'Add connection' }),
        );
        const dialog = await screen.findByRole('dialog');
        await user.type(
            within(dialog).getByRole('textbox', { name: /Name/ }),
            'Reporting warehouse',
        );
        await user.click(
            within(dialog).getByRole('button', { name: 'Add connection' }),
        );

        expect(
            await within(dialog).findByText(CONNECTION_NAME_CONFLICT_MESSAGE),
        ).toBeInTheDocument();
        expect(
            within(dialog).getByRole('textbox', { name: /Name/ }),
        ).toHaveFocus();
    });

    it('puts a duplicate name on the Name field of the rename dialog', async () => {
        routeApi({
            connections: [primaryConnection, secondConnection],
            canAddConnection: true,
            nameIsTaken: true,
        });
        const user = userEvent.setup();
        renderWithProviders(<ConnectionsPanel projectUuid="project-uuid" />);

        await user.click(
            await screen.findByRole('button', {
                name: 'Actions for Analytics warehouse',
            }),
        );
        await user.click(
            await screen.findByRole('menuitem', { name: 'Rename' }),
        );
        const dialog = await screen.findByRole('dialog');
        const nameInput = within(dialog).getByRole('textbox', {
            name: /Name/,
        });
        await user.clear(nameInput);
        await user.type(nameInput, 'Reporting warehouse');
        await user.click(
            within(dialog).getByRole('button', { name: 'Save changes' }),
        );

        expect(
            await within(dialog).findByText(CONNECTION_NAME_CONFLICT_MESSAGE),
        ).toBeInTheDocument();
        expect(nameInput).toHaveFocus();
    });

    it('prefills the stored connection and stops asking for saved secrets', async () => {
        routeApi({
            connections: [primaryConnection, secondConnection],
            canAddConnection: true,
        });
        const user = userEvent.setup();
        const { container } = renderWithProviders(
            <ConnectionsPanel projectUuid="project-uuid" />,
        );

        await user.click(
            await screen.findByRole('button', {
                name: 'Actions for Analytics warehouse',
            }),
        );
        await user.click(await screen.findByRole('menuitem', { name: 'Edit' }));

        await waitFor(() =>
            expect(
                container.querySelector('input[name="warehouse.host"]'),
            ).toHaveValue('localhost'),
        );
        expect(
            container.querySelector('input[name="warehouse.dbname"]'),
        ).toHaveValue('acc_marketing');
        expect(
            container.querySelector('input[name="warehouse.schema"]'),
        ).toHaveValue('public');

        // The stored user and password are never returned, so the fields stay
        // blank and must not read as "fill this in".
        const userInput = container.querySelector(
            'input[name="warehouse.user"]',
        );
        expect(userInput).toHaveValue('');
        expect(userInput).not.toBeRequired();
        expect(userInput).toHaveAttribute('placeholder', '**************');
        expect(
            container.querySelector('input[name="warehouse.password"]'),
        ).not.toBeRequired();
    });

    it('still requires a user and password when adding a connection', async () => {
        routeApi({
            connections: [primaryConnection, secondConnection],
            canAddConnection: true,
        });
        const user = userEvent.setup();
        const { container } = renderWithProviders(
            <ConnectionsPanel projectUuid="project-uuid" />,
        );

        await user.click(
            await screen.findByRole('button', { name: 'Add connection' }),
        );
        await screen.findByRole('dialog');

        await waitFor(() =>
            expect(
                container.querySelector('input[name="warehouse.user"]'),
            ).toBeRequired(),
        );
        expect(
            container.querySelector('input[name="warehouse.password"]'),
        ).toBeRequired();
    });
});
