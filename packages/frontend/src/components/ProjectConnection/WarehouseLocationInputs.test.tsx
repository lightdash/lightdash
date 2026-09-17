import {
    DbtProjectType,
    DefaultSupportedDbtVersion,
    ProjectType,
    WarehouseTypes,
    type Connection,
    type CreateWarehouseCredentials,
    type Project,
    type WarehouseCredentials,
} from '@lightdash/common';
import { screen, waitFor } from '@testing-library/react';
import { type FC } from 'react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('../../api', () => ({
    lightdashApi: vi.fn(),
}));

import { lightdashApi } from '../../api';
import { renderWithProviders } from '../../testing/testUtils';
import { FormProvider, useForm } from './formContext';
import WarehouseLocationInputs from './WarehouseLocationInputs';

const mockApi = lightdashApi as unknown as Mock;

const PROJECT_UUID = 'project-uuid';

const buildConnection = (warehouseType: WarehouseTypes): Connection => ({
    connectionUuid: 'connection-1',
    name: 'Analytics warehouse',
    warehouseType,
    organizationWarehouseCredentialsUuid: null,
    listAllDatabases: false,
    additionalDatabases: [],
    createdAt: new Date('2026-09-01T10:00:00.000Z'),
});

const postgresCredentials: WarehouseCredentials = {
    type: WarehouseTypes.POSTGRES,
    host: 'localhost',
    port: 5432,
    dbname: 'analytics',
    schema: 'jaffle',
};

const buildProject = (overrides: Partial<Project>): Project => ({
    organizationUuid: 'org-uuid',
    projectUuid: PROJECT_UUID,
    name: 'Jaffle shop',
    type: ProjectType.DEFAULT,
    dbtConnection: { type: DbtProjectType.NONE, hideRefreshButton: false },
    connections: [buildConnection(WarehouseTypes.POSTGRES)],
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
    ...overrides,
});

const routeApi = (project: Project) => {
    mockApi.mockImplementation(
        ({ url, method }: { url: string; method: string }) => {
            if (url === `/projects/${PROJECT_UUID}` && method === 'GET') {
                return Promise.resolve(project);
            }
            return Promise.resolve(null);
        },
    );
};

const Harness: FC = () => {
    const form = useForm({
        initialValues: {
            name: '',
            dbt: { type: DbtProjectType.NONE },
            warehouse: {
                type: WarehouseTypes.POSTGRES,
                host: '',
                user: '',
                password: '',
                port: 5432,
                dbname: '',
                schema: '',
            } as CreateWarehouseCredentials,
            dbtVersion: DefaultSupportedDbtVersion,
            warehouseLocation: { database: '', schema: '' },
        },
    });

    return (
        <FormProvider form={form}>
            <WarehouseLocationInputs projectUuid={PROJECT_UUID} />
        </FormProvider>
    );
};

describe('WarehouseLocationInputs without a single warehouse connection', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('labels the inputs from the first connection warehouse type', async () => {
        routeApi(
            buildProject({
                warehouseConnection: undefined,
                connections: [buildConnection(WarehouseTypes.BIGQUERY)],
            }),
        );

        renderWithProviders(<Harness />);

        expect(await screen.findByLabelText('GCP project')).toBeVisible();
        expect(screen.getByLabelText('Dataset')).toBeVisible();
    });

    it('leaves the inherited placeholders empty because connections carry no credentials', async () => {
        routeApi(
            buildProject({
                warehouseConnection: undefined,
                connections: [buildConnection(WarehouseTypes.POSTGRES)],
            }),
        );

        renderWithProviders(<Harness />);

        expect(await screen.findByLabelText('Database')).not.toHaveAttribute(
            'placeholder',
        );
        expect(screen.getByLabelText('Schema')).not.toHaveAttribute(
            'placeholder',
        );
    });

    it('still shows the inherited values when the project has a warehouse connection', async () => {
        routeApi(buildProject({ warehouseConnection: postgresCredentials }));

        renderWithProviders(<Harness />);

        expect(await screen.findByLabelText('Database')).toHaveAttribute(
            'placeholder',
            'analytics',
        );
        expect(screen.getByLabelText('Schema')).toHaveAttribute(
            'placeholder',
            'jaffle',
        );
    });

    it('renders nothing when neither a connection nor a warehouse connection gives a type', async () => {
        routeApi(
            buildProject({ warehouseConnection: undefined, connections: [] }),
        );

        renderWithProviders(<Harness />);

        await waitFor(() =>
            expect(mockApi).toHaveBeenCalledWith(
                expect.objectContaining({ url: `/projects/${PROJECT_UUID}` }),
            ),
        );
        expect(
            screen.queryByText("Where this source's models live"),
        ).not.toBeInTheDocument();
    });
});
