import {
    DbtProjectType,
    OnboardingStepStatus,
    OnboardingStepType,
    WarehouseTypes,
} from '@lightdash/common';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { type FC } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dbtDefaults } from '../../../../components/ProjectConnection/DbtForms/defaultValues';
import {
    FormProvider,
    useForm,
} from '../../../../components/ProjectConnection/formContext';
import { SnowflakeDefaultValues } from '../../../../components/ProjectConnection/WarehouseForms/defaultValues';
import { renderWithProviders } from '../../../../testing/testUtils';
import type * as OnboardingStateModule from '../../hooks/useOnboardingState';
import ConnectMethodCliSso from './ConnectMethodCliSso';

const PASSED_VALIDATION = {
    diagnostic: { status: 'passed', checks: [] },
    schemas: null,
    inventory: null,
};

const AUTH_FAILED_VALIDATION = {
    diagnostic: {
        status: 'failed',
        checks: [
            {
                id: 'authenticate',
                label: 'Authenticate',
                status: 'failed',
                durationMs: 20,
                diagnosis: {
                    title: 'Your Snowflake connection has expired',
                    detail: 'Reconnect through the CLI to continue.',
                    remedySql: null,
                    docsUrl: null,
                },
            },
        ],
    },
    schemas: null,
    inventory: null,
};

const mocks = vi.hoisted(() => ({
    goToProjectConnect: vi.fn(),
    goToProjectStep: vi.fn(),
    createMutate: vi.fn(),
    connectMutate: vi.fn(),
    wizardProjectUuid: { value: null as string | null },
    stateData: { value: undefined as unknown },
    projectData: { value: undefined as unknown },
    validateResult: { value: undefined as unknown },
}));

vi.mock('../../../../hooks/useProject', () => ({
    useProject: () => ({ data: mocks.projectData.value }),
}));

vi.mock('../../context/wizardContext', () => ({
    useOnboardingWizard: () => ({
        projectUuid: mocks.wizardProjectUuid.value,
        siteUrl: 'http://localhost',
        version: '',
        goToProjectStep: mocks.goToProjectStep,
        goToProjectConnect: mocks.goToProjectConnect,
    }),
}));

vi.mock('../../hooks/useCreateOnboardingProject', () => ({
    useCreateOnboardingProject: () => ({
        mutateAsync: mocks.createMutate,
        isLoading: false,
    }),
}));

vi.mock('../../hooks/useConnectCode', () => ({
    useConnectCode: () => ({
        mutateAsync: mocks.connectMutate,
        isLoading: false,
    }),
}));

vi.mock('../../hooks/useOnboardingState', async (importOriginal) => {
    const actual = await importOriginal<typeof OnboardingStateModule>();
    return {
        ...actual,
        useOnboardingState: () => ({
            data: mocks.stateData.value,
            isError: false,
        }),
    };
});

vi.mock('../../hooks/useValidateConnection', () => ({
    useValidateConnection: () => ({
        mutateAsync: vi.fn(() => Promise.resolve(mocks.validateResult.value)),
    }),
}));

const Harness: FC = () => {
    const form = useForm({
        initialValues: {
            name: '',
            dbt: dbtDefaults.formValues[DbtProjectType.NONE],
            warehouse: SnowflakeDefaultValues,
            dbtVersion: dbtDefaults.dbtVersion,
            organizationWarehouseCredentialsUuid: undefined,
        },
    });
    return (
        <FormProvider form={form}>
            <ConnectMethodCliSso />
        </FormProvider>
    );
};

const renderCliSso = (
    entry = '/createProject?warehouse=snowflake&method=cli_sso',
) =>
    renderWithProviders(
        <MemoryRouter initialEntries={[entry]}>
            <Harness />
        </MemoryRouter>,
    );

const pendingConfigState = {
    projectUuid: 'proj-1',
    steps: [
        {
            step: OnboardingStepType.CONNECT,
            status: OnboardingStepStatus.PENDING_CONFIGURATION,
            result: {
                inventory: {
                    databases: [{ name: 'DB1', comment: null, kind: null }],
                    warehouses: [
                        {
                            name: 'WH1',
                            size: 'X-Small',
                            state: 'STARTED',
                            autoSuspendSeconds: 60,
                        },
                    ],
                    roles: [{ name: 'READER', isDefault: true }],
                },
                connectionValues: {
                    database: 'DB1',
                    warehouse: 'WH1',
                    role: 'READER',
                    schema: null,
                },
                connectionValueSources: {
                    database: 'default',
                    warehouse: 'default',
                    role: 'default',
                    schema: 'missing',
                },
            },
            updatedAt: new Date(0),
        },
    ],
};

