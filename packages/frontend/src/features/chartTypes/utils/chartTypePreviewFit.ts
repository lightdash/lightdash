import {
    assertUnreachable,
    getDataAppVizFieldIds,
    type DataAppVizField,
    type DataAppVizFieldMapping,
} from '@lightdash/common';
import {
    poolKeyForSlot,
    type DataAppVizFieldPools,
} from './autoMapDataAppVizFields';

/** What a slot can be bound to, in the words the panel uses. */
export type ChartTypeFitExpectation = 'dimension' | 'metric' | 'field';

export type ChartTypeFitIssue = {
    fieldName: string;
    label: string;
    expects: ChartTypeFitExpectation;
    /** The bound column that does not fit, and what it turned out to be;
     *  null when nothing is bound. */
    mapped: {
        fieldId: string;
        kind: 'dimension' | 'metric' | 'gone';
    } | null;
};

const expectationFor = (field: DataAppVizField): ChartTypeFitExpectation => {
    const pool = poolKeyForSlot(field);
    switch (pool) {
        case 'dimension':
            return 'dimension';
        case 'metric':
            return 'metric';
        case 'column':
            return 'field';
        default:
            return assertUnreachable(pool, `Unknown field pool: ${pool}`);
    }
};

const kindOf = (
    fieldId: string,
    pools: DataAppVizFieldPools,
): 'dimension' | 'metric' | 'gone' => {
    if (pools.dimension.includes(fieldId)) return 'dimension';
    if (pools.metric.includes(fieldId)) return 'metric';
    return 'gone';
};

/**
 * Whether a binding fits the chart type, decided from field types alone — no
 * rows, so nothing here can run a warehouse query. A required slot with
 * nothing bound and a slot bound to the wrong kind of column both fail; an
 * optional slot left empty is fine.
 */
export const checkChartTypeFit = (
    fields: DataAppVizField[],
    fieldMapping: DataAppVizFieldMapping,
    pools: DataAppVizFieldPools,
): ChartTypeFitIssue[] =>
    fields.reduce<ChartTypeFitIssue[]>((issues, field) => {
        const ids = getDataAppVizFieldIds(fieldMapping[field.name]);
        const pool = pools[poolKeyForSlot(field)];
        const wrongId = ids.find((id) => !pool.includes(id));
        if (wrongId !== undefined) {
            issues.push({
                fieldName: field.name,
                label: field.label,
                expects: expectationFor(field),
                mapped: { fieldId: wrongId, kind: kindOf(wrongId, pools) },
            });
        } else if (field.required && ids.length === 0) {
            issues.push({
                fieldName: field.name,
                label: field.label,
                expects: expectationFor(field),
                mapped: null,
            });
        }
        return issues;
    }, []);

/** The one-line headline shown against the offending input. */
export const chartTypeFitHeadline = (issue: ChartTypeFitIssue): string =>
    `${issue.label} needs a ${issue.expects}.`;

/** Why, in one sentence. `mappedLabel` names the column that does not fit. */
export const chartTypeFitDetail = (
    issue: ChartTypeFitIssue,
    mappedLabel: string | null,
): string => {
    if (issue.mapped === null) {
        return `Nothing is bound to ${issue.label} yet.`;
    }
    const subject = mappedLabel ?? issue.mapped.fieldId;
    switch (issue.mapped.kind) {
        case 'dimension':
            return `${subject} is a dimension, so the chart has no value to size itself by.`;
        case 'metric':
            return `${subject} is a metric, so the chart has nothing to split by.`;
        case 'gone':
            return `${subject} is not available in this query any more.`;
        default:
            return assertUnreachable(
                issue.mapped.kind,
                `Unknown bound column kind: ${issue.mapped.kind}`,
            );
    }
};

/** The badge a saved chart row carries: "Fits", or the first reason. */
export const chartTypeFitSummary = (
    issues: ChartTypeFitIssue[],
    pools: DataAppVizFieldPools,
): string => {
    const [first] = issues;
    if (!first) return 'Fits';
    switch (first.expects) {
        case 'metric':
            return 'Needs a metric';
        case 'dimension':
            return pools.dimension.length === 0
                ? 'No dimensions'
                : 'Needs a dimension';
        case 'field':
            return 'Needs a field';
        default:
            return assertUnreachable(
                first.expects,
                `Unknown fit expectation: ${first.expects}`,
            );
    }
};
