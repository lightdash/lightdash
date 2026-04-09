import { DimensionType } from '../types/field';
import type { LightdashModel } from '../types/lightdashModel';
import { convertLightdashModelToDbtModel } from './lightdashModelConverter';

describe('convertLightdashModelToDbtModel', () => {
    it('preserves pre-aggregates in model meta', () => {
        const model: LightdashModel = {
            type: 'model',
            name: 'orders',
            sql_from: 'jaffle.orders',
            dimensions: [
                {
                    name: 'order_date',
                    type: DimensionType.DATE,
                    sql: '${TABLE}.order_date',
                },
            ],
            pre_aggregates: [
                {
                    name: 'orders_rollup',
                    dimensions: ['order_date'],
                    metrics: ['order_count'],
                    materialization_role: {
                        email: 'materialize@acme.com',
                        attributes: {
                            allowed_regions: ['EMEA'],
                        },
                    },
                },
            ],
        };

        const dbtModel = convertLightdashModelToDbtModel(model);

        expect(dbtModel.meta.pre_aggregates).toEqual(model.pre_aggregates);
        expect(dbtModel.config?.meta?.pre_aggregates).toEqual(
            model.pre_aggregates,
        );
    });
});
