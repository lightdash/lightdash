import Ajv from 'ajv';
import AjvErrors from 'ajv-errors';
import addFormats from 'ajv-formats';
import lightdashDbtYamlSchema from '../schemas/json/lightdash-dbt-2.0.json';
import modelAsCodeSchema from '../schemas/json/model-as-code-1.0.json';

const dbtYamlAjv = new Ajv({
    allErrors: true,
    allowUnionTypes: true,
    coerceTypes: true,
});
AjvErrors(dbtYamlAjv);

const modelYamlAjv = new Ajv({
    allErrors: true,
    allowUnionTypes: true,
    coerceTypes: true,
    discriminator: true,
});
addFormats(modelYamlAjv);

const validateDbtYaml = dbtYamlAjv.compile(lightdashDbtYamlSchema);
const validateModelYaml = modelYamlAjv.compile(modelAsCodeSchema);

const basePreAggregate = {
    name: 'orders_rollup',
    dimensions: ['status'],
    metrics: ['order_count'],
};

const validateInBothSchemas = (
    preAggregate: Record<string, unknown>,
    expected: boolean,
) => {
    const dbtDocument = {
        version: 2,
        models: [
            {
                name: 'orders',
                meta: { pre_aggregates: [preAggregate] },
            },
        ],
    };
    const modelDocument = {
        type: 'model',
        name: 'orders',
        sql_from: 'analytics.orders',
        dimensions: [
            {
                name: 'status',
                type: 'string',
                sql: '${TABLE}.status',
            },
        ],
        pre_aggregates: [preAggregate],
    };

    expect(validateDbtYaml(dbtDocument)).toBe(expected);
    expect(validateModelYaml(modelDocument)).toBe(expected);
};

describe('pre-aggregate external table schema', () => {
    it('keeps the dbt and model-as-code table contracts identical', () => {
        const dbtTableSchema =
            lightdashDbtYamlSchema.$defs.modelMeta.properties.pre_aggregates
                .items.properties.table;
        const modelTableSchema =
            modelAsCodeSchema.definitions.BaseModel.properties.pre_aggregates
                .items.properties.table;

        expect(dbtTableSchema).toStrictEqual(modelTableSchema);
    });

    it.each([
        {
            name: 'an external table',
            preAggregate: {
                ...basePreAggregate,
                table: 'analytics.orders_rollup_mv',
            },
            valid: true,
        },
        {
            name: 'omitted table',
            preAggregate: basePreAggregate,
            valid: true,
        },
        {
            name: 'an empty table',
            preAggregate: { ...basePreAggregate, table: '' },
            valid: false,
        },
    ])('$name is valid: $valid', ({ preAggregate, valid }) => {
        validateInBothSchemas(preAggregate, valid);
    });
});

describe('pre-aggregate sort schema parity', () => {
    it('keeps the dbt and model-as-code sort contracts identical', () => {
        const dbtSortSchema =
            lightdashDbtYamlSchema.$defs.modelMeta.properties.pre_aggregates
                .items.properties.sorts;
        const modelSortSchema =
            modelAsCodeSchema.definitions.BaseModel.properties.pre_aggregates
                .items.properties.sorts;

        expect(dbtSortSchema).toStrictEqual(modelSortSchema);
    });

    it.each([
        {
            name: 'canonical sorts',
            preAggregate: {
                ...basePreAggregate,
                sorts: [
                    { fieldId: 'orders_status', descending: false },
                    {
                        fieldId: 'orders_order_date_day',
                        descending: true,
                    },
                ],
            },
            valid: true,
        },
        {
            name: 'disabled sorts with false',
            preAggregate: { ...basePreAggregate, sorts: false },
            valid: true,
        },
        {
            name: 'disabled sorts with an empty array',
            preAggregate: { ...basePreAggregate, sorts: [] },
            valid: true,
        },
        {
            name: 'omitted sorts',
            preAggregate: basePreAggregate,
            valid: true,
        },
        {
            name: 'a non-object entry',
            preAggregate: {
                ...basePreAggregate,
                sorts: [null],
            },
            valid: false,
        },
        {
            name: 'a missing fieldId',
            preAggregate: {
                ...basePreAggregate,
                sorts: [{ descending: false }],
            },
            valid: false,
        },
        {
            name: 'a missing descending value',
            preAggregate: {
                ...basePreAggregate,
                sorts: [{ fieldId: 'orders_status' }],
            },
            valid: false,
        },
        {
            name: 'a non-boolean descending value',
            preAggregate: {
                ...basePreAggregate,
                sorts: [{ fieldId: 'orders_status', descending: 'yes' }],
            },
            valid: false,
        },
        {
            name: 'a quoted boolean descending value',
            preAggregate: {
                ...basePreAggregate,
                sorts: [{ fieldId: 'orders_status', descending: 'true' }],
            },
            valid: false,
        },
        {
            name: 'the old field key',
            preAggregate: {
                ...basePreAggregate,
                sorts: [{ field: 'status', descending: false }],
            },
            valid: false,
        },
        {
            name: 'a misspelled desceding key',
            preAggregate: {
                ...basePreAggregate,
                sorts: [
                    {
                        fieldId: 'orders_status',
                        descending: false,
                        desceding: true,
                    },
                ],
            },
            valid: false,
        },
        {
            name: 'unsupported nulls_first',
            preAggregate: {
                ...basePreAggregate,
                sorts: [
                    {
                        fieldId: 'orders_status',
                        descending: false,
                        nulls_first: true,
                    },
                ],
            },
            valid: false,
        },
    ])('$name is valid: $valid', ({ preAggregate, valid }) => {
        validateInBothSchemas(preAggregate, valid);
    });
});
