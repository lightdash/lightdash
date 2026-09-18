import { Ability } from '@casl/ability';
import {
    DbtProjectType,
    DefaultSupportedDbtVersion,
    JobStatusType,
    JobType,
    ProjectType,
    WarehouseTypes,
    type Connection,
    type PossibleAbilities,
    type Project,
    type WarehouseCredentials,
} from '@lightdash/common';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('../../api', () => ({
    lightdashApi: vi.fn(),
}));

import { lightdashApi } from '../../api';
import { AbilityContext } from '../../providers/Ability/context';
import ActiveJobProvider from '../../providers/ActiveJob/ActiveJobProvider';
import { renderWithProviders } from '../../testing/testUtils';
import UpdateProjectConnection from './UpdateProjectConnection';

const mockApi = lightdashApi as unknown as Mock;

const PROJECT_UUID = 'project-uuid';
const PROJECT_URL = `/projects/${PROJECT_UUID}`;
const CONNECTIONS_URL = `${PROJECT_URL}/connections`;

const warehouseCredentials: WarehouseCredentials = {
    type: WarehouseTypes.POSTGRES,
    host: 'localhost',
    port: 5432,
    dbname: 'postgres',
    schema: 'jaffle',
};

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
    ...primaryConnection,
    connectionUuid: 'connection-2',
    name: 'Reporting warehouse',
    createdAt: new Date('2026-09-10T10:00:00.000Z'),
};

const buildProject = (overrides: Partial<Project> = {}): Project => ({
    organizationUuid: 'org-uuid',
    projectUuid: PROJECT_UUID,
    name: 'Jaffle shop',
    type: ProjectType.DEFAULT,
    dbtConnection: { type: DbtProjectType.NONE, hideRefreshButton: false },
    warehouseConnection: warehouseCredentials,
    connections: [primaryConnection],
    dbtVersion: DefaultSupportedDbtVersion,
    schedulerTimezone: 'UTC',
    queryTimezone: null,
    useProjectTimezoneInFilters: false,
    schedulerFailureNotifyRecipients: false,
    schedulerFailureIncludeContact: false,
    schedulerFailureContactOverride: null,
    createdByUserUuid: null,
    hasDefaultUserSpaces: false,
    colorPaletteUuid: null,
    expiresAt: null,
    agentSqlScope: null,
    requireUserCredentials: false,
    ...overrides,
});

type ApiCall = { url: string; method: string; body?: string };

const routeApi = (options: {
    project?: Project;
    connections: Connection[];
    canAddConnection: boolean;
}) => {
    const calls: ApiCall[] = [];
    const project = options.project ?? buildProject();

    mockApi.mockImplementation(({ url, method, body }: ApiCall) => {
        calls.push({ url, method, body });

        if (url === PROJECT_URL && method === 'GET') {
            return Promise.resolve(project);
        }
        if (url === PROJECT_URL && method === 'PATCH') {
            return Promise.resolve({ jobUuid: 'job-1' });
        }
        if (url === CONNECTIONS_URL && method === 'GET') {
            return Promise.resolve({
                connections: options.connections,
                capabilities: {
                    canAddConnection: options.canAddConnection,
                },
            });
        }
        if (url.startsWith(`${PROJECT_URL}/compile-logs`)) {
            return Promise.resolve({
                data: [],
                pagination: {
                    page: 1,
                    pageSize: 1,
                    totalPageCount: 0,
                    totalResults: 0,
                },
            });
        }
        if (url.startsWith(`${PROJECT_URL}/dbt-sources`)) {
            return Promise.resolve([]);
        }
        if (url.startsWith('/jobs/')) {
            return Promise.resolve({
                jobUuid: 'job-1',
                jobStatus: JobStatusType.DONE,
                jobType: JobType.COMPILE_PROJECT,
                projectUuid: PROJECT_UUID,
                userUuid: 'user-1',
                createdAt: new Date(),
                updatedAt: new Date(),
                steps: [],
            });
        }
        return Promise.resolve(null);
    });

    return calls;
};

const ability = new Ability<PossibleAbilities>([
    { action: 'update', subject: 'Project' },
]);

const renderPage = (saveCredentials = false) =>
    renderWithProviders(
        <MemoryRouter>
            <AbilityContext.Provider value={ability}>
                <ActiveJobProvider>
                    <UpdateProjectConnection projectUuid={PROJECT_UUID} />
                </ActiveJobProvider>
            </AbilityContext.Provider>
        </MemoryRouter>,
        { health: { isSaveCredentialsFormEnabled: saveCredentials } },
    );

const submit = async () => {
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Save and test' }));
};

const deploy = async () => {
    const user = userEvent.setup();
    await user.click(
        screen.getByRole('button', { name: 'Test & deploy project' }),
    );
};

const updateBody = (calls: ApiCall[]) => {
    const call = calls.find(
        ({ url, method }) => url === PROJECT_URL && method === 'PATCH',
    );
    return call?.body === undefined
        ? undefined
        : (JSON.parse(call.body) as Record<string, unknown>);
};

