import { SchedulerJobStatus, SchedulerLog } from '@lightdash/common';
import { SchedulerModel } from './index';

describe('Scheduler model test', () => {
    test('Test scheduler log sorting', () => {
        const baseLog: SchedulerLog = {
            task: 'handleScheduledDelivery',
            schedulerUuid: '1',
            status: SchedulerJobStatus.SCHEDULED,
            scheduledTime: new Date(2021, 0, 2),
            createdAt: new Date(2021, 0, 2),
            jobId: '1',
        };

        const logs = [
            baseLog,
            { ...baseLog, jobId: '2', status: SchedulerJobStatus.ERROR },
            { ...baseLog, jobId: '3', status: SchedulerJobStatus.COMPLETED },
            { ...baseLog, jobId: '4', status: SchedulerJobStatus.COMPLETED },
            {
                ...baseLog,
                jobId: '5',
                status: SchedulerJobStatus.SCHEDULED,
                scheduledTime: new Date(2021, 0, 3),
            },
            {
                ...baseLog,
                jobId: '6',
                status: SchedulerJobStatus.SCHEDULED,
                scheduledTime: new Date(2021, 0, 1),
            },
        ];
        const sortedLogs = logs.sort(SchedulerModel.sortLogs);

        expect(sortedLogs.map((l) => l.jobId)).toStrictEqual([
            '5',
            '2',
            '3',
            '4',
            '1',
            '6',
        ]);
    });
});
