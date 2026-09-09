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

/**
 * Upcoming run instants are computed in `timezone` (the schedule / project
 * zone). Pass `displayTimezone` (IANA or `'local'`) to format those instants
 * in the viewer's zone instead of the schedule zone.
 */
export const getNextRuns = (
    cron: string,
    timezone: string | undefined,
    count = 3,
    displayTimezone?: string,
): NextRun[] => {
    if (!cron) return [];
    try {
        const schedule = getSchedule(stringToArray(cron), new Date(), timezone);
        return Array.from({ length: count }, () => {
            const next = schedule.next();
            const displayed = displayTimezone
                ? next.setZone(displayTimezone)
                : next;
            const jsDate = next.toJSDate();
            return {
                label: displayed.toFormat('ccc, LLL d · h:mm a'),
                relative: dayjs(jsDate).fromNow(),
                timeZoneName: getShortTimeZoneName(jsDate, displayed.zoneName),
            };
        });
    } catch {
        return [];
    }
};
