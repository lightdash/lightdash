import {
    JobStatusType,
    JobStepStatusType,
    JobStepType,
    JobType,
    WarehouseTypes,
    type Job,
} from '@lightdash/common';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('../../api', () => ({
    lightdashApi: vi.fn(),
}));

import { lightdashApi } from '../../api';
import ActiveJobProvider from '../../providers/ActiveJob/ActiveJobProvider';
import { renderWithProviders } from '../../testing/testUtils';
import CreateProjectConnection from './CreateProjectconnection';

const mockApi = lightdashApi as unknown as Mock;

const ACTIVE_JOB_URL = '/org/jobs/create-project/active';
const CREATE_PROJECT_URL = '/org/projects/precompiled';

const IN_FLIGHT_JOB_UUID = 'job-in-flight';

const buildJob = (overrides: Partial<Job> = {}): Job =>
    ({
        jobUuid: IN_FLIGHT_JOB_UUID,
        projectUuid: undefined,
        userUuid: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        jobStatus: JobStatusType.RUNNING,
        jobType: JobType.CREATE_PROJECT,
        steps: [
            {
                jobUuid: IN_FLIGHT_JOB_UUID,
                createdAt: new Date(),
                updatedAt: new Date(),
                stepStatus: JobStepStatusType.RUNNING,
                stepType: JobStepType.TESTING_ADAPTOR,
                stepLabel: 'Testing adaptor',
                startedAt: new Date(),
                stepError: undefined,
                stepDbtLogs: undefined,
            },
            {
                jobUuid: IN_FLIGHT_JOB_UUID,
                createdAt: new Date(),
                updatedAt: new Date(),
                stepStatus: JobStepStatusType.PENDING,
                stepType: JobStepType.CREATING_PROJECT,
                stepLabel: 'Creating project',
                startedAt: undefined,
                stepError: undefined,
                stepDbtLogs: undefined,
            },
        ],
        ...overrides,
    }) as Job;

type ApiCall = { url: string; method: string };

const routeApi = (handlers: {
    activeJob: () => unknown;
    job?: () => unknown;
    createProject?: () => unknown;
}) => {
    const calls: ApiCall[] = [];
    mockApi.mockImplementation(({ url, method }: ApiCall) => {
        calls.push({ url, method });
        if (url === ACTIVE_JOB_URL) {
            return Promise.resolve(handlers.activeJob());
        }
        if (url.startsWith('/jobs/')) {
            return Promise.resolve(handlers.job?.() ?? buildJob());
        }
        if (url === CREATE_PROJECT_URL) {
            return (
                handlers.createProject?.() ??
                Promise.resolve({ jobUuid: 'new-job' })
            );
        }
        return Promise.resolve(null);
    });
    return calls;
};

const renderFlow = () =>
    renderWithProviders(
        <MemoryRouter initialEntries={['/onboarding/data-source/postgres']}>
            <ActiveJobProvider>
                <CreateProjectConnection
                    isCreatingFirstProject
                    selectedWarehouse={WarehouseTypes.POSTGRES}
                    warehouseOnly
                />
            </ActiveJobProvider>
        </MemoryRouter>,
    );

const fillConnectionForm = async () => {
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(/^Host/), 'localhost');
    await user.type(screen.getByLabelText(/^User/), 'postgres');
    await user.type(screen.getByLabelText(/^Password/), 'password');
    await user.type(screen.getByLabelText(/^DB name/), 'postgres');
    await user.type(screen.getByLabelText(/^Schema/), 'jaffle');
    return user;
};

