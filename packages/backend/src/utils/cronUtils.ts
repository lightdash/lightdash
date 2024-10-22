import { arrayToString, stringToArray } from 'cron-converter';

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
    fields.minute = fields.minute.map((min) => {
        let newMinute = min + offsetMinutes;
        if (newMinute >= 60) {
            newMinute %= 60;
        } else if (newMinute < 0) {
            newMinute = ((newMinute % 60) + 60) % 60;
        }
        return newMinute;
    });

    const hourOffset = offsetMinutes / 60;
    let dayOverflow = 0; // Track day overflow for week adjustment

    // Adjust hours and handle overflow into the next day
    fields.hour = fields.hour.map((hour) => {
        let newHour = hour + hourOffset;
        if (newHour >= 24) {
            dayOverflow += Math.floor(newHour / 24);
            newHour %= 24;
        } else if (newHour < 0) {
            dayOverflow += Math.floor(newHour / 24); // Correct negative hour overflow
            newHour = ((newHour % 24) + 24) % 24;
        }
        return newHour;
    });

    // Adjust day of the week based on hour overflow which crossed full day thresholds
    fields.dayOfWeek = fields.dayOfWeek.map((day) => {
        let newDay = (day + dayOverflow) % 7;
        if (newDay < 0) newDay += 7; // Handle negative wrap-around
        return newDay;
    });

    // Convert back to a string
    const newCronExpression = arrayToString([
        fields.minute,
        fields.hour,
        fields.dayOfMonth, // ! Overflows not handled
        fields.monthOfYear, // ! Overflows not handled
        fields.dayOfWeek,
    ]);

    return newCronExpression;
}
