import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import { DbtSourceReboundNote } from './DbtSourceConnection';

const compile = vi.hoisted(() => vi.fn());
const jobObserver = vi.hoisted(() => ({
    jobId: undefined as string | undefined,
    onSuccess: undefined as ((job: unknown) => void) | undefined,
}));

vi.mock('../../hooks/useRefreshServer', () => ({
    useRefreshServer: () => ({ mutate: compile, isLoading: false }),
    useJob: (jobId: string | undefined, onSuccess: (job: unknown) => void) => {
        jobObserver.jobId = jobId;
        jobObserver.onSuccess = onSuccess;
    },
}));

const rebound = {
    sourceName: 'marketing',
    connectionName: 'Finance warehouse',
};

describe('review PR12b: dbt rebinding note and the compile job status', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        jobObserver.jobId = undefined;
        jobObserver.onSuccess = undefined;
    });

    const start = async () => {
        const onDismiss = vi.fn();
        renderWithProviders(
            <DbtSourceReboundNote
                rebound={rebound as never}
                onDismiss={onDismiss}
            />,
        );
        const user = userEvent.setup();
        await user.click(screen.getByRole('button', { name: 'Compile now' }));
        compile.mock.lastCall?.[1]?.onSuccess({ jobUuid: 'job-uuid' });
        await screen.findByRole('button', { name: 'Compile now' });
        return onDismiss;
    };

    it('subscribes to the accepted job', async () => {
        await start();
        expect(jobObserver.jobId).toBe('job-uuid');
    });

    it('does not dismiss while the job is RUNNING', async () => {
        const onDismiss = await start();
        jobObserver.onSuccess?.({ jobUuid: 'job-uuid', jobStatus: 'RUNNING' });
        expect(onDismiss).not.toHaveBeenCalled();
    });

    it('does not dismiss when the job ends in ERROR (explores did not move)', async () => {
        const onDismiss = await start();
        jobObserver.onSuccess?.({ jobUuid: 'job-uuid', jobStatus: 'ERROR' });
        expect(onDismiss).not.toHaveBeenCalled();
    });

    it('dismisses on DONE', async () => {
        const onDismiss = await start();
        jobObserver.onSuccess?.({ jobUuid: 'job-uuid', jobStatus: 'DONE' });
        expect(onDismiss).toHaveBeenCalledTimes(1);
    });
});