describe('CreateProjectConnection in-flight job recovery', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('resumes the creating state when a create-project job is already in flight', async () => {
        routeApi({ activeJob: () => buildJob() });

        renderFlow();

        expect(
            await screen.findByText('Creating your project'),
        ).toBeInTheDocument();
        expect(screen.getByText('Testing adaptor')).toBeInTheDocument();
        expect(screen.getByText('Creating project')).toBeInTheDocument();
        expect(screen.getByText('0/2 steps complete')).toBeInTheDocument();

        expect(screen.queryByLabelText(/^Host/)).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Test & save' }),
        ).not.toBeInTheDocument();
    });

    it('shows the connection form when no job is in flight', async () => {
        const calls = routeApi({ activeJob: () => null });

        renderFlow();

        expect(await screen.findByLabelText(/^Host/)).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Test & save' }),
        ).toBeInTheDocument();
        expect(
            screen.queryByText('Creating your project'),
        ).not.toBeInTheDocument();
        expect(calls.some(({ url }) => url.startsWith('/jobs/'))).toBe(false);
    });

    it('resumes polling the job carried by a 409 instead of failing the submit', async () => {
        const calls = routeApi({
            activeJob: () => null,
            createProject: () =>
                Promise.reject({
                    status: 'error',
                    error: {
                        name: 'ConflictError',
                        statusCode: 409,
                        message: 'A project creation is already in progress',
                        data: { jobUuid: IN_FLIGHT_JOB_UUID },
                    },
                }),
        });

        renderFlow();

        const user = await fillConnectionForm();
        await user.click(screen.getByRole('button', { name: 'Test & save' }));

        expect(
            await screen.findByText('Creating your project'),
        ).toBeInTheDocument();

        await waitFor(() =>
            expect(
                calls.some(({ url }) => url === `/jobs/${IN_FLIGHT_JOB_UUID}`),
            ).toBe(true),
        );

        expect(
            calls.filter(({ url }) => url === CREATE_PROJECT_URL),
        ).toHaveLength(1);
    });

    it('shows an informational conflict without registering another active job', async () => {
        const message =
            'A project creation is already in progress for the organization';
        const calls = routeApi({
            activeJob: () => null,
            createProject: () =>
                Promise.reject({
                    status: 'error',
                    error: {
                        name: 'ConflictError',
                        statusCode: 409,
                        message,
                        data: {},
                    },
                }),
        });

        renderFlow();

        const user = await fillConnectionForm();
        await user.click(screen.getByRole('button', { name: 'Test & save' }));

        expect(await screen.findByText(message)).toBeInTheDocument();
        expect(
            screen.queryByText('Failed to create project'),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByText('Creating your project'),
        ).not.toBeInTheDocument();
        expect(calls.some(({ url }) => url.startsWith('/jobs/'))).toBe(false);
        expect(
            calls.filter(({ url }) => url === CREATE_PROJECT_URL),
        ).toHaveLength(1);
    });

    it('surfaces the failing step when the resumed job errors', async () => {
        routeApi({
            activeJob: () =>
                buildJob({
                    jobStatus: JobStatusType.ERROR,
                    steps: [
                        {
                            jobUuid: IN_FLIGHT_JOB_UUID,
                            createdAt: new Date(),
                            updatedAt: new Date(),
                            stepStatus: JobStepStatusType.ERROR,
                            stepType: JobStepType.TESTING_ADAPTOR,
                            stepLabel: 'Testing adaptor',
                            startedAt: new Date(),
                            stepError:
                                'The server does not support SSL connections',
                            stepDbtLogs: undefined,
                        },
                    ],
                }),
            job: () =>
                buildJob({
                    jobStatus: JobStatusType.ERROR,
                    steps: [
                        {
                            jobUuid: IN_FLIGHT_JOB_UUID,
                            createdAt: new Date(),
                            updatedAt: new Date(),
                            stepStatus: JobStepStatusType.ERROR,
                            stepType: JobStepType.TESTING_ADAPTOR,
                            stepLabel: 'Testing adaptor',
                            startedAt: new Date(),
                            stepError:
                                'The server does not support SSL connections',
                            stepDbtLogs: undefined,
                        },
                    ],
                }),
        });

        renderFlow();

        expect(
            await screen.findByText(
                'The server does not support SSL connections',
            ),
        ).toBeInTheDocument();
        expect(await screen.findByLabelText(/^Host/)).toBeInTheDocument();
    });
});
