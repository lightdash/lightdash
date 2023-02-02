import moment from 'moment';
import { isWeekDay, WeekDay } from './timeFrames';

// from 0 (Monday) to 6 (Sunday) to 0 (Sunday) to 6 (Saturday)
export const convertWeekDayToMomentWeekDay = (weekDay: WeekDay) => {
    const converted = weekDay + 1;
    return converted <= 6 ? converted : 0;
};

export const getMomentDateWithCustomStartOfWeek = (
    startOfWeek: WeekDay | null | undefined,
    inp?: moment.MomentInput,
) => {
    if (isWeekDay(startOfWeek)) {
        const localeName = `lightdash-start-of-week-${startOfWeek}`;
        if (!moment.locales().includes(localeName)) {
            moment.locale(localeName, {
                week: {
                    dow: convertWeekDayToMomentWeekDay(startOfWeek),
                },
            });
        }
        return moment(inp).locale(localeName);
    }
    return moment(inp);
};
