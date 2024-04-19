import { z } from 'zod';
import {
    AbstractVizConfigTransformer,
    vizConfigSchema,
    type VizConfigTransformerArguments,
} from '../AbstractVizConfigTransformer';

const columnSchema = z.object({
    visible: z.boolean().optional(),
    name: z.string().optional(),
    frozen: z.boolean().optional(),
});

export const tableConfigSchema = vizConfigSchema.extend({
    type: z.literal('table'),
    showColumnCalculation: z.boolean().optional(),
    showRowCalculation: z.boolean().optional(),
    showTableNames: z.boolean().optional(),
    hideRowNumbers: z.boolean().optional(),
    showResultsTotal: z.boolean().optional(),
    showSubtotals: z.boolean().optional(),
    columns: z.record(z.string(), columnSchema),
});

export type TableConfig = z.infer<typeof tableConfigSchema>;

export class TableConfigTransformer<
    T extends TableConfig = TableConfig,
> extends AbstractVizConfigTransformer<T> {
    static type = 'table';

    constructor(args: VizConfigTransformerArguments) {
        super(args);
        this.vizConfig = this.validVizConfig(args.vizConfig as T);
    }

    /**
     * Returns a valid table config
     */
    protected validVizConfig(config: T): T {
        return {
            ...config,
            showColumnCalculation: config.showColumnCalculation,
            showRowCalculation: config.showRowCalculation,
            showTableNames: config.showTableNames,
            hideRowNumbers: config.hideRowNumbers,
            showResultsTotal: config.showResultsTotal,
            showSubtotals: config.showSubtotals,
            columns: this.getColumns(config.columns),
        };
    }

    /**
     * Get valid columns based on existing configuration and results transformer
     * @param currentColumns
     * @private
     */
    private getColumns(
        currentColumns?: TableConfig['columns'],
    ): TableConfig['columns'] {
        return this.resultsTransformer
            .getFieldOptions()
            .reduce<TableConfig['columns']>((acc, field) => {
                acc[field] = {
                    visible: true,
                    name: field,
                    frozen: false,
                    ...(currentColumns ?? {})[field],
                };
                return acc;
            }, {});
    }
}
