import { getSchedule, stringToArray } from 'cron-converter';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

export type NextRun = {
    label: string;
    relative: string;
    timeZoneName: string;
};

const getShortTimeZoneName = (date: Date, timeZone: string): string => {
    try {
        return (
            new Intl.DateTimeFormat(undefined, {
                timeZone,
                timeZoneName: 'short',
            })
                .formatToParts(date)
                .find((part) => part.type === 'timeZoneName')?.value ?? timeZone
        );
    } catch {
        return timeZone;
    }
};

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
            const jsDate = next.toJSDate();
            const timeZoneName = getShortTimeZoneName(jsDate, next.zoneName);
            return {
                label: `${next.toFormat('ccc, LLL d · h:mm a')} ${timeZoneName}`,
                relative: dayjs(jsDate).fromNow(),
                timeZoneName,
            };
        });
    } catch {
        return [];
    }
};
