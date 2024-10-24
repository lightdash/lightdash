import { arrayToString, stringToArray } from 'cron-converter';

function getOffsetMinute(minute: number, offsetMinutes: number) {
    let newMinute = minute + offsetMinutes;
    if (newMinute >= 60) {
        newMinute %= 60;
    } else if (newMinute < 0) {
        newMinute = ((newMinute % 60) + 60) % 60;
    }
    return newMinute;
}

function getOffsetHour(hour: number, offsetMinutes: number) {
    const hourOffset = offsetMinutes / 60;
    let newHour = hour + hourOffset;
    let dayOverflow = 0;

    if (newHour >= 24) {
        dayOverflow += Math.floor(newHour / 24);
        newHour %= 24;
    } else if (newHour < 0) {
        dayOverflow += Math.floor(newHour / 24); // Correct negative hour overflow
        newHour = ((newHour % 24) + 24) % 24;
    }

    return {
        hour: newHour,
        dayOverflow,
    };
}

function getOffsetWeekDay(dayOfWeek: number, dayOverflow: number) {
    let newDay = (dayOfWeek + dayOverflow) % 7;
    if (newDay < 0) newDay += 7; // Handle negative wrap-around

    return newDay;
}

/**
 * Adjust a cron expression given the a minute offset, doesn't take into account dayOfMonth and monthOfYear overflows
 * @param cronExpression
 * @param offsetMinutes
 */
export function getAdjustedCronByOffset(
    cronExpression: string,
    offsetMinutes: number,
): string {
    const cronParts: number[][] = stringToArray(cronExpression);
    const fields = {
        minute: cronParts[0],
        hour: cronParts[1],
        dayOfMonth: cronParts[2],
        monthOfYear: cronParts[3],
        dayOfWeek: cronParts[4],
    };

    // Adjust minutes and handle overflow into hours
    // Only adjusting when it is one value since we only allow custom "Hourly" crons
    if (fields.minute.length === 1) {
        fields.minute[0] = getOffsetMinute(fields.minute[0], offsetMinutes);
    }

    let dayOverflow = 0;

    // Adjust hours and handle overflow into the next day
    // Only adjusting when it is one value because when it is range the result might yield incorrect, e.g. `30 21-22 * * *` UTC if converted to UTC+2 should result in 2 crons
    // 1 from 23:30 to 23:59 and then another from 00 to 00:30 but instead it results in `30 0-23 * * *` which is the oposite range
    if (fields.hour.length === 1) {
        const offsetHour = getOffsetHour(fields.hour[0], offsetMinutes);
        dayOverflow = offsetHour.dayOverflow;
        fields.hour[0] = offsetHour.hour;
    }

    if (fields.dayOfWeek.length === 1) {
        // Adjust day of the week based on hour overflow which crossed full day thresholds
        fields.dayOfWeek[0] = getOffsetWeekDay(
            fields.dayOfWeek[0],
            dayOverflow,
        );
    }

    return arrayToString([
        fields.minute,
        fields.hour,
        fields.dayOfMonth, // ! Not calculating overflows
        fields.monthOfYear, // ! Not calculating overflows
        fields.dayOfWeek,
    ]);
}
