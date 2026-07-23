import { model } from '../compiler/translator.mock';
import { DbtManifestVersion, type DbtRawModelNode } from '../types/dbt';
import { DimensionType, MetricType } from '../types/field';
import { ManifestValidator } from './validation';

const metadataSchemaId =
    'https://schemas.lightdash.com/lightdash/metadata.json';
const defaultTimeDimensionValidator = ManifestValidator.getValidator(
    `${metadataSchemaId}#/definitions/DefaultTimeDimension`,
);
const aiHintValidator = ManifestValidator.getValidator(
    `${metadataSchemaId}#/definitions/AiHint`,
);

const withMeta = (meta: Record<string, unknown>): DbtRawModelNode =>
    ({ ...model, meta }) as unknown as DbtRawModelNode;

const withColumnMeta = (meta: Record<string, unknown>): DbtRawModelNode =>
    ({
        ...model,
        columns: {
            myColumnName: {
                ...model.columns.myColumnName,
                config: { meta },
            },
        },
    }) as unknown as DbtRawModelNode;

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

describe('AI hint metadata schema', () => {
    test.each(['Use the canonical value.', ['First hint.', 'Second hint.']])(
        'accepts %j',
        (value) => {
            expect(ManifestValidator.isValid(aiHintValidator, value)).toEqual([
                true,
                undefined,
            ]);
        },
    );

    test.each([
        { Formula: 'clicks + keys' },
        [{ Formula: 'clicks + keys' }],
        42,
        true,
        null,
    ])('rejects %j', (value) => {
        const [isValid, error] = ManifestValidator.isValid(
            aiHintValidator,
            value,
        );

        expect(isValid).toBe(false);
        expect(error).toBeDefined();
    });

    test.each([
        {
            name: 'model',
            model: withMeta({ ai_hint: [{ invalid: true }] }),
        },
        {
            name: 'field group',
            model: withMeta({
                group_details: {
                    finance: {
                        label: 'Finance',
                        ai_hint: [{ invalid: true }],
                    },
                },
            }),
        },
        {
            name: 'model metric',
            model: withMeta({
                metrics: {
                    revenue: {
                        type: MetricType.SUM,
                        sql: '${TABLE}.revenue',
                        ai_hint: [{ invalid: true }],
                    },
                },
            }),
        },
        {
            name: 'column metric',
            model: withColumnMeta({
                metrics: {
                    revenue: {
                        type: MetricType.SUM,
                        ai_hint: [{ invalid: true }],
                    },
                },
            }),
        },
        {
            name: 'dimension',
            model: withColumnMeta({
                dimension: { ai_hint: [{ invalid: true }] },
            }),
        },
        {
            name: 'additional dimension',
            model: withColumnMeta({
                additional_dimensions: {
                    normalized_name: {
                        type: DimensionType.STRING,
                        sql: '${TABLE}.name',
                        ai_hint: [{ invalid: true }],
                    },
                },
            }),
        },
    ])('validates the $name path', ({ model: modelWithInvalidHint }) => {
        const [isValid, error] = new ManifestValidator(
            DbtManifestVersion.V12,
        ).isModelValid(modelWithInvalidHint);

        expect(isValid).toBe(false);
        expect(error).toContain('must be string');
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
