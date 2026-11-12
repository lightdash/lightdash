import { type DateZoomControl } from '@lightdash/common';
import {
    getDateZoomConfigWithoutSlugs,
    getDateZoomConfigWithSlugs,
} from './dateZoomControlSlugs';

const saved: DateZoomControl[] = [
    { uuid: 'week-uuid', name: 'Week', granularity: 'WEEK' },
    { uuid: 'month-uuid', name: 'Month', granularity: 'MONTH' },
];
const target = { fieldId: 'orders_date', tableName: 'orders' };

describe('getDateZoomConfigWithoutSlugs', () => {
    it('keeps the file uuids and drops slugs, ignoring a controlSlug that disagrees', () => {
        expect(
            getDateZoomConfigWithoutSlugs(
                {
                    controls: [
                        { ...saved[0], slug: 'weekly' },
                        { ...saved[1], sectionSlug: 'calendar' },
                    ],
                    tileTargets: {
                        a: { controlUuid: 'week-uuid', ...target },
                        b: {
                            controlUuid: 'month-uuid',
                            controlSlug: 'weekly',
                            ...target,
                        },
                    },
                },
                true,
            ),
        ).toEqual({
            controls: [saved[0], { ...saved[1], sectionSlug: 'calendar' }],
            tileTargets: {
                a: { controlUuid: 'week-uuid', ...target },
                b: { controlUuid: 'month-uuid', ...target },
            },
        });
    });

    it('accepts a config without controls or tile targets', () => {
        expect(getDateZoomConfigWithoutSlugs({}, true)).toEqual({
            controls: [],
            tileTargets: {},
        });
    });

    it.each([
        [
            'an invalid slug',
            [{ ...saved[0], slug: 'Week!' }],
            'Invalid date zoom control slug "Week!"',
        ],
        [
            'a duplicated slug',
            [
                { ...saved[0], slug: 'zoom' },
                { ...saved[1], slug: 'zoom' },
            ],
            'Date zoom control slug "zoom" is duplicated',
        ],
    ])('rejects %s', (_case, controls, message) => {
        expect(() => getDateZoomConfigWithoutSlugs({ controls }, true)).toThrow(
            message,
        );
        // Unchecked when slugs resolve nothing: dropped, as a key the file never had
        expect(
            getDateZoomConfigWithoutSlugs({ controls }, false).controls,
        ).toEqual(controls.map(({ slug: _slug, ...control }) => control));
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
