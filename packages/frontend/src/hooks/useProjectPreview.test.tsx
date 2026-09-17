import {
    JobStatusType,
    JobStepStatusType,
    JobStepType,
    JobType,
    type Job,
    type ApiCreatePreviewResults,
} from '@lightdash/common';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { type PropsWithChildren } from 'react';
import { lightdashApi } from '../api';
import { useCreatePreviewMutation } from './useProjectPreview';

const { showToastSuccess, showToastApiError, setActiveJobId } = vi.hoisted(
    () => ({
        showToastSuccess: vi.fn(),
        showToastApiError: vi.fn(),
        setActiveJobId: vi.fn(),
    }),
);
vi.mock('../api', () => ({ lightdashApi: vi.fn() }));
vi.mock('./toaster/useToaster', () => ({
    default: () => ({ showToastSuccess, showToastApiError }),
}));
vi.mock('../providers/ActiveJob/useActiveJob', () => ({
    default: () => ({ setActiveJobId }),
}));

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
    projectUuid: 'preview',
    compileJobUuid: 'compile-job',
    contentCopyJobUuid: 'copy-job',
};
const input = { projectUuid: 'upstream', name: 'Preview' };
function wrapper({ children }: PropsWithChildren) {
    return (
        <QueryClientProvider
            client={
                new QueryClient({
                    defaultOptions: { mutations: { retry: false } },
                })
            }
        >
            {children}
        </QueryClientProvider>
    );
}
afterEach(() => vi.resetAllMocks());

test('keeps the preview mutation pending until content copy completes', async () => {
    vi.mocked(lightdashApi<Job | ApiCreatePreviewResults>)
        .mockResolvedValueOnce(creation)
        .mockResolvedValueOnce({ ...copyJob, jobStatus: JobStatusType.STARTED })
        .mockResolvedValueOnce({ ...copyJob, jobStatus: JobStatusType.DONE });
    const { result } = renderHook(useCreatePreviewMutation, { wrapper });
    act(() => result.current.mutate(input));
    await waitFor(() => expect(result.current.isLoading).toBe(true));
    expect(showToastSuccess).not.toHaveBeenCalled();
    expect(setActiveJobId).not.toHaveBeenCalled();
    await waitFor(() => expect(result.current.isSuccess).toBe(true), {
        timeout: 5000,
    });
    expect(showToastSuccess).toHaveBeenCalledOnce();
    expect(setActiveJobId).toHaveBeenCalledWith('compile-job');
    expect(lightdashApi).toHaveBeenLastCalledWith({
        url: '/jobs/copy-job',
        method: 'GET',
        body: undefined,
    });
});

test('reports the stored copy error without announcing a successful preview', async () => {
    vi.mocked(lightdashApi<Job | ApiCreatePreviewResults>)
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
    const { result } = renderHook(useCreatePreviewMutation, { wrapper });
    act(() => result.current.mutate(input));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(showToastApiError).toHaveBeenCalledWith(
        expect.objectContaining({
            apiError: expect.objectContaining({
                message: 'Unable to copy charts',
            }),
        }),
    );
    expect(showToastSuccess).not.toHaveBeenCalled();
    expect(setActiveJobId).not.toHaveBeenCalled();
});

test('still supports servers that return only a compile job', async () => {
    const { contentCopyJobUuid, ...legacyCreation } = creation;
    vi.mocked(
        lightdashApi<Job | ApiCreatePreviewResults>,
    ).mockResolvedValueOnce(legacyCreation);
    const { result } = renderHook(useCreatePreviewMutation, { wrapper });
    act(() => result.current.mutate(input));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lightdashApi).toHaveBeenCalledTimes(1);
    expect(setActiveJobId).toHaveBeenCalledWith('compile-job');
});
