import {
    FilterOperator,
    type DashboardAsCode,
    type DashboardConfig,
} from '@lightdash/common';
import { validate, version } from 'uuid';
import {
    getDashboardWithSectionIds,
    getDashboardWithSectionSlugs,
} from './sectionSlugs';

const dashboard = (): DashboardAsCode => ({
    name: 'Currency comparison',
    slug: 'currency-comparison',
    spaceSlug: 'jaffle-shop',
    version: 1,
    tiles: [],
    tabs: [],
    config: {
        isDateZoomDisabled: false,
        controlSections: [
            {
                id: 'old-id',
                name: 'Currency comparison',
                collapsed: true,
                inline: true,
            },
        ],
        parameterSections: { currency: 'old-id' },
        parameterControls: [
            {
                slug: 'currency',
                label: 'Currency',
                value: 'USD',
                valueType: { type: 'string', multiple: false },
                sectionId: 'old-id',
                parameters: { currency: 'all' },
            },
        ],
        dateZoomConfig: {
            controls: [
                {
                    uuid: 'date',
                    name: 'Date',
                    granularity: 'Month',
                    sectionId: 'old-id',
                },
            ],
            tileTargets: {},
        },
    },
    filters: {
        dimensions: [
            {
                target: { fieldId: 'orders_status', tableName: 'orders' },
                operator: FilterOperator.EQUALS,
                label: 'Example',
                values: [],
                sectionId: 'old-id',
            },
        ],
        metrics: [
            {
                id: 'metric',
                target: { fieldId: 'orders_total', tableName: 'orders' },
                operator: FilterOperator.EQUALS,
                label: 'Example',
                values: [],
                sectionId: 'old-id',
            },
        ],
        tableCalculations: [
            {
                id: 'calc',
                target: { fieldId: 'calculation', tableName: 'orders' },
                operator: FilterOperator.EQUALS,
                label: 'Example',
                values: [],
                sectionId: 'old-id',
            },
        ],
    },
});

