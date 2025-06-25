import {
    QueueTraceProperties,
    SCHEDULER_TASKS,
    SchedulerTaskName,
    TaskPayloadMap,
} from '@lightdash/common';
import * as Sentry from '@sentry/node';
import { JobHelpers, Task, TaskList } from 'graphile-worker';
import moment from 'moment';
import ExecutionContext from 'node-execution-context';
import { ExecutionContextInfo } from '../logging/winston';
import { TypedTask, TypedTaskList } from './types';

const getTagsForTask: {
    [K in SchedulerTaskName]: (
        payload: TaskPayloadMap[K],
    ) => Record<string, string>;
} = {
    [SCHEDULER_TASKS.HANDLE_SCHEDULED_DELIVERY]: (payload) => ({
        'organization.uuid': payload.organizationUuid,
        'user.uuid': payload.userUuid,
        'project.uuid': payload.projectUuid,
    }),

    [SCHEDULER_TASKS.SEND_SLACK_NOTIFICATION]: (payload) => ({
        'organization.uuid': payload.organizationUuid,
        'user.uuid': payload.userUuid,
        'project.uuid': payload.projectUuid,
    }),
    [SCHEDULER_TASKS.SEND_MSTEAMS_NOTIFICATION]: (payload) => ({
        'organization.uuid': payload.organizationUuid,
        'user.uuid': payload.userUuid,
        'project.uuid': payload.projectUuid,
    }),
    [SCHEDULER_TASKS.SEND_EMAIL_NOTIFICATION]: (payload) => ({
        'organization.uuid': payload.organizationUuid,
        'user.uuid': payload.userUuid,
        'project.uuid': payload.projectUuid,
    }),

    [SCHEDULER_TASKS.UPLOAD_GSHEETS]: (payload) => ({
        'organization.uuid': payload.organizationUuid,
        'user.uuid': payload.userUuid,
        'project.uuid': payload.projectUuid,
    }),

    [SCHEDULER_TASKS.DOWNLOAD_CSV]: (payload) => ({
        'organization.uuid': payload.organizationUuid,
        'user.uuid': payload.userUuid,
        'project.uuid': payload.projectUuid,
    }),

    [SCHEDULER_TASKS.UPLOAD_GSHEET_FROM_QUERY]: (payload) => ({
        'organization.uuid': payload.organizationUuid,
        'user.uuid': payload.userUuid,
        'project.uuid': payload.projectUuid,
    }),

    [SCHEDULER_TASKS.VALIDATE_PROJECT]: (payload) => ({
        'organization.uuid': payload.organizationUuid,
        'user.uuid': payload.userUuid,
        'project.uuid': payload.projectUuid,
    }),

    [SCHEDULER_TASKS.COMPILE_PROJECT]: (payload) => ({
        'organization.uuid': payload.organizationUuid,
        'user.uuid': payload.userUuid,
        'project.uuid': payload.projectUuid,
    }),

    [SCHEDULER_TASKS.CREATE_PROJECT_WITH_COMPILE]: (payload) => ({
        'organization.uuid': payload.organizationUuid,
        'user.uuid': payload.userUuid,
        'project.uuid': '',
    }),

    [SCHEDULER_TASKS.TEST_AND_COMPILE_PROJECT]: (payload) => ({
        'organization.uuid': payload.organizationUuid,
        'user.uuid': payload.userUuid,
        'project.uuid': payload.projectUuid,
    }),

    [SCHEDULER_TASKS.SQL_RUNNER]: (payload) => ({
        'organization.uuid': payload.organizationUuid,
        'user.uuid': payload.userUuid,
        'project.uuid': payload.projectUuid,
    }),

    [SCHEDULER_TASKS.SQL_RUNNER_PIVOT_QUERY]: (payload) => ({
        'organization.uuid': payload.organizationUuid,
        'user.uuid': payload.userUuid,
        'project.uuid': payload.projectUuid,
    }),

    [SCHEDULER_TASKS.REPLACE_CUSTOM_FIELDS]: (payload) => ({
        'organization.uuid': payload.organizationUuid,
        'user.uuid': payload.userUuid,
        'project.uuid': payload.projectUuid,
    }),

    [SCHEDULER_TASKS.INDEX_CATALOG]: (payload) => ({
        'organization.uuid': payload.organizationUuid,
        'user.uuid': payload.userUuid,
        'project.uuid': payload.projectUuid,
    }),

    [SCHEDULER_TASKS.GENERATE_DAILY_JOBS]: () => ({}),

    [SCHEDULER_TASKS.EXPORT_CSV_DASHBOARD]: (payload) => ({
        'organization.uuid': payload.organizationUuid,
        'user.uuid': payload.userUuid,
        'project.uuid': payload.projectUuid,
    }),

    [SCHEDULER_TASKS.SLACK_AI_PROMPT]: (payload) => ({
        'organization.uuid': payload.organizationUuid,
        'user.uuid': payload.userUuid,
        'project.uuid': payload.projectUuid,
    }),

    [SCHEDULER_TASKS.RENAME_RESOURCES]: (payload) => ({
        'organization.uuid': payload.organizationUuid,
        'user.uuid': payload.userUuid,
        'project.uuid': payload.projectUuid,
    }),
} as const;

