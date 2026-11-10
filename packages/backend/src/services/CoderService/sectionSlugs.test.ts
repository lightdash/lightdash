import {
    FilterOperator,
    type DashboardAsCode,
    type DashboardConfig,
    type DashboardControlSection,
} from '@lightdash/common';
import { validate, version } from 'uuid';
import {
    getDashboardWithSectionIds,
    getDashboardWithSectionSlugs,
    type DashboardWithSectionIds,
} from './sectionSlugs';

// As stored: `inline` and `parameterSections` are earlier keys nothing reads
const dashboard = (): DashboardWithSectionIds => ({
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
            } as DashboardControlSection,
        ],
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

const savedConfig = (input: DashboardWithSectionIds) =>
    input.config as DashboardConfig;

// Every key a file never holds, wherever it sits
const removedKeys = (file: DashboardAsCode) => {
    const json = JSON.stringify(file);
    return ['"sectionId"', '"inline"', '"parameterSections"', '"id":"old-id"']
        .filter((key) => json.includes(key))
        .sort();
};

describe('dashboard section slugs', () => {
    it('downloads readable slugs and converts every section reference', () => {
        const portable = getDashboardWithSectionSlugs(dashboard());
        expect(portable.config?.controlSections).toEqual([
            {
                slug: 'currency-comparison',
                name: 'Currency comparison',
                collapsed: true,
            },
        ]);
        for (const rules of Object.values(portable.filters ?? {})) {
            expect(rules?.[0]).toMatchObject({
                sectionSlug: 'currency-comparison',
            });
        }
        expect(portable.config?.parameterControls?.[0]).toMatchObject({
            sectionSlug: 'currency-comparison',
        });
        expect(portable.config?.dateZoomConfig?.controls[0]).toMatchObject({
            sectionSlug: 'currency-comparison',
        });
        expect(removedKeys(portable)).toEqual([]);
    });

    it('restores the id of a uniquely named section through reuploads and stores no slug', () => {
        const original = dashboard();
        const portable = getDashboardWithSectionSlugs(original);
        const restored = getDashboardWithSectionIds(
            portable,
            savedConfig(original),
            true,
        );
        expect(restored.config?.controlSections?.[0]).toEqual({
            id: 'old-id',
            name: 'Currency comparison',
            collapsed: true,
        });
        expect(restored.filters?.dimensions?.[0].sectionId).toBe('old-id');
        expect(restored.config?.parameterControls?.[0].sectionId).toBe(
            'old-id',
        );
        expect(restored.config?.dateZoomConfig?.controls[0].sectionId).toBe(
            'old-id',
        );
        expect(getDashboardWithSectionSlugs(restored)).toEqual(portable);
    });

    it('derives the slug of a section written without one from its name', () => {
        const portable = getDashboardWithSectionSlugs(dashboard());
        const { slug: _slug, ...section } =
            portable.config!.controlSections![0];
        const restored = getDashboardWithSectionIds(
            {
                ...portable,
                config: { ...portable.config!, controlSections: [section] },
            },
            savedConfig(dashboard()),
            true,
        );
        expect(restored.config!.controlSections![0].id).toBe('old-id');
        expect(restored.filters?.dimensions?.[0].sectionId).toBe('old-id');
    });

    it('mints a new id for a section renamed in the file, even when it keeps the old slug', () => {
        const original = dashboard();
        const portable = getDashboardWithSectionSlugs(original);
        portable.config!.controlSections![0].name = 'Renamed';
        const restored = getDashboardWithSectionIds(
            portable,
            savedConfig(original),
            true,
        );
        const { id } = restored.config!.controlSections![0];
        expect(id).not.toBe('old-id');
        expect(restored.filters?.dimensions?.[0].sectionId).toBe(id);
        expect(
            getDashboardWithSectionSlugs(restored).config?.controlSections?.[0]
                .slug,
        ).toBe('renamed');
    });

    it('mints new ids for two sections with the same name', () => {
        const original = dashboard();
        original.config!.controlSections = [
            { id: 'a', name: 'Currency' },
            { id: 'b', name: 'Currency' },
        ];
        const ids = getDashboardWithSectionIds(
            getDashboardWithSectionSlugs(original),
            savedConfig(original),
            true,
        ).config!.controlSections!.map(({ id }) => id);
        expect(ids).not.toContain('a');
        expect(ids).not.toContain('b');
        expect(new Set(ids).size).toBe(2);
    });

    it('mints new ids when the upload duplicates a section name that is unique in the saved sections', () => {
        const uploaded = dashboard();
        uploaded.config!.controlSections = [
            { id: 'x', name: 'Currency' },
            { id: 'y', name: 'Currency' },
        ];
        const ids = getDashboardWithSectionIds(
            getDashboardWithSectionSlugs(uploaded),
            {
                isDateZoomDisabled: false,
                controlSections: [{ id: 'a', name: 'Currency' }],
            },
            true,
        ).config!.controlSections!.map(({ id }) => id);
        expect(ids).not.toContain('a');
        expect(new Set(ids).size).toBe(2);
    });

    it('mints a new id when the saved sections duplicate a name that is unique in the upload', () => {
        const uploaded = dashboard();
        uploaded.config!.controlSections = [{ id: 'x', name: 'Currency' }];
        const [section] = getDashboardWithSectionIds(
            getDashboardWithSectionSlugs(uploaded),
            {
                isDateZoomDisabled: false,
                controlSections: [
                    { id: 'a', name: 'Currency' },
                    { id: 'b', name: 'Currency' },
                ],
            },
            true,
        ).config!.controlSections!;
        expect(section.id).not.toMatch(/^[ab]$/);
    });

    it('resolves portable references against target identities rather than source identities', () => {
        const portable = getDashboardWithSectionSlugs(dashboard());
        const target = {
            isDateZoomDisabled: false,
            controlSections: [{ id: 'target-id', name: 'Currency comparison' }],
        };
        const restored = getDashboardWithSectionIds(portable, target, true);
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
        expect(getDashboardWithSectionSlugs(restored)).toEqual(portable);
    });

    it('mints UUID v4 identities for new sections', () => {
        const fresh = getDashboardWithSectionIds(
            getDashboardWithSectionSlugs(dashboard()),
            undefined,
            true,
        );
        const { id } = fresh.config!.controlSections![0];
        expect(validate(id)).toBe(true);
        expect(version(id)).toBe(4);
        expect(fresh.filters?.dimensions?.[0].sectionId).toBe(id);
    });

    it('derives unique slugs and ignores a stored slug', () => {
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
        ).toEqual(['currency-2', 'currency-3', 'currency-1', 'other']);
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
        // Both fall back to one base, so neither keeps its id
        const ids = getDashboardWithSectionIds(
            portable,
            savedConfig(input),
            true,
        ).config!.controlSections!.map(({ id }) => id);
        expect(ids).not.toContain('empty');
        expect(ids).not.toContain('symbols');
        expect(new Set(ids).size).toBe(2);
    });

    it('rejects duplicate slugs, invalid slugs, and unknown references', () => {
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
                true,
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
                true,
            ),
        ).toThrow(/Invalid.*slug/);
        portable.config!.parameterControls![0].sectionSlug = 'unknown';
        expect(() =>
            getDashboardWithSectionIds(portable, undefined, true),
        ).toThrow(/Unknown.*section/);
    });

    it('leaves dashboards without sections unchanged and drops dangling references on download', () => {
        const plain: DashboardWithSectionIds = {
            name: 'Empty',
            slug: 'empty',
            spaceSlug: 'space',
            version: 1,
            tiles: [],
            tabs: [],
        };
        expect(getDashboardWithSectionSlugs(plain)).toEqual(plain);
        expect(getDashboardWithSectionIds(plain, undefined, true)).toEqual(
            plain,
        );
        const input = dashboard();
        input.config!.parameterControls![0].sectionId = 'deleted';
        const portable = getDashboardWithSectionSlugs(input);
        expect(portable.config?.parameterControls?.[0]).not.toHaveProperty(
            'sectionSlug',
        );
        expect(portable.config?.parameterControls?.[0]).not.toHaveProperty(
            'sectionId',
        );
        const { controlSections: _sections, ...withoutSections } =
            input.config!;
        expect(
            removedKeys(
                getDashboardWithSectionSlugs({
                    ...input,
                    config: withoutSections,
                }),
            ),
        ).toEqual([]);
    });

    describe('with the flag off', () => {
        it('keeps section membership through a download and upload', () => {
            const original = dashboard();
            const file = getDashboardWithSectionSlugs(original);
            expect(removedKeys(file)).toEqual([]);
            const restored = getDashboardWithSectionIds(
                file,
                savedConfig(original),
                false,
            );
            expect(restored.filters?.dimensions?.[0].sectionId).toBe(
                restored.config?.controlSections?.[0].id,
            );
        });

        it('matches saved sections by stored slug and persists the slug through a rename', () => {
            const original = dashboard();
            const portable = getDashboardWithSectionSlugs(original);
            portable.config!.controlSections![0].name = 'Renamed';
            const restored = getDashboardWithSectionIds(
                portable,
                savedConfig(original),
                false,
            );
            expect(restored.config?.controlSections?.[0]).toEqual({
                id: 'old-id',
                slug: 'currency-comparison',
                name: 'Renamed',
                collapsed: true,
            });
            expect(restored.filters?.dimensions?.[0].sectionId).toBe('old-id');
        });

        it('matches a saved section by its stored slug, not its name', () => {
            const portable = getDashboardWithSectionSlugs(dashboard());
            const [section] = getDashboardWithSectionIds(
                portable,
                {
                    isDateZoomDisabled: false,
                    controlSections: [
                        { id: 'by-name', name: 'Currency comparison' },
                        {
                            id: 'by-slug',
                            name: 'Old name',
                            slug: 'currency-comparison',
                        },
                    ],
                },
                false,
            ).config!.controlSections!;
            expect(section).toMatchObject({
                id: 'by-slug',
                slug: 'currency-comparison',
            });
        });
    });
});
