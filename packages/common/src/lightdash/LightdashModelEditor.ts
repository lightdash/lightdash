import Ajv from 'ajv';
import { Document, isMap, isSeq, parseDocument, type YAMLMap } from 'yaml';
import modelSchema from '../schemas/json/model-as-code-1.0.json';
import { ParameterError, ParseError } from '../types/errors';
import { type LightdashModel } from '../types/lightdashModel';
import { type AdditionalMetric } from '../types/metricQuery';
import { convertCustomMetricToLightdash } from './convertCustomMetricToLightdash';

const ajv = new Ajv({ allErrors: true, strict: false });
const validate = ajv.compile<LightdashModel>(modelSchema);

/** Edits the original native model document, preserving comments and unrelated nodes. */
export class LightdashModelEditor {
    private readonly doc: Document;

    private readonly changedDimensions = new Set<YAMLMap>();

    constructor(
        private readonly contents: string,
        private readonly filename: string,
    ) {
        this.doc = parseDocument(contents);
        this.validate();
    }

    private validate(): LightdashModel {
        const model: unknown = this.doc.toJS();
        if (this.doc.errors.length > 0 || !validate(model)) {
            throw new ParseError(
                `Invalid Lightdash model in ${this.filename}: ${this.doc.errors.map((error) => error.message).join('; ') || ajv.errorsText(validate.errors)}`,
            );
        }
        return model;
    }

    private assertModelName(name: string): void {
        if (this.doc.get('name') !== name) {
            throw new ParameterError(
                `Model ${name} no longer matches ${this.filename}. Refresh the project before writing back.`,
            );
        }
    }

    private assertFieldDoesNotExist(name: string): void {
        const model = this.validate();
        const names = [
            ...Object.keys(model.metrics ?? {}),
            ...model.dimensions.flatMap((dimension) => [
                dimension.name,
                ...Object.keys(dimension.metrics ?? {}),
                ...Object.keys(dimension.additional_dimensions ?? {}),
            ]),
        ];
        if (
            names.some(
                (existing) => existing.toLowerCase() === name.toLowerCase(),
            )
        ) {
            throw new ParameterError(
                `Field ${name} already exists in ${this.filename}. Choose a different name to preserve the existing definition.`,
            );
        }
    }

    addCustomMetrics(metrics: AdditionalMetric[]): this {
        metrics.forEach((metric) => {
            this.assertModelName(metric.table);
            this.assertFieldDoesNotExist(metric.name);
            const definition = convertCustomMetricToLightdash(metric);
            const dimensions = this.doc.get('dimensions');
            const dimension = isSeq(dimensions)
                ? dimensions.items.find(
                      (item) =>
                          isMap(item) &&
                          item.get('name') === metric.baseDimensionName,
                  )
                : undefined;
            if (!isMap(dimension)) {
                throw new ParameterError(
                    `Native dimension ${metric.baseDimensionName} not found in ${this.filename}. Refresh the project before writing back.`,
                );
            }
            dimension.setIn(['metrics', metric.name], definition);
            this.changedDimensions.add(dimension);
        });
        this.validate();
        return this;
    }

    toString(options?: { quoteChar?: '"' | "'" }): string {
        // Replace only changed dimension nodes. Serializing the whole document
        // would reindent every list and reflow unrelated model SQL/descriptions.
        let result = this.contents;
        const nodes = [...this.changedDimensions].sort(
            (a, b) => b.range![0] - a.range![0],
        );
        for (const node of nodes) {
            const [start, , end] = node.range!;
            const lineStart = this.contents.lastIndexOf('\n', start - 1) + 1;
            const prefix = this.contents.slice(lineStart, start);
            if (!/^ *-? *$/.test(prefix) || node.flow) {
                throw new ParameterError(
                    `Native write-back requires block-style dimensions in ${this.filename}. Expand flow-style YAML before writing back.`,
                );
            }
            const clone = node.clone();
            // A leading comment lies before range[0] and remains in the source.
            clone.commentBefore = undefined;
            const text = new Document(clone)
                .toString({
                    singleQuote: options?.quoteChar === "'" ? true : null,
                    lineWidth: 0,
                })
                .trimEnd()
                .split('\n')
                .join(`\n${' '.repeat(prefix.length)}`);
            result = `${result.slice(0, start) + text}\n${result.slice(end)}`;
        }
        return result;
    }
}
