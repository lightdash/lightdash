import { getSchedule, stringToArray } from 'cron-converter';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

export type NextRun = { label: string; relative: string };

export const getNextRuns = (
    cron: string,
    timezone: string | undefined,
    count = 3,
): NextRun[] => {
    if (!cron) return [];
    try {
        const schedule = getSchedule(stringToArray(cron), new Date(), timezone);
        return Array.from({ length: count }, () => {
            const next = schedule.next();
            return {
                label: next.toFormat('ccc, LLL d · h:mm a'),
                relative: dayjs(next.toJSDate()).fromNow(),
            };
        });
    } catch {
        return [];
    }
};