// Generic accessor function
const getTagsFromPayload = <T extends SchedulerTaskName>(
    taskName: T,
    payload: TaskPayloadMap[T],
): Record<string, string> => getTagsForTask[taskName](payload);

/**
 * Traces a task and adds tags to the Sentry span
 * @param taskName - The name of the task to trace
 * @param task - The task to trace
 * @returns A function that can be used to trace a task
 */
export const traceTask = <T extends SchedulerTaskName>(
    taskName: T,
    task: TypedTask<TaskPayloadMap[T]>,
) => {
    const tracedTask: (
        payload: TaskPayloadMap[T] & QueueTraceProperties,
        helpers: JobHelpers,
    ) => void = async (payload, helpers) => {
        const { traceHeader, baggageHeader } = payload;

        await Sentry.continueTrace(
            { sentryTrace: traceHeader, baggage: baggageHeader },
            async () => {
                await Sentry.startSpan(
                    {
                        name: `worker.task.${taskName}`,
                        attributes: {
                            'scheduler.task': taskName,
                            'job.id': helpers.job.id,
                            'job.queue': helpers.job.queue_name || 'unknown',
                            'job.attempts': helpers.job.attempts,
                            'job.max_attempts': helpers.job.max_attempts,
                        },
                    },
                    async (span) => {
                        const { job } = helpers;

                        const payloadTags = getTagsFromPayload(
                            taskName,
                            payload,
                        );

                        if ('user.uuid' in payloadTags) {
                            Sentry.setUser({
                                id: payloadTags['user.uuid'],
                                organization: payloadTags['organization.uuid'],
                            });
                        }

                        Sentry.setTags({
                            'scheduler.task': taskName,
                            'worker.task.name': taskName,
                            'job.id': job.id,
                            'worker.id': job.locked_by,
                            'worker.job.id': job.id,
                            'worker.job.task_identifier': job.task_identifier,
                            'worker.job.attempts': job.attempts,
                            'worker.job.max_attempts': job.max_attempts,
                            ...(job.locked_at && {
                                'worker.job.locked_at': moment(
                                    job.locked_at,
                                ).toISOString(),
                            }),
                            ...(job.created_at && {
                                'worker.job.created_at':
                                    job.created_at.toISOString(),
                            }),
                            ...(job.locked_by && {
                                'worker.job.locked_by': job.locked_by,
                            }),
                            ...(job.key && {
                                'worker.job.key': job.key,
                            }),
                            ...('organizationUuid' in payloadTags &&
                                typeof payloadTags.organizationUuid ===
                                    'string' && {
                                    'worker.task.organization_id':
                                        payloadTags.organizationUuid,
                                }),
                            ...payloadTags,
                        });

                        try {
                            const executionContext: ExecutionContextInfo = {
                                worker: {
                                    id: job.locked_by,
                                },
                                job: {
                                    id: job.id,
                                    queue_name: job.queue_name,
                                    task_identifier: job.task_identifier,
                                    priority: job.priority,
                                    attempts: job.attempts,
                                },
                            };
                            await ExecutionContext.run(
                                () => task(payload, helpers),
                                executionContext,
                            );
                        } catch (e) {
                            span.setStatus({
                                code: 2, // Error
                            });

                            // Add breadcrumb for worker context
                            Sentry.addBreadcrumb({
                                category: 'worker',
                                message: `Error occurred in scheduler worker context - ${taskName}`,
                                level: 'error',
                                data: {
                                    taskName,
                                    jobId: String(job.id),
                                    workerInstance: job.locked_by,
                                },
                            });

                            // Capture the error with additional fingerprinting
                            Sentry.withScope((scope) => {
                                scope.setFingerprint([
                                    'scheduler_worker',
                                    taskName,
                                    (e as Error).name || 'Error',
                                    (e as Error).message || 'Unknown error',
                                ]);
                                Sentry.captureException(e);
                            });

                            throw e;
                        }
                    },
                );
            },
        );
    };
    return tracedTask;
};

/**
 * Traces a list of tasks and converts them to a Graphile Worker TaskList
 * @param tasks - The list of tasks to trace
 * @returns A list of traced tasks that can be used in a Graphile Worker
 */
export const traceTasks = (tasks: TypedTaskList) => {
    const tracedTasks = Object.keys(tasks).reduce<TaskList>(
        (accTasks, taskName) => ({
            ...accTasks,
            // NOTE: Graphile Worker requires the task to be of type Task, which is not typed. We need to cast it to unknown.
            [taskName]: traceTask(
                taskName as SchedulerTaskName,
                tasks[taskName as keyof TypedTaskList] as TypedTask<unknown>,
            ) as Task,
        }),
        {} as TaskList,
    );
    return tracedTasks;
};
