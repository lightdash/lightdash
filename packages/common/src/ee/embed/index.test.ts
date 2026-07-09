import {
    canAddDashboardFiltersInEmbed,
    EmbedJwtSchema,
    FilterInteractivityValues,
    type DashboardFilterInteractivityOptions,
} from './index';

const baseJwt = {
    content: {
        type: 'dashboard' as const,
        dashboardUuid: 'dashboard-uuid',
    },
    exp: 1234567890,
};

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
