import { SCHEDULER_TASKS } from '@lightdash/common';
import { lightdashConfigMock } from '../config/lightdashConfig.mock';
import {
    SchedulerWorker,
    type SchedulerWorkerArguments,
} from './SchedulerWorker';

class QuerySweeperWorker extends SchedulerWorker {
    public tasks() {
        return this.getFullTaskList();
    }

    public cronItems() {
        return this.getCronItems();
    }
}

const createWorker = (sweep: (timeout: number) => Promise<void>) =>
    new QuerySweeperWorker({
        lightdashConfig: lightdashConfigMock,
        asyncQueryService: { queryHistoryModel: { failStuckQueries: sweep } },
    } as unknown as SchedulerWorkerArguments);

it('runs the sweeper every minute with the configured timeout', async () => {
    const sweep = vi.fn(async () => {});
    const worker = createWorker(sweep);
    expect(worker.cronItems()).toContainEqual(
        expect.objectContaining({
            task: SCHEDULER_TASKS.SWEEP_STUCK_QUERIES,
            pattern: '* * * * *',
        }),
    );
    await worker
        .tasks()
        [SCHEDULER_TASKS.SWEEP_STUCK_QUERIES]({} as never, {} as never);
    expect(sweep).toHaveBeenCalledExactlyOnceWith(86400);
});

it('lets the scheduler retry a failed sweep', async () => {
    const failure = new Error('database unavailable');
    const worker = createWorker(vi.fn().mockRejectedValue(failure));
    await expect(
        worker
            .tasks()
            [SCHEDULER_TASKS.SWEEP_STUCK_QUERIES]({} as never, {} as never),
    ).rejects.toBe(failure);
});
