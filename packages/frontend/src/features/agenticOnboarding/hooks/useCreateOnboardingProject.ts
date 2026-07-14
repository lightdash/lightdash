import {
    DbtProjectType,
    JobStatusType,
    ProjectType,
    isCreateProjectJob,
    type ApiError,
    type ApiJobStartedResults,
    type CreateWarehouseCredentials,
    type Job,
} from '@lightdash/common';
import { useMutation } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';
import { dbtDefaults } from '../../../components/ProjectConnection/DbtForms/defaultValues';

const POLL_INTERVAL_MS = 800;
const MAX_POLLS = 120;

type CreateOnboardingProjectParams = {
    name: string;
    warehouseConnection: CreateWarehouseCredentials;
};

const delay = (ms: number) =>
    new Promise<void>((resolve) => {
        setTimeout(resolve, ms);
    });

const startProjectCreation = async ({
    name,
    warehouseConnection,
}: CreateOnboardingProjectParams): Promise<ApiJobStartedResults> =>
    lightdashApi<ApiJobStartedResults>({
        url: `/org/projects/precompiled`,
        method: 'POST',
        body: JSON.stringify({
            name,
            type: ProjectType.DEFAULT,
            dbtConnection: dbtDefaults.formValues[DbtProjectType.NONE],
            dbtVersion: dbtDefaults.dbtVersion,
            warehouseConnection,
        }),
    });

const getJob = async (jobUuid: string): Promise<Job> =>
    lightdashApi<Job>({
        url: `/jobs/${jobUuid}`,
        method: 'GET',
        body: undefined,
    });

const pollForProjectUuid = async (jobUuid: string): Promise<string> => {
    for (let attempt = 0; attempt < MAX_POLLS; attempt += 1) {
        // eslint-disable-next-line no-await-in-loop
        const job = await getJob(jobUuid);
        if (job.jobStatus === JobStatusType.ERROR) {
            throw new Error('Project creation failed');
        }
        if (
            job.jobStatus === JobStatusType.DONE &&
            isCreateProjectJob(job) &&
            job.jobResults?.projectUuid
        ) {
            return job.jobResults.projectUuid;
        }
        // eslint-disable-next-line no-await-in-loop
        await delay(POLL_INTERVAL_MS);
    }
    throw new Error('Timed out waiting for project creation');
};

const createOnboardingProject = async (
    params: CreateOnboardingProjectParams,
): Promise<{ projectUuid: string }> => {
    const { jobUuid } = await startProjectCreation(params);
    const projectUuid = await pollForProjectUuid(jobUuid);
    return { projectUuid };
};

export const useCreateOnboardingProject = () =>
    useMutation<
        { projectUuid: string },
        ApiError,
        CreateOnboardingProjectParams
    >({
        mutationKey: ['onboarding', 'create-project'],
        mutationFn: createOnboardingProject,
    });