describe('UpdateProjectConnection warehouse ownership', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('keeps the single warehouse card while the project may hold one connection', async () => {
        routeApi({ connections: [primaryConnection], canAddConnection: false });

        renderPage(true);

        expect(await screen.findByText('Warehouse connection')).toBeVisible();
        await waitFor(() =>
            expect(
                screen.getByRole('button', { name: 'Test connection' }),
            ).toBeVisible(),
        );
        expect(
            screen.getByRole('button', { name: 'Save credentials' }),
        ).toBeVisible();
        expect(screen.queryByText('Connections')).not.toBeInTheDocument();
    });

    it('keeps the local dbt target while the single card owns the connection', async () => {
        routeApi({
            project: buildProject({
                dbtConnection: {
                    type: DbtProjectType.DBT,
                    target: 'prod',
                    environment: [],
                    selector: '',
                },
            }),
            connections: [primaryConnection],
            canAddConnection: false,
        });

        renderPage();

        await screen.findByText('Warehouse connection');
        expect(screen.getByLabelText('Target name')).toBeVisible();
    });

    it('hands warehouse editing to the connections list once another connection is allowed', async () => {
        routeApi({ connections: [primaryConnection], canAddConnection: true });

        renderPage(true);

        expect(await screen.findByText('Connections')).toBeVisible();
        expect(
            screen.queryByText('Warehouse connection'),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Test connection' }),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Save credentials' }),
        ).not.toBeInTheDocument();
    });

    it('hands warehouse editing to the connections list when several already exist', async () => {
        routeApi({
            connections: [primaryConnection, secondConnection],
            canAddConnection: false,
        });

        renderPage();

        expect(await screen.findByText('Connections')).toBeVisible();
        expect(
            screen.queryByText('Warehouse connection'),
        ).not.toBeInTheDocument();
    });

    it('leaves the submit button enabled when the connections list owns the warehouse', async () => {
        routeApi({
            connections: [primaryConnection, secondConnection],
            canAddConnection: false,
        });

        renderPage();

        await screen.findByText('Connections');
        expect(
            screen.getByRole('button', { name: 'Save and test' }),
        ).toBeEnabled();
    });
});

describe('UpdateProjectConnection submit payload', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('sends the warehouse connection while the single card owns it', async () => {
        const calls = routeApi({
            connections: [primaryConnection],
            canAddConnection: false,
        });

        renderPage();

        await screen.findByText('Warehouse connection');
        await submit();

        await waitFor(() => expect(updateBody(calls)).toBeDefined());
        expect(updateBody(calls)).toMatchObject({
            name: 'Jaffle shop',
            warehouseConnection: { type: WarehouseTypes.POSTGRES },
        });
    });

    it('omits the warehouse connection when the connections list owns it', async () => {
        const calls = routeApi({
            connections: [primaryConnection],
            canAddConnection: true,
        });

        renderPage();

        await screen.findByText('Connections');
        const user = userEvent.setup();
        const requireUserCredentialsSwitch = document.querySelector(
            '[name="requireUserCredentials"]',
        );
        if (!requireUserCredentialsSwitch) {
            throw new Error('Require user credentials switch was not rendered');
        }
        await user.click(requireUserCredentialsSwitch);
        await submit();

        await waitFor(() => expect(updateBody(calls)).toBeDefined());
        const body = updateBody(calls)!;
        expect(body).not.toHaveProperty('warehouseConnection');
        expect(body).toMatchObject({
            name: 'Jaffle shop',
            dbtConnection: { type: DbtProjectType.NONE },
            dbtVersion: DefaultSupportedDbtVersion,
            requireUserCredentials: true,
        });
    });

    it('omits the warehouse connection for a project with no single warehouse connection', async () => {
        const calls = routeApi({
            project: buildProject({
                warehouseConnection: undefined,
                connections: [primaryConnection, secondConnection],
            }),
            connections: [primaryConnection, secondConnection],
            canAddConnection: false,
        });

        renderPage();

        await screen.findByText('Connections');
        await submit();

        await waitFor(() => expect(updateBody(calls)).toBeDefined());
        expect(updateBody(calls)).not.toHaveProperty('warehouseConnection');
    });

    it('deploys local dbt settings without hidden warehouse fields', async () => {
        const calls = routeApi({
            project: buildProject({
                dbtConnection: {
                    type: DbtProjectType.DBT,
                    target: 'prod',
                    environment: [],
                    selector: '',
                },
                warehouseConnection: undefined,
                connections: [primaryConnection, secondConnection],
                requireUserCredentials: true,
            }),
            connections: [primaryConnection, secondConnection],
            canAddConnection: false,
        });

        renderPage();

        await screen.findByText('Connections');
        expect(screen.queryByLabelText('Schema')).not.toBeInTheDocument();
        expect(screen.queryByLabelText('Target name')).not.toBeInTheDocument();
        await deploy();

        await waitFor(() => expect(updateBody(calls)).toBeDefined());
        const body = updateBody(calls)!;
        expect(body).not.toHaveProperty('warehouseConnection');
        expect(body).toMatchObject({
            name: 'Jaffle shop',
            dbtConnection: {
                type: DbtProjectType.DBT,
                target: 'prod',
            },
            requireUserCredentials: true,
        });
    });
});
