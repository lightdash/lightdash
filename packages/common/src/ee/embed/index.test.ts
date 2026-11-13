import {
    canAddDashboardFiltersInEmbed,
    canEmbedViewerResolveTileParameters,
    EMBED_MAX_WRITE_SPACE_UUIDS,
    EmbedJwtSchema,
    FilterInteractivityValues,
    getEmbedDefaultWriteSpaceUuid,
    getEmbedExcludedParameterKeys,
    getEmbedParameterValues,
    getEmbedWriteSpaceUuids,
    isEmbedReadOnlyAiAgentToken,
    isParameterAllowedInEmbed,
    isParameterControlLockedInEmbed,
    isParameterInteractivityVisible,
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

describe('isEmbedReadOnlyAiAgentToken', () => {
    const aiAgent = { type: 'aiAgent' as const, agentUuid: 'agent-uuid' };
    const actor = { serviceAccountUserUuid: 'service-account-uuid' };

    it('is true for AI agent tokens with source spaces only', () => {
        expect(
            isEmbedReadOnlyAiAgentToken({
                content: aiAgent,
                writeActions: { ...actor, sourceSpaceUuids: ['space-a'] },
            }),
        ).toBe(true);
    });

    it('is false when the token has a write space', () => {
        expect(
            isEmbedReadOnlyAiAgentToken({
                content: aiAgent,
                writeActions: {
                    ...actor,
                    writeSpaceUuids: ['space-a'],
                    sourceSpaceUuids: ['space-b'],
                },
            }),
        ).toBe(false);
        expect(
            isEmbedReadOnlyAiAgentToken({
                content: aiAgent,
                writeActions: {
                    ...actor,
                    spaceUuid: 'space-a',
                    sourceSpaceUuids: ['space-b'],
                },
            }),
        ).toBe(false);
    });

    it('stays read-only when every source space is narrowed away', () => {
        expect(
            isEmbedReadOnlyAiAgentToken({
                content: aiAgent,
                writeActions: { ...actor, sourceSpaceUuids: [] },
            }),
        ).toBe(true);
    });

    it('is false without declared source spaces or write actions', () => {
        expect(
            isEmbedReadOnlyAiAgentToken({
                content: aiAgent,
                writeActions: actor,
            }),
        ).toBe(false);
        expect(isEmbedReadOnlyAiAgentToken({ content: aiAgent })).toBe(false);
    });

    it('is false for other content types', () => {
        expect(
            isEmbedReadOnlyAiAgentToken({
                content: { type: 'dashboard', dashboardUuid: 'dashboard-uuid' },
                writeActions: { ...actor, sourceSpaceUuids: ['space-a'] },
            }),
        ).toBe(false);
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

describe('embed parameter interactivity', () => {
    const jwtWithParameters = (parameterInteractivity: unknown) => ({
        ...baseJwt,
        content: { ...baseJwt.content, parameterInteractivity },
    });

    it('accepts allowed parameters, hidden and values in the token', () => {
        const result = EmbedJwtSchema.safeParse(
            jwtWithParameters({
                enabled: true,
                allowedParameters: ['region'],
                hidden: false,
                values: { region: 'EMEA', ids: [1, 2], from: '2026-01-01' },
            }),
        );
        expect(result.success).toBe(true);
    });

    it('accepts null allowed parameters from python clients', () => {
        const result = EmbedJwtSchema.safeParse(
            jwtWithParameters({ enabled: true, allowedParameters: null }),
        );
        expect(result.success).toBe(true);
    });

    it('treats null hidden and values like absent ones', () => {
        const options = {
            enabled: true,
            allowedParameters: null,
            hidden: null,
            values: null,
        };
        expect(
            EmbedJwtSchema.safeParse(jwtWithParameters(options)).success,
        ).toBe(true);
        expect(isParameterInteractivityVisible(options)).toBe(true);
        expect(getEmbedParameterValues(options, { region: 'EMEA' })).toEqual({
            region: 'EMEA',
        });
        expect(canEmbedViewerResolveTileParameters(options)).toBe(true);
    });

    it('rejects a value that is not a parameter value', () => {
        const result = EmbedJwtSchema.safeParse(
            jwtWithParameters({ enabled: true, values: { region: { a: 1 } } }),
        );
        expect(result.success).toBe(false);
    });

    it('lets the viewer change every parameter when none are listed', () => {
        expect(isParameterAllowedInEmbed({ enabled: true }, 'region')).toBe(
            true,
        );
        expect(
            isParameterAllowedInEmbed(
                { enabled: true, allowedParameters: null },
                'region',
            ),
        ).toBe(true);
    });

    it('lets the viewer change only the listed parameters', () => {
        const options = { enabled: true, allowedParameters: ['region'] };
        expect(isParameterAllowedInEmbed(options, 'region')).toBe(true);
        expect(isParameterAllowedInEmbed(options, 'currency')).toBe(false);
        expect(
            isParameterAllowedInEmbed(
                { enabled: true, allowedParameters: [] },
                'region',
            ),
        ).toBe(false);
    });

    it('lets the viewer change nothing while interactivity is off', () => {
        expect(isParameterAllowedInEmbed(undefined, 'region')).toBe(false);
        expect(
            isParameterAllowedInEmbed(
                { enabled: false, allowedParameters: ['region'] },
                'region',
            ),
        ).toBe(false);
    });

    it('runs with the token values, then the allowed viewer values', () => {
        expect(
            getEmbedParameterValues(
                {
                    enabled: true,
                    allowedParameters: ['region'],
                    values: { region: 'EMEA', currency: 'GBP' },
                },
                { region: 'APAC', currency: 'USD', other: 'x' },
            ),
        ).toEqual({ region: 'APAC', currency: 'GBP' });
    });

    it('applies the token values with interactivity off and drops viewer values', () => {
        expect(
            getEmbedParameterValues(
                { enabled: false, values: { region: 'EMEA' } },
                { region: 'APAC', currency: 'USD' },
            ),
        ).toEqual({ region: 'EMEA' });
        expect(getEmbedParameterValues(undefined, { region: 'APAC' })).toEqual(
            {},
        );
    });

    it('keeps every viewer value without a token list, as before', () => {
        expect(
            getEmbedParameterValues({ enabled: true }, { region: 'APAC' }),
        ).toEqual({ region: 'APAC' });
    });

    it('trusts the viewer tile resolution only when every parameter is theirs', () => {
        expect(canEmbedViewerResolveTileParameters({ enabled: true })).toBe(
            true,
        );
        expect(
            canEmbedViewerResolveTileParameters({
                enabled: true,
                allowedParameters: ['region'],
            }),
        ).toBe(false);
        expect(canEmbedViewerResolveTileParameters({ enabled: false })).toBe(
            false,
        );
        expect(
            getEmbedExcludedParameterKeys({ enabled: true }, ['region']),
        ).toEqual(['region']);
        expect(
            getEmbedExcludedParameterKeys(
                { enabled: true, allowedParameters: [] },
                ['region'],
            ),
        ).toBeUndefined();
    });

    it('keeps a viewer from a control that sets a parameter they may not change', () => {
        const options = { enabled: true, allowedParameters: ['region'] };
        expect(
            isParameterControlLockedInEmbed(options, {
                parameters: { region: 'all' },
            }),
        ).toBe(false);
        expect(
            isParameterControlLockedInEmbed(options, {
                parameters: { region: 'all', currency: 'all' },
            }),
        ).toBe(true);
    });

    it('shows the parameters unless hidden', () => {
        expect(isParameterInteractivityVisible({ enabled: true })).toBe(true);
        expect(
            isParameterInteractivityVisible({ enabled: true, hidden: true }),
        ).toBe(false);
        expect(isParameterInteractivityVisible({ enabled: false })).toBe(false);
    });
});
