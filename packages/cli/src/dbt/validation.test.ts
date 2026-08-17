import {
    DbtManifestVersion,
    InlineErrorType,
    ManifestValidator,
    type DbtRawModelNode,
} from '@lightdash/common';
import { validateDbtModel } from './validation';

const makeModel = (name: string): DbtRawModelNode =>
    ({
        unique_id: `model.test.${name}`,
        name,
        resource_type: 'model',
        database: 'database',
        columns: { id: { name: 'id', meta: {} } },
        meta: {},
    }) as unknown as DbtRawModelNode;

describe('validateDbtModel', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    test('directs served manifest validation failures to a project redeploy', async () => {
        const validationMessage =
            'Model "served_orders" from dbt source "server": Field at model root must have required property \'original_file_path\'. Update this field in your dbt model, then deploy again.';
        const invalidValidator = Object.assign(vi.fn().mockReturnValue(false), {
            errors: [],
        }) as unknown as ReturnType<typeof ManifestValidator.getValidator>;
        vi.spyOn(ManifestValidator, 'getValidator').mockReturnValue(
            invalidValidator,
        );
        vi.spyOn(ManifestValidator, 'formatAjvErrors').mockReturnValue(
            validationMessage,
        );
        const servedModel = makeModel('served_orders');
        const localModel = makeModel('local_orders');

        const result = await validateDbtModel(
            'postgres',
            DbtManifestVersion.V11,
            [servedModel, localModel],
            new Set([servedModel.unique_id]),
        );

        const servedMessage = result.invalid[0].errors[0].message;
        const localMessage = result.invalid[1].errors[0].message;
        expect(servedMessage).toContain('The served manifest is outdated.');
        expect(servedMessage).toContain(
            'Redeploy the Lightdash project, then try again.',
        );
        expect(servedMessage).not.toContain(
            'Update this field in your dbt model',
        );
        expect(localMessage).toContain('Update this field in your dbt model');
    });

    test('keeps valid v12 models when column config metadata is invalid', async () => {
        const validModel = makeModel('valid_orders');
        const invalidModel = {
            ...makeModel('invalid_orders'),
            columns: {
                amount: {
                    name: 'amount',
                    config: {
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
                },
            },
        } as unknown as DbtRawModelNode;

        const result = await validateDbtModel(
            'postgres',
            DbtManifestVersion.V12,
            [validModel, invalidModel],
        );

        expect(result.valid.map(({ name }) => name)).toEqual(['valid_orders']);
        expect(result.invalid).toMatchObject([
            {
                name: 'invalid_orders',
                errors: [{ type: InlineErrorType.METADATA_PARSE_ERROR }],
            },
        ]);
    });
});
