import { ExplorerResultsTransformer } from '../../ResultTransformers';
import { VizConfigTransformerFactory } from '../../VizConfigTransformers';
import { barVizConfig, results } from '../LibTransformer.mock';
import { VizLibTransformerFactory } from '../VizLibTransformerFactory';

describe('VegaTransformer', () => {
    it('should return a valid vega bar chart', async () => {
        const resultsTransformer = new ExplorerResultsTransformer({
            data: results,
        });
        const vizConfigTransformer =
            VizConfigTransformerFactory.createVizConfigTransformer({
                vizConfig: barVizConfig,
                resultsTransformer,
            });
        const vizLib = VizLibTransformerFactory.createVizLibTransformer({
            vizConfigTransformer,
        });

        expect(vizLib.getConfig()).toEqual({
            autosize: {
                type: 'fit',
                contains: 'padding',
                resize: true,
            },
            width: 'container',
            height: 'container',
            mark: {
                type: 'bar',
                color: '#7162ff',
            },
            encoding: {
                x: {
                    field: 'orders_status',
                    title: 'Orders Status',
                    type: 'nominal',
                    axis: {
                        labelAngle: 0,
                    },
                },
                y: {
                    field: 'orders_average_order_size',
                    title: 'Orders average order size',
                    type: 'quantitative',
                },
            },
            data: {
                values: [
                    {
                        orders_status: 'completed',
                        orders_order_date_week: 1,
                        orders_average_order_size: 5,
                    },
                    {
                        orders_status: 'incomplete',
                        orders_order_date_week: 3,
                        orders_average_order_size: 7,
                    },
                ],
            },
        });
    });
});
