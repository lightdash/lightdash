import {
    assertUnreachable,
    parseResultsCacheClearCron,
    resultsCacheClearCadenceToCron,
    type ResultsCacheClearCadence,
    type ResultsCacheClearSchedule,
    type UpdateResultsCacheClearSchedule,
} from '@lightdash/common';
import { useForm } from '@mantine/form';

export type ClearScheduleFrequency = ResultsCacheClearCadence['frequency'];

const DEFAULT_DAY_OF_WEEK = 1;
const DEFAULT_HOURS = [6];

export type ClearScheduleFormValues = {
    enabled: boolean;
    frequency: ClearScheduleFrequency;
    dayOfWeek: number;
    hours: number[];
};

const getInitialValues = (
    clearSchedule: ResultsCacheClearSchedule | null,
): ClearScheduleFormValues => {
    const cadence = clearSchedule
        ? parseResultsCacheClearCron(clearSchedule.cron)
        : null;
    return {
        enabled: clearSchedule?.enabled ?? false,
        frequency: cadence?.frequency ?? 'daily',
        dayOfWeek:
            cadence?.frequency === 'weekly'
                ? cadence.dayOfWeek
                : DEFAULT_DAY_OF_WEEK,
        hours: cadence?.hours ?? DEFAULT_HOURS,
    };
};

const toCadence = ({
    frequency,
    dayOfWeek,
    hours,
}: ClearScheduleFormValues): ResultsCacheClearCadence => {
    switch (frequency) {
        case 'daily':
            return { frequency, hours };
        case 'weekly':
            return { frequency, dayOfWeek, hours };
        default:
            return assertUnreachable(frequency, 'Unknown frequency');
    }
};

export const useClearScheduleForm = (
    clearSchedule: ResultsCacheClearSchedule | null,
) =>
    useForm<ClearScheduleFormValues>({
        initialValues: getInitialValues(clearSchedule),
    });

export const isClearScheduleValid = ({ hours }: ClearScheduleFormValues) =>
    hours.length > 0;

export const toClearScheduleUpdate = (
    values: ClearScheduleFormValues,
): UpdateResultsCacheClearSchedule => ({
    enabled: values.enabled,
    cron: resultsCacheClearCadenceToCron(toCadence(values)),
});
