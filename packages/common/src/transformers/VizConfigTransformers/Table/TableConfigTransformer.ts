import { z } from 'zod';
import {
    AbstractVizConfigTransformer,
    vizConfigSchema,
    type VizConfigTransformerArguments,
} from '../AbstractVizConfigTransformer';

export const tableConfigSchema = vizConfigSchema.extend({
    type: z.literal('table').describe("Type of the viz. defaults to 'table'"),
    columns: z
        .array(
            z
                .object({
                    fieldId: z.string().describe('Field ID'),
                    visible: z
                        .boolean()
                        .optional()
                        .describe('Column visibility. Optional'),
                    frozen: z
                        .boolean()
                        .optional()
                        .describe('Column frozen. Optional'),
                    name: z.string().optional().describe('Column name'),
                })
                .describe('Column configuration'),
        )
        .min(1)
        .describe(
            'Columns configuration. This is a must to have property and should have at least one column',
        ),
    showColumnCalculation: z
        .boolean()
        .optional()
        .describe('Show column calculation. Optional'),
    showRowCalculation: z
        .boolean()
        .optional()
        .describe('Show row calculation. Optional'),
    showTableNames: z
        .boolean()
        .optional()
        .describe('Show table names. Optional'),
    hideRowNumbers: z
        .boolean()
        .optional()
        .describe('Hide row numbers. Optional'),
    showResultsTotal: z
        .boolean()
        .optional()
        .describe('Show results total. Optional'),
    showSubtotals: z.boolean().optional().describe('Show subtotals. Optional'),
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
    private getColumns(currentColumns?: TableConfig['columns']) {
        return this.resultsTransformer
            .getFieldOptions()
            .map<TableConfig['columns'][number]>(
                (fieldId) =>
                    currentColumns?.find(
                        (column) => column.fieldId === fieldId,
                    ) ?? {
                        fieldId,
                        visible: true,
                        frozen: false,
                        name: fieldId,
                    },
            );
    }
}
