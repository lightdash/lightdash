import { JobStepStatusType, type Job } from '@lightdash/common';
import i18n from '../../i18n/i18n';

const tLog = (key: string, options?: Record<string, unknown>) =>
    i18n.t(`jobDetails.failedLog.${key}`, {
        ns: 'projectConnection',
        ...options,
    });

export const formatFailedJobLog = (job: Job): string =>
    [
        tLog('job', { jobUuid: job.jobUuid }),
        tLog('status', { status: job.jobStatus }),
        tLog('started', { date: new Date(job.createdAt).toISOString() }),
        tLog('updated', { date: new Date(job.updatedAt).toISOString() }),
        '',
        tLog('contents'),
        tLog('limitations'),
        '',
        ...job.steps.flatMap((step) => [
            `--- ${step.stepLabel} (${step.stepStatus}) ---`,
            ...(step.stepError ? [step.stepError] : []),
            ...(step.stepDbtLogs?.length
                ? step.stepDbtLogs.map(
                      (log) =>
                          `[${log.info.ts || tLog('timestampUnavailable')}] [${log.info.level}] ${log.info.msg}`,
                  )
                : [
                      step.stepStatus === JobStepStatusType.PENDING ||
                      step.stepStatus === JobStepStatusType.SKIPPED
                          ? tLog('stepDidNotRun')
                          : tLog('noOutput'),
                  ]),
            '',
        ]),
    ].join('\n');
