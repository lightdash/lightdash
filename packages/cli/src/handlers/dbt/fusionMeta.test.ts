import { type Explore } from '@lightdash/common';
import { lightdashApi } from './apiClient';
import {
    getDroppedFieldIds,
    getFusionEmptyMeta,
    getFusionMetaWarning,
    getFusionMetaWarnings,
    isDbt1060MetaError,
    type FusionEmptyMetaModel,
} from './fusionMeta';

vi.mock('./apiClient', () => ({ lightdashApi: vi.fn() }));

const FUSION_LOG_LINE =
    '[error] [UnusedConfigKey (dbt1060)]: While parsing config: Ignored unexpected key `"meta"`. YAML path: `columns[1].meta`.';

describe('isDbt1060MetaError', () => {
    it('matches the Fusion unexpected meta key error', () => {
        expect(isDbt1060MetaError(`dbt failed\n${FUSION_LOG_LINE}`)).toBe(true);
    });

    it('does not match other dbt errors', () => {
        expect(
            isDbt1060MetaError(
                "Compilation Error in model m: Model 'model.repro.m' depends on a node named 'x' which was not found",
            ),
        ).toBe(false);
        expect(
            isDbt1060MetaError(
                '[error] [UnusedConfigKey (dbt1060)]: While parsing config: Ignored unexpected key `"tests"`.',
            ),
        ).toBe(false);
    });
});

// Shapes from a real deploy: dbt core keeps column meta, Fusion drops it.
const dimension = (
    name: string,
    base?: string,
    isAdditionalDimension?: boolean,
) => ({
    name,
    table: 'm',
    ...(base ? { timeIntervalBaseDimensionName: base } : {}),
    ...(isAdditionalDimension ? { isAdditionalDimension } : {}),
});
const metric = (name: string, dimensionReference?: string) => ({
    name,
    table: 'm',
    ...(dimensionReference ? { dimensionReference } : {}),
});
const explore = (
    dimensions: ReturnType<typeof dimension>[],
    metrics: ReturnType<typeof metric>[],
): Explore =>
    ({
        name: 'm',
        baseTable: 'm',
        tables: {
            m: {
                name: 'm',
                dimensions: Object.fromEntries(
                    dimensions.map((d) => [d.name, d]),
                ),
                metrics: Object.fromEntries(metrics.map((m) => [m.name, m])),
            },
        },
    }) as unknown as Explore;

const coreExplore = explore(
    [
        dimension('close_date'),
        dimension('close_date_day', 'close_date'),
        dimension('close_date_year', 'close_date'),
        dimension('close_date_str'),
        ...['day', 'week', 'month', 'quarter', 'year'].map((i) =>
            dimension(`close_date_str_${i}`, 'close_date_str'),
        ),
        dimension('amount'),
        dimension('removed_column'),
    ],
    [metric('total_amount', 'm_amount'), metric('model_metric')],
);
const fusionExplore = explore(
    [
        dimension('close_date'),
        dimension('close_date_day', 'close_date'),
        dimension('close_date_str'),
        dimension('amount'),
    ],
    [],
);

describe('getDroppedFieldIds', () => {
    it('lists fields lost from columns whose meta is now empty', () => {
        const model: FusionEmptyMetaModel = {
            name: 'm',
            modelMetaEmpty: false,
            emptyMetaColumns: ['close_date_str', 'amount'],
        };
        expect(getDroppedFieldIds(coreExplore, fusionExplore, model)).toEqual([
            'm_close_date_str_day',
            'm_close_date_str_week',
            'm_close_date_str_month',
            'm_close_date_str_quarter',
            'm_close_date_str_year',
            'm_total_amount',
        ]);
    });

    it('lists model-level metrics only when the model meta is empty', () => {
        const model: FusionEmptyMetaModel = {
            name: 'm',
            modelMetaEmpty: true,
            emptyMetaColumns: [],
        };
        expect(getDroppedFieldIds(coreExplore, fusionExplore, model)).toEqual([
            'm_model_metric',
        ]);
    });
});

