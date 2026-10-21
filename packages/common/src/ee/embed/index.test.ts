import {
    canAddDashboardFiltersInEmbed,
    EMBED_MAX_WRITE_SPACE_UUIDS,
    EmbedJwtSchema,
    FilterInteractivityValues,
    getEmbedDefaultWriteSpaceUuid,
    getEmbedWriteSpaceUuids,
    type DashboardFilterInteractivityOptions,
} from './index';

const baseJwt = {
    content: {
        type: 'dashboard' as const,
        dashboardUuid: 'dashboard-uuid',
    },
    exp: 1234567890,
};

describe('embed permissions mode', () => {
    const writeActions = {
        userUuid: '00000000-0000-4000-8000-000000000001',
        spaceUuid: '00000000-0000-4000-8000-000000000002',
    };
    it.each([undefined, 'default', 'roles'] as const)(
        'accepts %s without changing the default',
        (permissionsMode) => {
            const result = EmbedJwtSchema.parse({
                ...baseJwt,
                writeActions: { ...writeActions, permissionsMode },
            });
            expect(result.writeActions?.permissionsMode).toBe(permissionsMode);
        },
    );
    it.each(['jwt', 'legacy', 'invalid', '', null, true])(
        'rejects unknown mode %s',
        (permissionsMode) => {
            expect(
                EmbedJwtSchema.safeParse({
                    ...baseJwt,
                    writeActions: { ...writeActions, permissionsMode },
                }).success,
            ).toBe(false);
        },
    );
});

describe('embed write spaces', () => {
    const actor = { userUuid: '00000000-0000-4000-8000-000000000001' };
    const spaceA = '00000000-0000-4000-8000-00000000000a';
    const spaceB = '00000000-0000-4000-8000-00000000000b';
    const parse = (writeActions: Record<string, unknown>) =>
        EmbedJwtSchema.safeParse({ ...baseJwt, writeActions });

    it('accepts the deprecated spaceUuid', () => {
        expect(parse({ ...actor, spaceUuid: spaceA }).success).toBe(true);
    });

    it('accepts writeSpaceUuids', () => {
        expect(
            parse({ ...actor, writeSpaceUuids: [spaceA, spaceB] }).success,
        ).toBe(true);
    });

    it.each([
        ['both fields', { spaceUuid: spaceA, writeSpaceUuids: [spaceB] }],
        ['an empty list', { writeSpaceUuids: [] }],
        ['duplicates', { writeSpaceUuids: [spaceA, spaceA] }],
        ['a non-uuid', { writeSpaceUuids: ['not-a-uuid'] }],
        [
            'too many spaces',
            {
                writeSpaceUuids: Array.from(
                    { length: EMBED_MAX_WRITE_SPACE_UUIDS + 1 },
                    (_, i) =>
                        `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
                ),
            },
        ],
    ])('rejects %s', (_label, spaces) => {
        expect(parse({ ...actor, ...spaces }).success).toBe(false);
    });

    it('resolves write spaces in token order with the first as default', () => {
        expect(
            getEmbedWriteSpaceUuids({ writeSpaceUuids: [spaceB, spaceA] }),
        ).toEqual([spaceB, spaceA]);
        expect(
            getEmbedDefaultWriteSpaceUuid({
                writeSpaceUuids: [spaceB, spaceA],
            }),
        ).toBe(spaceB);
        expect(getEmbedWriteSpaceUuids({ spaceUuid: spaceA })).toEqual([
            spaceA,
        ]);
        expect(getEmbedWriteSpaceUuids({})).toEqual([]);
        expect(getEmbedWriteSpaceUuids(undefined)).toEqual([]);
    });
});

describe('EmbedJwtSchema canAddFilters', () => {
    it('accepts a dashboard JWT with canAddFilters set', () => {
        const result = EmbedJwtSchema.parse({
            ...baseJwt,
            content: {
                ...baseJwt.content,
                dashboardFiltersInteractivity: {
                    enabled: FilterInteractivityValues.all,
                    canAddFilters: true,
                },
            },
        });

        expect(
            result.content.type === 'dashboard' &&
                'dashboardFiltersInteractivity' in result.content &&
                result.content.dashboardFiltersInteractivity?.canAddFilters,
        ).toBe(true);
    });

    it('accepts a dashboard JWT that omits canAddFilters', () => {
        const result = EmbedJwtSchema.parse({
            ...baseJwt,
            content: {
                ...baseJwt.content,
                dashboardFiltersInteractivity: {
                    enabled: FilterInteractivityValues.all,
                },
            },
        });

        expect(
            result.content.type === 'dashboard' &&
                'dashboardFiltersInteractivity' in result.content &&
                result.content.dashboardFiltersInteractivity?.canAddFilters,
        ).toBeUndefined();
    });
});

describe('canAddDashboardFiltersInEmbed', () => {
    const cases: Array<{
        name: string;
        options: DashboardFilterInteractivityOptions | undefined;
        expected: boolean;
    }> = [
        {
            name: 'undefined options',
            options: undefined,
            expected: false,
        },
        {
            name: 'none, flag on',
            options: {
                enabled: FilterInteractivityValues.none,
                canAddFilters: true,
            },
            expected: false,
        },
        {
            name: 'none, flag off',
            options: {
                enabled: FilterInteractivityValues.none,
                canAddFilters: false,
            },
            expected: false,
        },
        {
            name: 'none, flag undefined',
            options: { enabled: FilterInteractivityValues.none },
            expected: false,
        },
        {
            name: 'some with empty allowedFilters, flag on',
            options: {
                enabled: FilterInteractivityValues.some,
                allowedFilters: [],
                canAddFilters: true,
            },
            expected: false,
        },
        {
            name: 'some with empty allowedFilters, flag off',
            options: {
                enabled: FilterInteractivityValues.some,
                allowedFilters: [],
                canAddFilters: false,
            },
            expected: false,
        },
        {
            name: 'some with allowedFilters, flag on',
            options: {
                enabled: FilterInteractivityValues.some,
                allowedFilters: ['filter-1'],
                canAddFilters: true,
            },
            expected: true,
        },
        {
            name: 'some with allowedFilters, flag off',
            options: {
                enabled: FilterInteractivityValues.some,
                allowedFilters: ['filter-1'],
                canAddFilters: false,
            },
            expected: false,
        },
        {
            name: 'some with allowedFilters, flag undefined',
            options: {
                enabled: FilterInteractivityValues.some,
                allowedFilters: ['filter-1'],
            },
            expected: false,
        },
        {
            name: 'all, flag on',
            options: {
                enabled: FilterInteractivityValues.all,
                canAddFilters: true,
            },
            expected: true,
        },
        {
            name: 'all, flag off',
            options: {
                enabled: FilterInteractivityValues.all,
                canAddFilters: false,
            },
            expected: false,
        },
        {
            name: 'all, flag undefined',
            options: { enabled: FilterInteractivityValues.all },
            expected: false,
        },
    ];

    it.each(cases)('$name -> $expected', ({ options, expected }) => {
        expect(canAddDashboardFiltersInEmbed(options)).toBe(expected);
    });
});
