import { getRemovedDashboardControlFieldMessages } from './removedDashboardControlFields';

describe('getRemovedDashboardControlFieldMessages', () => {
    it('returns nothing for a clean file', () => {
        expect(
            getRemovedDashboardControlFieldMessages({
                name: 'Sales',
                config: {
                    isDateZoomDisabled: false,
                    controlSections: [{ slug: 'region', name: 'Region' }],
                    parameterControls: [
                        {
                            slug: 'currency',
                            label: 'Currency',
                            sectionSlug: 'region',
                            parameters: { currency: 'all' },
                        },
                    ],
                    dateZoomConfig: {
                        controls: [{ uuid: 'd', name: 'Date' }],
                        tileTargets: {},
                    },
                },
                filters: {
                    dimensions: [{ label: 'Status', sectionSlug: 'region' }],
                    metrics: [],
                },
            }),
        ).toEqual([]);
    });

    it('names each removed key, where it is and its replacement', () => {
        expect(
            getRemovedDashboardControlFieldMessages({
                config: {
                    parameterSections: { currency: 's' },
                    parameterSectionSlugs: { currency: 'region' },
                    controlSections: [
                        { id: 's', name: 'Region', inline: true },
                        { slug: 'dates', id: 't', name: 'Dates' },
                    ],
                    parameterControls: [
                        {
                            id: 'p',
                            label: null,
                            sectionId: 's',
                            parameters: { currency: 'all' },
                        },
                    ],
                    dateZoomConfig: {
                        controls: [{ uuid: 'd', name: 'Date', sectionId: 's' }],
                    },
                },
                filters: {
                    dimensions: [
                        {
                            target: { fieldId: 'orders_status' },
                            sectionId: 's',
                        },
                    ],
                    metrics: [{ slug: 'total', sectionId: 's' }],
                    tableCalculations: [{ sectionId: 's' }],
                },
            }),
        ).toEqual([
            '`config.parameterSections` was removed: use `sectionSlug` on each parameter control',
            '`config.parameterSectionSlugs` was removed: use `sectionSlug` on each parameter control',
            '`id` on section "Region" was removed: use `slug`',
            '`inline` on section "Region" was removed: use `newLine` on its `controlOrder` entry',
            '`id` on section "dates" was removed: use `slug`',
            '`id` on parameter control "currency" was removed: use `slug`',
            '`sectionId` on parameter control "currency" was removed: use `sectionSlug`',
            '`sectionId` on dimension filter "orders_status" was removed: use `sectionSlug`',
            '`sectionId` on metric filter "total" was removed: use `sectionSlug`',
            '`sectionId` on table calculation filter 1 was removed: use `sectionSlug`',
            '`sectionId` on date zoom control "Date" was removed: use `sectionSlug`',
        ]);
    });

    it.each([
        null,
        'text',
        42,
        [],
        { config: 'x', filters: [] },
        { config: { controlSections: 'x', parameterControls: [null, 1] } },
        { config: { dateZoomConfig: { controls: {} } } },
        { filters: { dimensions: [null, 'x'], metrics: {} } },
    ])('does not throw on malformed input %j', (input) => {
        expect(getRemovedDashboardControlFieldMessages(input)).toEqual([]);
    });
});
