import { isMap, isSeq, parseDocument, type Document, type YAMLMap } from 'yaml';
import { type AdditionalMetric } from '../../types/metricQuery';
import { convertCustomMetricToDbt } from '../../utils/convertToDbt';

/**
 * Class to edit dbt schema files(YAML)
 * Methods can be chained and the final schema can be obtained as a string.
 * Usage:
 * const editor = new DbtSchemaEditor(schema);
 * const updatedSchema = editor.addCustomMetrics(customMetricsToAdd).toString();
 */
export default class DbtSchemaEditor {
    private readonly doc: Document;

    constructor(doc: string) {
        this.doc = parseDocument(doc);
    }

    private findModelByName(name: string) {
        const node = this.doc.get('models');
        if (!isSeq(node)) {
            // node is not an array
            return undefined;
        }
        return node.items.find(
            (item): item is YAMLMap<unknown, unknown> =>
                isMap(item) && item.get('name') === name,
        );
    }

    private findColumnByName(modelName: string, columnName: string) {
        const model = this.findModelByName(modelName);
        if (!model) {
            // model not found
            return undefined;
        }
        const columns = model.getIn(['columns']);
        if (!isSeq(columns)) {
            // node is not an array
            return undefined;
        }
        return columns.items.find(
            (item): item is YAMLMap<unknown, unknown> =>
                isMap(item) && item.get('name') === columnName,
        );
    }

    hasModels() {
        const models = this.doc.get('models');
        return isSeq(models) && models.items.length > 0;
    }

    // Todo: amend type once YamlModel is moved from backend to common
    addModel(model: unknown): DbtSchemaEditor {
        const models = this.doc.get('models');
        if (!isSeq(models)) {
            // create models array
            this.doc.set('models', [model]);
        } else {
            // add model to existing models
            models.items.push(model);
        }
        return this;
    }

    addCustomMetrics(customMetricsToAdd: AdditionalMetric[]): DbtSchemaEditor {
        customMetricsToAdd.forEach((metric) => {
            if (metric.baseDimensionName === undefined) {
                throw new Error(
                    `Metric ${metric.name} is missing baseDimensionName`,
                );
            }
            const column = this.findColumnByName(
                metric.table,
                metric.baseDimensionName,
            );
            if (!column) {
                throw new Error(
                    `Column ${metric.baseDimensionName} not found in model ${metric.table}`,
                );
            }
            column.setIn(
                ['meta', 'metrics', metric.name],
                convertCustomMetricToDbt(metric),
            );
        });
        return this;
    }

    // Returns the updated schema as a string(YAML)
    toString(options?: { quoteChar?: `'` | `"` }): string {
        return this.doc.toString({
            /**
             * Use 'single quote' rather than "double quote" where applicable.
             * Set to `false` to disable single quotes completely.
             *
             * Default: `null`
             */
            singleQuote: options?.quoteChar ? options.quoteChar === `'` : null,
        });
    }

    // Returns the updated schema as a JSON object
    toJS(): string {
        return this.doc.toJS();
    }
}