describe('dashboard section slugs', () => {
    it('downloads readable slugs and converts every section reference', () => {
        const portable = getDashboardWithSectionSlugs(dashboard());
        expect(portable.config?.controlSections).toEqual([
            {
                slug: 'currency-comparison',
                name: 'Currency comparison',
                collapsed: true,
                inline: true,
            },
        ]);
        for (const rules of Object.values(portable.filters ?? {})) {
            expect(rules?.[0]).toMatchObject({
                sectionSlug: 'currency-comparison',
            });
            expect(rules?.[0].sectionId).toBeUndefined();
        }
        expect(portable.config?.parameterControls?.[0]).toMatchObject({
            sectionSlug: 'currency-comparison',
        });
        expect(portable.config?.dateZoomConfig?.controls[0]).toMatchObject({
            sectionSlug: 'currency-comparison',
        });
        expect(portable.config?.parameterSectionSlugs).toEqual({
            currency: 'currency-comparison',
        });
        expect(portable.config?.parameterSections).toBeUndefined();
    });

    it('restores existing identity and preserves slugs through renames and reuploads', () => {
        const original = dashboard();
        const portable = getDashboardWithSectionSlugs(original);
        portable.config!.controlSections![0].name = 'Renamed';
        const restored = getDashboardWithSectionIds(
            portable,
            original.config as DashboardConfig,
        );
        expect(restored.config?.controlSections?.[0]).toMatchObject({
            id: 'old-id',
            slug: 'currency-comparison',
            name: 'Renamed',
        });
        expect(restored.filters?.dimensions?.[0].sectionId).toBe('old-id');
        expect(restored.config?.parameterControls?.[0].sectionId).toBe(
            'old-id',
        );
        expect(restored.config?.dateZoomConfig?.controls[0].sectionId).toBe(
            'old-id',
        );
        expect(restored.config?.parameterSections).toEqual({
            currency: 'old-id',
        });
        expect(getDashboardWithSectionSlugs(restored)).toEqual(portable);
    });

    it('round-trips legacy uploads and retains the saved slug when a legacy client renames a section', () => {
        const original = dashboard();
        const saved = getDashboardWithSectionIds(
            getDashboardWithSectionSlugs(original),
            original.config as DashboardConfig,
        );
        const legacy = dashboard();
        legacy.config!.controlSections![0].name = 'Legacy rename';
        const restored = getDashboardWithSectionIds(legacy, {
            isDateZoomDisabled: false,
            controlSections: saved.config!.controlSections,
        });
        expect(restored.config!.controlSections![0]).toMatchObject({
            id: 'old-id',
            slug: 'currency-comparison',
            name: 'Legacy rename',
        });
        expect(restored.filters).toEqual(legacy.filters);
        expect(restored.config!.parameterSections).toEqual(
            legacy.config!.parameterSections,
        );
    });

    it('resolves portable references against target identities rather than source identities', () => {
        const portable = getDashboardWithSectionSlugs(dashboard());
        const target = {
            isDateZoomDisabled: false,
            controlSections: [{ id: 'target-id', name: 'Currency comparison' }],
        };
        const restored = getDashboardWithSectionIds(portable, target);
        expect(restored.config!.controlSections![0].id).toBe('target-id');
        for (const rules of Object.values(restored.filters!)) {
            expect(rules![0].sectionId).toBe('target-id');
            expect(rules![0].sectionSlug).toBeUndefined();
        }
        expect(restored.config!.dateZoomConfig!.controls[0].sectionId).toBe(
            'target-id',
        );
        expect(restored.config!.parameterControls![0].sectionId).toBe(
            'target-id',
        );
        expect(restored.config!.parameterSections).toEqual({
            currency: 'target-id',
        });
        expect(getDashboardWithSectionSlugs(restored)).toEqual(portable);
    });

    it.each(['constructor', '__proto__'])(
        'round-trips a section assignment for parameter %s',
        (key) => {
            const original = dashboard();
            original.config!.parameterSections = Object.fromEntries([
                [key, 'old-id'],
            ]);
            const restored = getDashboardWithSectionIds(
                getDashboardWithSectionSlugs(original),
                original.config as DashboardConfig,
            );
            expect(restored.config!.parameterSections).toEqual(
                Object.fromEntries([[key, 'old-id']]),
            );
        },
    );

    it('mints UUID v4 identities for new sections and accepts legacy IDs', () => {
        const fresh = getDashboardWithSectionIds(
            getDashboardWithSectionSlugs(dashboard()),
            undefined,
        );
        const { id } = fresh.config!.controlSections![0];
        expect(validate(id)).toBe(true);
        expect(version(id)).toBe(4);
        expect(fresh.filters?.dimensions?.[0].sectionId).toBe(id);
        expect(
            getDashboardWithSectionIds(dashboard(), undefined).config
                ?.controlSections?.[0].id,
        ).toBe('old-id');
    });

    it('allocates unique slugs without taking a saved slug', () => {
        const input = dashboard();
        input.config!.controlSections = [
            { id: 'a', name: 'Currency' },
            { id: 'b', name: 'Currency' },
            { id: 'c', name: 'Currency 1' },
            { id: 'd', slug: 'currency-2', name: 'Other' },
        ];
        expect(
            getDashboardWithSectionSlugs(input).config?.controlSections?.map(
                (s) => s.slug,
            ),
        ).toEqual(['currency-3', 'currency-4', 'currency-1', 'currency-2']);
    });

    it('uses stable fallback slugs for empty or non-alphanumeric names', () => {
        const input = dashboard();
        input.config!.controlSections = [
            { id: 'empty', name: '' },
            { id: 'symbols', name: '💱' },
        ];
        const portable = getDashboardWithSectionSlugs(input);
        expect(
            portable.config?.controlSections?.map(({ slug }) => slug),
        ).toEqual(['section-1', 'section-2']);
        expect(
            getDashboardWithSectionIds(
                portable,
                input.config as DashboardConfig,
            ).config?.controlSections?.map(({ id }) => id),
        ).toEqual(['empty', 'symbols']);
    });

    it('rejects duplicate slugs, duplicate IDs, invalid slugs, and unknown references', () => {
        const portable = getDashboardWithSectionSlugs(dashboard());
        const section = portable.config!.controlSections![0];
        expect(() =>
            getDashboardWithSectionIds(
                {
                    ...portable,
                    config: {
                        ...portable.config!,
                        controlSections: [section, section],
                    },
                },
                undefined,
            ),
        ).toThrow(/duplicated/);
        expect(() =>
            getDashboardWithSectionIds(
                {
                    ...portable,
                    config: {
                        ...portable.config!,
                        controlSections: [{ ...section, slug: 'BAD' }],
                    },
                },
                undefined,
            ),
        ).toThrow(/Invalid.*slug/);
        const legacy = dashboard();
        legacy.config!.controlSections!.push({ id: 'old-id', name: 'Other' });
        expect(() => getDashboardWithSectionIds(legacy, undefined)).toThrow(
            /duplicated/,
        );
        portable.config!.parameterControls![0].sectionSlug = 'unknown';
        expect(() => getDashboardWithSectionIds(portable, undefined)).toThrow(
            /Unknown.*section/,
        );
    });

    it('rejects conflicting legacy and portable references', () => {
        const portable = getDashboardWithSectionSlugs(dashboard());
        portable.config!.controlSections!.push({
            id: 'other-id',
            slug: 'other',
            name: 'Other',
        });
        portable.config!.parameterControls![0].sectionId = 'other-id';
        expect(() => getDashboardWithSectionIds(portable, undefined)).toThrow(
            /conflict/i,
        );
    });

    it('leaves dashboards without sections unchanged and drops dangling legacy references on download', () => {
        const plain: DashboardAsCode = {
            name: 'Empty',
            slug: 'empty',
            spaceSlug: 'space',
            version: 1,
            tiles: [],
            tabs: [],
        };
        expect(getDashboardWithSectionSlugs(plain)).toEqual(plain);
        expect(getDashboardWithSectionIds(plain, undefined)).toEqual(plain);
        const input = dashboard();
        input.config!.parameterControls![0].sectionId = 'deleted';
        expect(
            getDashboardWithSectionSlugs(input).config?.parameterControls?.[0]
                .sectionSlug,
        ).toBeUndefined();
    });
});
