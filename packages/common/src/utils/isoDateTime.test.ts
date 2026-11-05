import {
    isoDateTimeStringSchema,
    isoDateTimeWithOffsetStringSchema,
} from './isoDateTime';

describe('ISO datetime compatibility schemas', () => {
    it.each([
        '2025-01-01T06:15Z',
        '2025-01-01T06:15:00Z',
        '2025-01-01T06:15:00.123Z',
    ])('accepts UTC datetimes with optional seconds: %s', (value) => {
        expect(isoDateTimeStringSchema.safeParse(value).success).toBe(true);
        expect(isoDateTimeWithOffsetStringSchema.safeParse(value).success).toBe(
            true,
        );
    });

    it.each(['2025-01-01T06:15+05:30', '2025-01-01T06:15:00-04:00'])(
        'accepts offsets when enabled: %s',
        (value) => {
            expect(
                isoDateTimeWithOffsetStringSchema.safeParse(value).success,
            ).toBe(true);
            expect(isoDateTimeStringSchema.safeParse(value).success).toBe(
                false,
            );
        },
    );

    it.each([
        '2025-01-01T06:15',
        '2025-01-01T06:15+24:00',
        '2025-02-30T06:15Z',
    ])('rejects invalid qualified datetimes: %s', (value) => {
        expect(isoDateTimeStringSchema.safeParse(value).success).toBe(false);
        expect(isoDateTimeWithOffsetStringSchema.safeParse(value).success).toBe(
            false,
        );
    });
});
