import {
    DbtManifestVersion,
    InlineErrorType,
    type DbtRawModelNode,
} from '@lightdash/common';
import { validateDbtModel } from './validation';

const makeModel = (name: string): DbtRawModelNode =>
    ({
        name,
        resource_type: 'model',
        database: 'database',
        columns: { id: { name: 'id', meta: {} } },
        meta: {},
    }) as unknown as DbtRawModelNode;

describe('validateDbtModel', () => {
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