describe('getFusionMetaWarning', () => {
    it('names the explore, the fields, the dbt version and the columns', () => {
        expect(
            getFusionMetaWarning(coreExplore, fusionExplore, '2.0.12', {
                name: 'm',
                modelMetaEmpty: false,
                emptyMetaColumns: ['close_date_str', 'amount'],
            }),
        ).toBe(
            'Warning: explore m lost 6 fields that the previous deploy had (m_close_date_str_day, m_close_date_str_week, m_close_date_str_month, m_close_date_str_quarter, m_close_date_str_year, m_total_amount). This manifest was built by dbt 2.0.12, which ignores top-level meta; the columns close_date_str, amount have none. Move their meta under config: meta: and recompile.',
        );
    });

    it('returns null when nothing traceable was dropped', () => {
        expect(
            getFusionMetaWarning(coreExplore, coreExplore, '2.0.12', {
                name: 'm',
                modelMetaEmpty: true,
                emptyMetaColumns: ['amount'],
            }),
        ).toBeNull();
    });
});

describe('additional dimensions', () => {
    const withBucket = explore(
        [dimension('amount'), dimension('amount_bucket', undefined, true)],
        [],
    );
    const withoutBucket = explore([dimension('amount')], []);

    it('warns when an additional dimension is lost and its model has empty meta', () => {
        expect(
            getFusionMetaWarning(withBucket, withoutBucket, '2.0.12', {
                name: 'm',
                modelMetaEmpty: false,
                emptyMetaColumns: ['amount'],
            }),
        ).toBe(
            'Warning: explore m lost 1 field that the previous deploy had (m_amount_bucket). This manifest was built by dbt 2.0.12, which ignores top-level meta; their columns or model have none. Move their meta under config: meta: and recompile.',
        );
    });

    it('ignores a lost additional dimension when all meta is present', () => {
        expect(
            getDroppedFieldIds(withBucket, withoutBucket, {
                name: 'm',
                modelMetaEmpty: false,
                emptyMetaColumns: [],
            }),
        ).toEqual([]);
    });
});

describe('getFusionMetaWarnings', () => {
    it('warns per fetched explore and skips explores whose fetch fails', async () => {
        const otherExplore = { ...fusionExplore, name: 'n', baseTable: 'n' };
        vi.mocked(lightdashApi).mockImplementation(async ({ url }) => {
            if (url.endsWith('/explores/n')) throw new Error('Not found');
            return coreExplore as never;
        });
        await expect(
            getFusionMetaWarnings('project', [fusionExplore, otherExplore], {
                dbtVersion: '2.0.12',
                models: [
                    {
                        name: 'm',
                        modelMetaEmpty: false,
                        emptyMetaColumns: ['amount'],
                    },
                    { name: 'n', modelMetaEmpty: true, emptyMetaColumns: [] },
                ],
            }),
        ).resolves.toEqual([
            expect.stringContaining('explore m lost 1 field that'),
        ]);
        expect(lightdashApi).toHaveBeenCalledTimes(2);
    });
});

describe('getFusionEmptyMeta', () => {
    const models = [
        {
            name: 'm',
            meta: {},
            config: { meta: {} },
            columns: {
                close_date: {
                    name: 'close_date',
                    meta: {},
                    config: { meta: { dimension: { type: 'date' } } },
                },
                close_date_str: {
                    name: 'close_date_str',
                    meta: {},
                    config: { meta: {} },
                },
                amount: { name: 'amount', meta: {} },
            },
        },
    ] as unknown as Parameters<typeof getFusionEmptyMeta>[0]['models'];

    it('lists empty-meta models and columns for a Fusion manifest with --skip-dbt-compile', () => {
        expect(
            getFusionEmptyMeta({
                dbtVersion: '2.0.12',
                skipDbtCompile: true,
                models,
            }),
        ).toEqual({
            dbtVersion: '2.0.12',
            models: [
                {
                    name: 'm',
                    modelMetaEmpty: true,
                    emptyMetaColumns: ['close_date_str', 'amount'],
                },
            ],
        });
    });

    it.each([
        { dbtVersion: '1.11.8', skipDbtCompile: true },
        { dbtVersion: undefined, skipDbtCompile: true },
        { dbtVersion: '2.0.12', skipDbtCompile: false },
    ])('skips the comparison for %o', ({ dbtVersion, skipDbtCompile }) => {
        expect(
            getFusionEmptyMeta({ dbtVersion, skipDbtCompile, models }),
        ).toBeNull();
    });
});