describe('ConnectMethodCliSso', () => {
    beforeEach(() => {
        mocks.goToProjectConnect.mockReset();
        mocks.goToProjectStep.mockReset();
        mocks.createMutate.mockReset().mockResolvedValue({
            projectUuid: 'new-proj',
        });
        mocks.connectMutate.mockReset().mockResolvedValue({
            code: 'ABC123',
            expiresAt: new Date(Date.now() + 900_000).toISOString(),
        });
        mocks.wizardProjectUuid.value = null;
        mocks.stateData.value = undefined;
        mocks.projectData.value = undefined;
        mocks.validateResult.value = PASSED_VALIDATION;
    });

    it('creating the project hands off to the project-scoped connect route', async () => {
        renderCliSso();

        fireEvent.change(screen.getByRole('textbox', { name: 'Account' }), {
            target: { value: 'ACME-123' },
        });
        fireEvent.click(
            screen.getByRole('button', { name: /Generate connect code/ }),
        );

        await waitFor(() =>
            expect(mocks.goToProjectConnect).toHaveBeenCalledWith(
                'new-proj',
                'ACME-123',
            ),
        );
    });

    it('does not auto-mint on a refresh-like mount (no justCreated state)', async () => {
        mocks.wizardProjectUuid.value = 'proj-1';
        mocks.stateData.value = {
            projectUuid: 'proj-1',
            steps: [
                {
                    step: OnboardingStepType.CONNECT,
                    status: OnboardingStepStatus.PENDING,
                    result: null,
                    updatedAt: new Date(0),
                },
            ],
        };

        renderWithProviders(
            <MemoryRouter
                initialEntries={[
                    '/createProject/proj-1/connect?warehouse=snowflake&method=cli_sso&account=ACME-123',
                ]}
            >
                <Harness />
            </MemoryRouter>,
        );

        const accountInput = await screen.findByRole<HTMLInputElement>(
            'textbox',
            { name: 'Account' },
        );
        expect(accountInput.value).toBe('ACME-123');
        expect(mocks.connectMutate).not.toHaveBeenCalled();
        expect(mocks.createMutate).not.toHaveBeenCalled();
    });

    it('auto-mints exactly once when arriving with the justCreated handoff', async () => {
        mocks.wizardProjectUuid.value = 'new-proj';

        renderWithProviders(
            <MemoryRouter
                initialEntries={[
                    {
                        pathname: '/createProject/new-proj/connect',
                        search: '?warehouse=snowflake&method=cli_sso&account=ACME-123',
                        state: { justCreated: true },
                    },
                ]}
            >
                <Harness />
            </MemoryRouter>,
        );

        await waitFor(() =>
            expect(mocks.connectMutate).toHaveBeenCalledTimes(1),
        );
        expect(mocks.connectMutate).toHaveBeenCalledWith('new-proj');
        expect(await screen.findByText(/ABC123/)).toBeInTheDocument();
    });

    it('resumes to the configure UI when the connect step is pending_configuration', async () => {
        mocks.wizardProjectUuid.value = 'proj-1';
        mocks.stateData.value = pendingConfigState;

        renderCliSso();

        // The resume effect derives the configure phase from server state.
        expect(await screen.findByText('Almost there')).toBeInTheDocument();
        expect(mocks.createMutate).not.toHaveBeenCalled();
    });

    it('reconnect builds the CLI command with the account from the stored project', async () => {
        mocks.wizardProjectUuid.value = 'proj-1';
        mocks.stateData.value = pendingConfigState;
        mocks.validateResult.value = AUTH_FAILED_VALIDATION;
        mocks.projectData.value = {
            warehouseConnection: {
                type: WarehouseTypes.SNOWFLAKE,
                account: 'PROJ-ACC',
            },
        };

        // No &account= in the URL: the account must come from the project.
        renderCliSso(
            '/createProject/proj-1/connect?warehouse=snowflake&method=cli_sso',
        );

        const reconnect = await screen.findByRole('button', {
            name: /Reconnect with a new code/,
        });
        fireEvent.click(reconnect);

        const command = await screen.findByText(/--account PROJ-ACC/);
        expect(command).toBeInTheDocument();
    });

    it('gates the command behind an account field when none can be resolved', async () => {
        mocks.wizardProjectUuid.value = 'proj-1';
        mocks.stateData.value = pendingConfigState;
        mocks.validateResult.value = AUTH_FAILED_VALIDATION;
        mocks.projectData.value = undefined; // no stored account either

        renderCliSso(
            '/createProject/proj-1/connect?warehouse=snowflake&method=cli_sso',
        );

        const reconnect = await screen.findByRole('button', {
            name: /Reconnect with a new code/,
        });
        fireEvent.click(reconnect);

        // No broken `--account ` command; the account field is shown instead.
        expect(
            await screen.findByRole('textbox', { name: 'Snowflake account' }),
        ).toBeInTheDocument();
        expect(screen.queryByText(/--account/)).not.toBeInTheDocument();
    });

    it('does not auto-mint on a refresh (no justCreated) and prefills the account from the query', async () => {
        // Simulates a mid-wait reload: project context + account are in the URL,
        // but there is no justCreated navigation state.
        mocks.wizardProjectUuid.value = 'proj-1';
        mocks.stateData.value = undefined;

        renderCliSso(
            '/createProject/proj-1/connect?warehouse=snowflake&method=cli_sso&account=ACME-9',
        );

        // Account is seeded from the query into the form field.
        await waitFor(() =>
            expect(
                (
                    screen.getByRole('textbox', {
                        name: 'Account',
                    }) as HTMLInputElement
                ).value,
            ).toBe('ACME-9'),
        );
        // Crucially, no code was minted — the in-flight CLI code stays valid.
        expect(mocks.connectMutate).not.toHaveBeenCalled();
        expect(
            screen.getByRole('button', { name: /Generate connect code/ }),
        ).toBeInTheDocument();
    });
});
