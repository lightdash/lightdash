import {
    DimensionType,
    FieldType,
    MetricType,
    type Dimension,
    type Metric,
} from '@lightdash/common';
import { compile } from 'vega-lite';
import { describe, expect, it } from 'vitest';
import { generateVegaTemplate } from './templates';
import { TemplateType } from './vegaTemplates';

const dimension: Dimension = {
    fieldType: FieldType.DIMENSION,
    type: DimensionType.STRING,
    name: 'segment',
    label: 'Segment',
    table: 'customers',
    tableLabel: 'Customers',
    sql: '${TABLE}.segment',
    hidden: false,
};

const dateDimension: Dimension = {
    ...dimension,
    type: DimensionType.DATE,
    name: 'created_at',
    label: 'Created at',
    sql: '${TABLE}.created_at',
};

const metric: Metric = {
    fieldType: FieldType.METRIC,
    type: MetricType.SUM,
    name: 'total_revenue',
    label: 'Total revenue',
    table: 'customers',
    tableLabel: 'Customers',
    sql: '${TABLE}.revenue',
    hidden: false,
};

const extraMetric: Metric = {
    ...metric,
    name: 'total_orders',
    label: 'Total orders',
};

class CollectingLogger {
    problems: string[] = [];

    level(): number;

    level(value: number): this;

    level(value?: number): number | this {
        return value === undefined ? 0 : this;
    }

    error(...args: readonly unknown[]) {
        this.problems.push(`error: ${args.join(' ')}`);
        return this;
    }

    warn(...args: readonly unknown[]) {
        this.problems.push(`warn: ${args.join(' ')}`);
        return this;
    }

    info() {
        return this;
    }

    debug() {
        return this;
    }
}

const compileTemplate = (
    templateType: TemplateType,
    xField: Dimension = dimension,
) => {
    const templateString = generateVegaTemplate(
        templateType,
        xField,
        metric,
        extraMetric,
    );
    const spec = JSON.parse(templateString);
    const logger = new CollectingLogger();
    compile(spec, { logger });
    return { templateString, spec, problems: logger.problems };
};

describe('vega templates', () => {
    it.each(Object.values(TemplateType))(
        '%s template compiles without vega-lite errors or warnings',
        (templateType) => {
            const { problems } = compileTemplate(templateType);
            expect(problems).toEqual([]);
        },
    );

    it.each(Object.values(TemplateType))(
        '%s template compiles without errors or warnings with a temporal x-axis',
        (templateType) => {
            const { problems } = compileTemplate(templateType, dateDimension);
            expect(problems).toEqual([]);
        },
    );

    it.each(Object.values(TemplateType))(
        '%s template has all placeholders replaced and no hardcoded fields',
        (templateType) => {
            const { templateString } = compileTemplate(templateType);
            expect(templateString).not.toContain('field_x');
            expect(templateString).not.toContain('field_y');
            expect(templateString).not.toContain('field_extra');
            expect(templateString).not.toContain('field_type_x');
            expect(templateString).not.toContain('orders_status');
        },
    );

    it.each(Object.values(TemplateType))(
        '%s template has valid structure (no mark+layer mix, no comment keys)',
        (templateType) => {
            const { templateString, spec } = compileTemplate(templateType);
            if (spec.layer) {
                expect(spec.mark).toBeUndefined();
            }
            expect(templateString).not.toContain('_comment');
            expect(templateString).not.toContain('"_field"');
        },
    );

    it.each(Object.values(TemplateType))(
        '%s template satisfies the editor JSON schema required properties',
        (templateType) => {
            const { spec } = compileTemplate(templateType);
            // vega-lite's JSON schema requires `data` on top-level unit specs;
            // the renderer overwrites it with query results at render time
            if (!spec.layer) {
                expect(spec.data).toBeDefined();
            }
        },
    );

    it.each(Object.values(TemplateType))(
        '%s template does not reference an outdated vega-lite schema',
        (templateType) => {
            const { spec } = compileTemplate(templateType);
            if (spec.$schema) {
                expect(spec.$schema).toMatch(/vega-lite\/v[56]\.json$/);
            }
        },
    );
});
