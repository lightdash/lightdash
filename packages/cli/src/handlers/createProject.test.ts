import {
    JobStatusType,
    JobStepStatusType,
    JobStepType,
    JobType,
    ProjectType,
    type ApiCreateProjectResults,
    type Job,
} from '@lightdash/common';
import { createProject } from './createProject';
import { lightdashApi } from './dbt/apiClient';

vi.mock('./dbt/apiClient', () => ({
    checkProjectCreationPermission: vi.fn(),
    lightdashApi: vi.fn(),
}));

const options: Parameters<typeof createProject>[0] = {
    name: 'Preview',
    type: ProjectType.PREVIEW,
    projectDir: '.',
    profilesDir: '.',
    profile: undefined,
    target: undefined,
    warehouseCredentials: false,
    copyContent: true,
    upstreamProjectUuid: 'upstream',
};
const copyJob: Job = {
    jobUuid: 'copy-job',
    jobType: JobType.CREATE_PROJECT,
    jobStatus: JobStatusType.STARTED,
    projectUuid: undefined,
    userUuid: 'user',
    createdAt: new Date(),
    updatedAt: new Date(),
    steps: [],
};
const creation = {
    project: { projectUuid: 'preview' },
    hasContentCopy: false,
    contentCopyJobUuid: 'copy-job',
} as ApiCreateProjectResults;

afterEach(() => {
    vi.useRealTimers();
    vi.resetAllMocks();
});

test('waits for content copying before returning the created preview to start-preview', async () => {
    vi.useFakeTimers();
    vi.mocked(lightdashApi<Job | ApiCreateProjectResults>)
        .mockResolvedValueOnce(creation)
        .mockResolvedValueOnce({ ...copyJob, jobStatus: JobStatusType.STARTED })
        .mockResolvedValueOnce({ ...copyJob, jobStatus: JobStatusType.DONE });
    const finished = vi.fn();
    const result = createProject(options).then((value) => {
        finished();
        return value;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(finished).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(3000);
    await expect(result).resolves.toMatchObject({ hasContentCopy: true });
    expect(lightdashApi).toHaveBeenLastCalledWith({
        method: 'GET',
        url: '/api/v1/jobs/copy-job',
        body: undefined,
    });
});

test('surfaces background copy failures instead of returning a successful preview', async () => {
    vi.mocked(lightdashApi<Job | ApiCreateProjectResults>)
        .mockResolvedValueOnce(creation)
        .mockResolvedValueOnce({
            ...copyJob,
            jobStatus: JobStatusType.ERROR,
            steps: [
                {
                    jobUuid: 'copy-job',
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    startedAt: undefined,
                    stepDbtLogs: undefined,
                    stepType: JobStepType.COPYING_PREVIEW_CONTENT,
                    stepStatus: JobStepStatusType.ERROR,
                    stepLabel: 'Copying preview content',
                    stepError: 'Unable to copy charts',
                },
            ],
        });
    await expect(createProject(options)).rejects.toThrow(
        'Unable to copy charts',
    );
});

test('does not poll when the server returns no copy job', async () => {
    const { contentCopyJobUuid, ...legacyCreation } = creation;
    vi.mocked(
        lightdashApi<Job | ApiCreateProjectResults>,
    ).mockResolvedValueOnce(legacyCreation);
    await expect(
        createProject({ ...options, copyContent: false }),
    ).resolves.toEqual(legacyCreation);
    expect(lightdashApi).toHaveBeenCalledTimes(1);
});
