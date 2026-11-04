import {
    JobStatusType,
    JobStepStatusType,
    JobStepType,
} from '@lightdash/common';
import knex from 'knex';
import { getTracker, MockClient } from 'knex-mock-client';
import { JobsTableName, JobStepsTableName } from '../database/entities/jobs';
import { JobModel } from '../models/JobModel/JobModel';
import { resolveCrossSourceManifests } from '../projectAdapters/crossSourceRefs';
import { ProjectService } from '../services/ProjectService/ProjectService';
import { armCompileShutdown, CompileInterruptedError } from './compileShutdown';
import { SchedulerWorker } from './SchedulerWorker';

it('writes the shutdown error to the running step and job before stop returns', async () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    const tracker = getTracker();
    tracker.on.update(JobsTableName).response(1);
    tracker.on.update(JobStepsTableName).response(1);
    const jobModel = new JobModel({ database });
    const projectService = Object.create(
        ProjectService.prototype,
    ) as ProjectService;
    projectService.jobModel = jobModel;
    const worker = new SchedulerWorker({
        lightdashConfig: { scheduler: { tasks: [] } },
        projectService,
    } as unknown as ConstructorParameters<typeof SchedulerWorker>[0]);
    const run = (
        worker as unknown as {
            runCompileTask(
                jobUuid: string,
                task: () => Promise<void>,
            ): Promise<void>;
        }
    ).runCompileTask.bind(worker);
    const fetch = vi.fn(
        async (options: { signal?: AbortSignal }) =>
            new Promise<never>((_done, reject) => {
                options.signal!.addEventListener(
                    'abort',
                    () => reject(options.signal!.reason),
                    { once: true },
                );
            }),
    );
    const work = run('leaf_a', async () => {
        await jobModel.tryJobStep('leaf_a', JobStepType.COMPILING, () =>
            resolveCrossSourceManifests({
                tasks: [{ key: 'leaf_a', context: null, fetch }],
                enabled: true,
                concurrency: 1,
                signal: armCompileShutdown(),
            }),
        );
    }).catch((error: unknown) => error);
    try {
        await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
        await worker.stop();
        expect(await work).toBeInstanceOf(CompileInterruptedError);
        const updates = tracker.history.update;
        expect(
            updates.some(
                (query) =>
                    query.sql.includes(JobStepsTableName) &&
                    query.bindings.includes(JobStepStatusType.ERROR) &&
                    query.bindings.includes(
                        new CompileInterruptedError().message,
                    ),
            ),
        ).toBe(true);
        expect(
            updates.some(
                (query) =>
                    query.sql.includes(JobsTableName) &&
                    query.bindings.includes(JobStatusType.ERROR),
            ),
        ).toBe(true);
        expect(
            updates.some((query) =>
                query.bindings.includes(JobStatusType.DONE),
            ),
        ).toBe(false);
    } finally {
        tracker.reset();
        await database.destroy();
    }
});
