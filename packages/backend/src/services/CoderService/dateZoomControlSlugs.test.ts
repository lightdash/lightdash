import { type DateZoomControl } from '@lightdash/common';
import {
    dateZoomSlugs,
    getDateZoomConfigWithIds,
    getDateZoomConfigWithSlugs,
} from './dateZoomControlSlugs';

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

    it('keeps an explicit file uuid over a name or slug match', () => {
        const { controls } = getDateZoomConfigWithIds(
            {
                controls: [
                    {
                        uuid: 'explicit',
                        slug: 'week',
                        name: 'Week',
                        granularity: 'WEEK',
                    },
                ],
            },
            saved,
        );
        expect(controls[0].uuid).toBe('explicit');
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

    it('gives a renamed uuid-less control a new uuid, as parameters: its slug follows the old name', () => {
        const { controls } = getDateZoomConfigWithIds(
            {
                controls: [
                    { slug: 'week', name: 'Weekly', granularity: 'WEEK' },
                ],
            },
            saved,
        );
        expect(controls[0].uuid).not.toMatch(/^(week|month)-uuid$/);
    });

    it('keeps the same uuids on every upload of the same uuid-less file, slugs swapped across names', () => {
        const file = {
            controls: [
                { slug: 'week', name: 'Month', granularity: 'MONTH' },
                { slug: 'month', name: 'Week', granularity: 'WEEK' },
            ],
        };
        const first = getDateZoomConfigWithIds(file, saved).controls;
        const second = getDateZoomConfigWithIds(file, first).controls;
        expect(first.map(({ uuid }) => uuid)).toEqual([
            'month-uuid',
            'week-uuid',
        ]);
        expect(second).toEqual(first);
    });

    it('matches same-named controls by the slugs a download derives', () => {
        const twins: DateZoomControl[] = [
            { uuid: 'first-uuid', name: 'Zoom', granularity: 'WEEK' },
            { uuid: 'second-uuid', name: 'Zoom', granularity: 'MONTH' },
        ];
        const [first, second] = dateZoomSlugs(twins);
        const { controls } = getDateZoomConfigWithIds(
            {
                controls: [
                    { slug: second, name: 'Zoom', granularity: 'MONTH' },
                    { slug: first, name: 'Zoom', granularity: 'WEEK' },
                ],
            },
            twins,
        );
        expect(controls.map(({ uuid }) => uuid)).toEqual([
            'second-uuid',
            'first-uuid',
        ]);
    });

    it('keeps same-named controls on their uuids on the first and second upload of a downloaded file', () => {
        const twins: DateZoomControl[] = [
            { uuid: 'first-uuid', name: 'Zoom', granularity: 'WEEK' },
            { uuid: 'second-uuid', name: 'Zoom', granularity: 'MONTH' },
        ];
        const [first, second] = dateZoomSlugs(twins);
        // As a download writes it, without the uuids
        const file = {
            controls: [
                { slug: first, name: 'Zoom', granularity: 'WEEK' },
                { slug: second, name: 'Zoom', granularity: 'MONTH' },
            ],
        };
        const once = getDateZoomConfigWithIds(file, twins).controls;
        const twice = getDateZoomConfigWithIds(file, once).controls;
        expect(once.map(({ uuid }) => uuid)).toEqual([
            'first-uuid',
            'second-uuid',
        ]);
        expect(twice).toEqual(once);
    });

    it('never takes by slug a saved uuid another control in the file keeps', () => {
        const { controls } = getDateZoomConfigWithIds(
            {
                controls: [
                    { uuid: 'week-uuid', name: 'Renamed', granularity: 'WEEK' },
                    { slug: 'week', name: 'Week', granularity: 'WEEK' },
                ],
            },
            saved,
        );
        expect(controls[1].uuid).not.toMatch(/^(week|month)-uuid$/);
    });

    it('accepts a config without controls or tile targets', () => {
        expect(getDateZoomConfigWithIds({}, saved)).toEqual({
            controls: [],
            tileTargets: {},
        });
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

describe('getDateZoomConfigWithSlugs', () => {
    it('writes the derived slug over a stored one', () => {
        const stored = { ...saved[0], slug: 'stale' };
        expect(
            getDateZoomConfigWithSlugs({ controls: [stored], tileTargets: {} })
                .controls,
        ).toEqual([{ ...saved[0], slug: 'week' }]);
    });

    it('accepts a stored config without controls or tile targets', () => {
        expect(getDateZoomConfigWithSlugs({})).toEqual({
            controls: [],
            tileTargets: {},
        });
    });
});
