import moment from 'moment';
import { isWeekDay, type WeekDay } from './timeFrames';

// from 0 (Monday) to 6 (Sunday) to 0 (Sunday) to 6 (Saturday)
export const convertWeekDayToMomentWeekDay = (weekDay: WeekDay) => {
    const converted = weekDay + 1;
    return converted <= 6 ? converted : 0;
};

const createMomentLocaleForWeekStart = (name: string, startOfWeek: WeekDay) => {
    if (!moment.locales().includes(name)) {
        moment.locale(name, {
            week: {
                dow: convertWeekDayToMomentWeekDay(startOfWeek),
            },
        });
    }
};

export const getMomentDateWithCustomStartOfWeek = (
    startOfWeek: WeekDay | null | undefined,
    inp?: moment.MomentInput,
) => {
    if (isWeekDay(startOfWeek)) {
        const localeName = `lightdash-start-of-week-${startOfWeek}`;
        createMomentLocaleForWeekStart(localeName, startOfWeek);
        return moment(inp).locale(localeName);
    }
    return moment(inp);
};
