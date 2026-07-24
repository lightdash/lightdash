import { model } from '../compiler/translator.mock';
import { DbtManifestVersion, type DbtRawModelNode } from '../types/dbt';
import { ManifestValidator } from './validation';

const metadataSchemaId =
    'https://schemas.lightdash.com/lightdash/metadata.json';
const defaultTimeDimensionValidator = ManifestValidator.getValidator(
    `${metadataSchemaId}#/definitions/DefaultTimeDimension`,
);
const withMeta = (meta: Record<string, unknown>): DbtRawModelNode =>
    ({ ...model, meta }) as unknown as DbtRawModelNode;

const usesColumnConfigMeta = (manifestVersion: DbtManifestVersion) =>
    manifestVersion === DbtManifestVersion.V12 ||
    manifestVersion === DbtManifestVersion.V20;

const withColumnMetricDefault = (
    manifestVersion: DbtManifestVersion,
    field: unknown,
): DbtRawModelNode => {
    const meta = {
        metrics: {
            total_amount: {
                type: 'sum',
                default_time_dimension: { field, interval: 'DAY' },
            },
        },
    };

    return {
        ...model,
        ...(manifestVersion === DbtManifestVersion.V7
            ? { root_path: 'root' }
            : {}),
        columns: {
            amount: {
                name: 'amount',
                ...(usesColumnConfigMeta(manifestVersion)
                    ? { config: { meta } }
                    : { meta }),
            },
        },
    } as unknown as DbtRawModelNode;
};

describe('DefaultTimeDimension metadata schema', () => {
    test.each([
        {
            name: 'non-string field',
            value: { field: { created_at: null }, interval: 'DAY' },
            error: 'must be string',
        },
        {
            name: 'missing interval',
            value: { field: 'created_at' },
            error: "must have required property 'interval'",
        },
        {
            name: 'unsupported interval',
            value: { field: 'created_at', interval: 'HOUR' },
            error: 'must be equal to one of the allowed values',
        },
    ])('rejects a $name', ({ value, error: expectedError }) => {
        const [isValid, error] = ManifestValidator.isValid(
            defaultTimeDimensionValidator,
            value,
        );

        expect(isValid).toBe(false);
        expect(error).toContain(expectedError);
    });

    test('accepts the documented shape', () => {
        expect(
            ManifestValidator.isValid(defaultTimeDimensionValidator, {
                field: 'created_at',
                interval: 'MONTH',
            }),
        ).toEqual([true, undefined]);
    });
});

describe('AI hint manifest compatibility', () => {
    test('does not invalidate an explore with malformed optional hints', () => {
        const malformedHint = { Formula: 'clicks + keys' };
        const modelWithMalformedHints = {
            ...model,
            meta: {
                ai_hint: malformedHint,
                group_details: {
                    finance: {
                        label: 'Finance',
                        ai_hint: [malformedHint],
                    },
                },
                metrics: {
                    revenue: {
                        type: 'sum',
                        sql: '${TABLE}.revenue',
                        ai_hint: [malformedHint],
                    },
                },
            },
            columns: {
                myColumnName: {
                    ...model.columns.myColumnName,
                    config: {
                        meta: {
                            metrics: {
                                revenue: {
                                    type: 'sum',
                                    ai_hint: [malformedHint],
                                },
                            },
                            dimension: { ai_hint: [malformedHint] },
                            additional_dimensions: {
                                normalized_name: {
                                    type: 'string',
                                    sql: '${TABLE}.name',
                                    ai_hint: [malformedHint],
                                },
                            },
                        },
                    },
                },
            },
        } as unknown as DbtRawModelNode;

        expect(
            new ManifestValidator(DbtManifestVersion.V12).isModelValid(
                modelWithMalformedHints,
            ),
        ).toEqual([true, undefined]);
    });
});

describe('ManifestValidator default_time_dimension composition', () => {
    test.each(Object.values(DbtManifestVersion))(
        'validates the column metadata path for %s',
        (manifestVersion) => {
            const validator = new ManifestValidator(manifestVersion);
            const [isValid, error] = validator.isModelValid(
                withColumnMetricDefault(manifestVersion, {
                    created_at: null,
                }),
            );

            expect(isValid).toBe(false);
            expect(error).toContain('must be string');
            expect(
                validator.isModelValid(
                    withColumnMetricDefault(manifestVersion, 'created_at'),
                ),
            ).toEqual([true, undefined]);
        },
    );

    test.each([
        {
            name: 'model default',
            meta: {
                default_time_dimension: {
                    field: { created_at: null },
                    interval: 'DAY',
                },
            },
        },
        {
            name: 'model-level metric default',
            meta: {
                metrics: {
                    total_amount: {
                        type: 'sum',
                        default_time_dimension: {
                            field: { created_at: null },
                            interval: 'DAY',
                        },
                    },
                },
            },
        },
    ])('validates the $name path', ({ meta }) => {
        const [isValid, error] = new ManifestValidator(
            DbtManifestVersion.V12,
        ).isModelValid(withMeta(meta));

        expect(isValid).toBe(false);
        expect(error).toContain('must be string');
    });
});
