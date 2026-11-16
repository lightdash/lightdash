import Ajv from 'ajv';
import AjvErrors from 'ajv-errors';
import addFormats from 'ajv-formats';
import { ManifestValidator } from '../dbt/validation';
import lightdashDbtYamlSchema from '../schemas/json/lightdash-dbt-2.0.json';
import modelAsCodeSchema from '../schemas/json/model-as-code-1.0.json';
import {
    SupportedDbtAdapter,
    type DbtModelLightdashConfig,
} from '../types/dbt';
import { isExploreError } from '../types/explore';
import { DimensionType } from '../types/field';
import { DEFAULT_SPOTLIGHT_CONFIG } from '../types/lightdashProjectConfig';
import { warehouseClientMock } from './exploreCompiler.mock';
import { convertLightdashModelToDbtModel } from './lightdashModelConverter';
import { convertExplores } from './translator';
import { model } from './translator.mock';

const compile = (meta: DbtModelLightdashConfig) =>
    convertExplores(
        [
            {
                ...model,
                meta,
                columns: {
                    id: {
                        name: 'id',
                        data_type: DimensionType.STRING,
                        meta: {},
                    },
                },
            },
        ],
        false,
        SupportedDbtAdapter.POSTGRES,
        warehouseClientMock,
        { spotlight: DEFAULT_SPOTLIGHT_CONFIG },
    );

describe('combine joined fields configuration', () => {
    it('leaves existing explores unchanged when omitted', async () => {
        const [result] = await compile({});
        expect(isExploreError(result)).toBe(false);
        expect(result).not.toHaveProperty('combineJoinedFields');
    });

    it('inherits the base setting and allows named explores to explicitly opt out', async () => {
        const results = await compile({
            combine_joined_fields: true,
            explores: {
                inherited: {},
                separate: { combine_joined_fields: false },
            },
        });
        expect(
            results.map((result) => ({
                name: result.name,
                combined: result.combineJoinedFields,
            })),
        ).toEqual([
            { name: 'myTable', combined: true },
            { name: 'inherited', combined: true },
            { name: 'separate', combined: false },
        ]);
        results.forEach((result) => {
            expect(isExploreError(result)).toBe(false);
            expect(result.customMeta ?? {}).not.toHaveProperty(
                'combine_joined_fields',
            );
        });
    });

    it('allows a named explore to opt in without enabling the base explore', async () => {
        const results = await compile({
            explores: { combined: { combine_joined_fields: true } },
        });
        expect(results[0]).not.toHaveProperty('combineJoinedFields');
        expect(results[1].combineJoinedFields).toBe(true);
    });

    it('preserves model and named explore settings in native model conversion', () => {
        const result = convertLightdashModelToDbtModel({
            type: 'model',
            name: 'users',
            sql_from: 'public.users',
            combine_joined_fields: true,
            explores: { separate: { combine_joined_fields: false } },
            dimensions: [
                { name: 'id', type: DimensionType.STRING, sql: '${TABLE}.id' },
            ],
        });
        expect(result.meta.combine_joined_fields).toBe(true);
        expect(result.meta.explores?.separate.combine_joined_fields).toBe(
            false,
        );
    });
});

describe('combine joined fields schemas', () => {
    const dbtAjv = new Ajv({ allErrors: true, allowUnionTypes: true });
    AjvErrors(dbtAjv);
    const modelAjv = new Ajv({
        allErrors: true,
        allowUnionTypes: true,
        discriminator: true,
    });
    addFormats(modelAjv);
    const validateDbt = dbtAjv.compile(lightdashDbtYamlSchema);
    const validateModel = modelAjv.compile(modelAsCodeSchema);
    const validateMetadata = ManifestValidator.getValidator(
        'https://schemas.lightdash.com/lightdash/metadata.json#/definitions/LightdashModelMetadata',
    );

    it.each([true, false])('accepts %s at model and explore level', (value) => {
        const config = {
            combine_joined_fields: value,
            explores: { detail: { combine_joined_fields: !value } },
        };
        expect(
            validateDbt({
                version: 2,
                models: [{ name: 'users', config: { meta: config } }],
            }),
        ).toBe(true);
        expect(
            validateModel({
                type: 'model',
                name: 'users',
                sql_from: 'public.users',
                dimensions: [],
                ...config,
            }),
        ).toBe(true);
        expect(ManifestValidator.isValid(validateMetadata, config)[0]).toBe(
            true,
        );
    });

    it.each([
        { combine_joined_fields: 'yes' },
        { explores: { detail: { combine_joined_fields: 'yes' } } },
    ])('rejects non-boolean configuration: %j', (config) => {
        expect(
            validateDbt({
                version: 2,
                models: [{ name: 'users', config: { meta: config } }],
            }),
        ).toBe(false);
        expect(
            validateModel({
                type: 'model',
                name: 'users',
                sql_from: 'public.users',
                dimensions: [],
                ...config,
            }),
        ).toBe(false);
        expect(ManifestValidator.isValid(validateMetadata, config)[0]).toBe(
            false,
        );
    });
});
