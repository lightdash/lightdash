import { type DateZoomControl } from '@lightdash/common';
import { getDateZoomConfigWithIds } from './dateZoomControlSlugs';

const saved: DateZoomControl[] = [
    { uuid: 'week-uuid', name: 'Week', granularity: 'WEEK' },
    { uuid: 'month-uuid', name: 'Month', granularity: 'MONTH' },
];
const target = { fieldId: 'orders_date', tableName: 'orders' };

describe('getDateZoomConfigWithIds', () => {
    it('keeps a file uuid, matches a uuid-less control by name and mints the rest', () => {
        const { controls } = getDateZoomConfigWithIds(
            {
                controls: [
                    { uuid: 'kept', name: 'Month', granularity: 'MONTH' },
                    { slug: 'weekly', name: 'Week', granularity: 'WEEK' },
                    { name: 'Quarter', granularity: 'QUARTER' },
                ],
                tileTargets: {},
            },
            saved,
        );
        expect(controls[0]).toEqual({
            uuid: 'kept',
            name: 'Month',
            granularity: 'MONTH',
        });
        expect(controls[1]).toEqual({
            uuid: 'week-uuid',
            name: 'Week',
            granularity: 'WEEK',
        });
        expect(controls[2].uuid).not.toMatch(/^(kept|week-uuid|month-uuid)$/);
    });

    it('never reuses a saved uuid another control in the file keeps', () => {
        const { controls } = getDateZoomConfigWithIds(
            {
                controls: [
                    { uuid: 'week-uuid', name: 'Renamed', granularity: 'WEEK' },
                    { name: 'Week', granularity: 'WEEK' },
                ],
                tileTargets: {},
            },
            saved,
        );
        expect(controls[1].uuid).not.toBe('week-uuid');
    });

    it('resolves targets by controlSlug, else keeps the controlUuid target as is', () => {
        const legacy = { controlUuid: 'dangling', ...target };
        const { controls, tileTargets } = getDateZoomConfigWithIds(
            {
                controls: [
                    { name: 'Week', granularity: 'WEEK' },
                    { slug: 'monthly', name: 'Month', granularity: 'MONTH' },
                ],
                tileTargets: {
                    a: { controlSlug: 'week', ...target },
                    b: { controlSlug: 'monthly', controlUuid: 'x', ...target },
                    c: legacy,
                },
            },
            saved,
        );
        expect(controls.map(({ uuid }) => uuid)).toEqual([
            'week-uuid',
            'month-uuid',
        ]);
        expect(tileTargets).toEqual({
            a: { controlUuid: 'week-uuid', ...target },
            b: { controlUuid: 'month-uuid', ...target },
            c: legacy,
        });
        expect(tileTargets.c).toBe(legacy);
    });

    it.each([
        [
            'an invalid slug',
            {
                controls: [
                    { slug: 'Week!', name: 'Week', granularity: 'WEEK' },
                ],
            },
            'Invalid date zoom control slug "Week!"',
        ],
        [
            'a duplicated slug',
            {
                controls: [
                    { slug: 'zoom', name: 'Week', granularity: 'WEEK' },
                    { slug: 'zoom', name: 'Month', granularity: 'MONTH' },
                ],
            },
            'Date zoom control slug "zoom" is duplicated',
        ],
        [
            'an unknown controlSlug',
            {
                controls: [{ name: 'Week', granularity: 'WEEK' }],
                tileTargets: { a: { controlSlug: 'month', ...target } },
            },
            'Unknown date zoom control slug "month" on tile "a". Valid date zoom control slugs are week',
        ],
        [
            'a target without a control',
            { controls: [], tileTargets: { a: target } },
            'The date zoom target of tile "a" needs a controlSlug. Valid date zoom control slugs are none',
        ],
    ])('rejects %s', (_case, config, message) => {
        expect(() =>
            getDateZoomConfigWithIds({ tileTargets: {}, ...config }, saved),
        ).toThrow(message);
    });
});
