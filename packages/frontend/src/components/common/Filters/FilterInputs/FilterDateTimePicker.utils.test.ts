import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { describe, expect, it } from 'vitest';
import {
    shiftToProjectTimezone,
    unshiftFromProjectTimezone,
} from './FilterDateTimePicker.utils';

dayjs.extend(utc);
dayjs.extend(timezone);

const WALL_CLOCK = 'YYYY-MM-DDTHH:mm:ss';

describe('FilterDateTimePicker timezone shift', () => {
    it("shifts so the shifted Date's browser-local wall clock matches the project-TZ wall clock of the input", () => {
        // 2024-06-15T10:30:00Z — outside DST transitions in both browser TZs and tested project TZs
        const value = new Date(Date.UTC(2024, 5, 15, 10, 30, 0));
        const projectTimezone = 'America/New_York';

        const shifted = shiftToProjectTimezone(value, projectTimezone);

        expect(dayjs(shifted).format(WALL_CLOCK)).toBe(
            dayjs(value).tz(projectTimezone).format(WALL_CLOCK),
        );
    });

    it.each([
        ['America/New_York', new Date(Date.UTC(2024, 5, 15, 10, 30, 0))],
        ['Europe/Helsinki', new Date(Date.UTC(2024, 5, 15, 22, 0, 0))],
        ['Asia/Tokyo', new Date(Date.UTC(2024, 5, 15, 23, 30, 0))],
        ['Pacific/Auckland', new Date(Date.UTC(2024, 5, 15, 0, 15, 0))],
        ['UTC', new Date(Date.UTC(2024, 5, 15, 12, 0, 0))],
    ])(
        'round-trips unshift(shift(value)) === value for %s',
        (projectTimezone, value) => {
            const shifted = shiftToProjectTimezone(value, projectTimezone);
            const restored = unshiftFromProjectTimezone(
                shifted,
                projectTimezone,
            );
            expect(restored.toISOString()).toBe(value.toISOString());
        },
    );
});
