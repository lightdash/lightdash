import { JobStepStatusType, type Job } from '@lightdash/common';

export const formatFailedJobLog = (job: Job): string =>
    [
        `Compilation job: ${job.jobUuid}`,
        `Status: ${job.jobStatus}`,
        `Started: ${new Date(job.createdAt).toISOString()}`,
        `Updated: ${new Date(job.updatedAt).toISOString()}`,
        '',
        'This file contains persisted job errors and captured dbt logs only.',
        'Output from successful commands, non-JSON output, and stderr may not have been captured.',
        '',
        ...job.steps.flatMap((step) => [
            `--- ${step.stepLabel} (${step.stepStatus}) ---`,
            ...(step.stepError ? [step.stepError] : []),
            ...(step.stepDbtLogs?.length
                ? step.stepDbtLogs.map(
                      (log) =>
                          `[${log.info.ts || 'timestamp unavailable'}] [${log.info.level}] ${log.info.msg}`,
                  )
                : [
                      step.stepStatus === JobStepStatusType.PENDING ||
                      step.stepStatus === JobStepStatusType.SKIPPED
                          ? 'This step did not run.'
                          : 'No dbt output was captured for this step.',
                  ]),
            '',
        ]),
    ].join('\n');
