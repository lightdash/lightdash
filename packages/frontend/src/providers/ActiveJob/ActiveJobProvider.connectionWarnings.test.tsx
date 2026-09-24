import { JobStatusType, JobType, type Job } from '@lightdash/common';
import { act, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import ActiveJobProvider from './ActiveJobProvider';
import useActiveJob from './useActiveJob';

const observer = vi.hoisted(() => ({
    onSuccess: undefined as ((job: Job) => void | Promise<void>) | undefined,
}));
const showToastWarning = vi.hoisted(() => vi.fn());

vi.mock('../../hooks/useRefreshServer', async (importOriginal) => ({
    ...(await importOriginal()),
    useJob: (
        _jobId: string | undefined,
        onSuccess: (job: Job) => void | Promise<void>,
    ) => {
        observer.onSuccess = onSuccess;
        return { data: undefined };
    },
}));

vi.mock('../../hooks/toaster/useToaster', () => ({
    default: () => ({
        showToastWarning,
        showToastSuccess: vi.fn(),
        showToastInfo: vi.fn(),
        showToastApiError: vi.fn(),
    }),
}));

const ActivateJob = () => {
    const { setActiveJobId } = useActiveJob();
    useEffect(() => {
        setActiveJobId('job-uuid');
    }, [setActiveJobId]);
    return null;
};

beforeEach(() => {
    vi.clearAllMocks();
    observer.onSuccess = undefined;
});

it('keeps the validator action when a compile has connection warnings and explore errors', async () => {
    renderWithProviders(
        <MemoryRouter>
            <ActiveJobProvider>
                <ActivateJob />
            </ActiveJobProvider>
        </MemoryRouter>,
    );
    await waitFor(() => expect(observer.onSuccess).toBeDefined());
    const job: Job = {
        jobUuid: 'job-uuid',
        projectUuid: 'project-uuid',
        userUuid: 'user-uuid',
        createdAt: new Date(),
        updatedAt: new Date(),
        jobStatus: JobStatusType.DONE,
        jobType: JobType.COMPILE_PROJECT,
        steps: [],
        jobResults: {
            indexCatalogJobUuid: 'catalog-job-uuid',
            errorCount: 3,
            total: 10,
            connectionWarnings: [
                'Connection "Finance" failed: invalid password',
            ],
        },
    };
    await act(async () => {
        await observer.onSuccess?.(job);
    });
    expect(showToastWarning).toHaveBeenCalledWith(
        expect.objectContaining({
            title: 'Connections failed to compile; 3 of 10 tables have errors',
            subtitle: '- Connection "Finance" failed: invalid password',
            action: expect.objectContaining({ children: 'View errors' }),
        }),
    );
});
