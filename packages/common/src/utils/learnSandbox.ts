import { parse as parseYaml } from 'yaml';

/**
 * Whether a Learn workspace file parses as YAML: null when it does, else the
 * parser's message. The server refuses to save a file that fails this, and
 * the workspace page applies the same rule before it asks, so the learner
 * hears about a mistake where they made it.
 */
export const validateLearnWorkspaceYaml = (content: string): string | null => {
    try {
        parseYaml(content);
        return null;
    } catch (e) {
        return e instanceof Error ? e.message : 'Invalid YAML';
    }
};

/**
 * One line for the learner: the parser's messages run to several lines with
 * a snippet, and name the line, which is all the page needs to point at.
 */
export const describeLearnWorkspaceYamlError = (message: string): string => {
    const line = /at line (\d+)/.exec(message)?.[1];
    return line
        ? `Fix the YAML error on line ${line} to continue`
        : 'Fix the YAML error to continue';
};

/**
 * What a developer lesson asks the learner to add, as facts about the dbt
 * project rather than as text: a column declared on a model (no `column`,
 * `under: 'columns'`), or an entry under a key of a column's meta (a metric
 * under `metrics`). The walkthrough's Check button tests the file against
 * this, so where the entry sits in its list, its quoting, spacing, key order
 * and flow style are all the learner's own business, and the right line
 * under the wrong model or column is not accepted.
 */
export type LearnLessonExpectation = {
    /** dbt model name. */
    model: string;
    /** dbt column the entry goes under; absent for a column declaration. */
    column?: string;
    /** The key the entry goes under: `columns`, `metrics`, ... */
    under: string;
    /** Name of the column, or key of the entry, to find. */
    field: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const namedItems = (value: unknown): Record<string, unknown>[] =>
    Array.isArray(value) ? value.filter(isRecord) : [];

/** dbt reads a column's meta from `meta` and, from 1.10, `config.meta`. */
const metaBlocks = (column: Record<string, unknown>): unknown[] => [
    column.meta,
    isRecord(column.config) ? column.config.meta : undefined,
];

const columnHolds = (
    column: Record<string, unknown>,
    under: string,
    field: string,
): boolean =>
    metaBlocks(column).some(
        (meta) =>
            isRecord(meta) && isRecord(meta[under]) && field in meta[under],
    );

/**
 * Null when the file holds what the lesson expects; otherwise one line for
 * the learner saying what is missing or where it ended up instead.
 */
export const checkLearnLessonEntry = (
    content: string,
    expected: LearnLessonExpectation,
): string | null => {
    let doc: unknown;
    try {
        doc = parseYaml(content);
    } catch (e) {
        return describeLearnWorkspaceYamlError(
            e instanceof Error ? e.message : 'Invalid YAML',
        ).replace(/ to continue$/, ', then check again');
    }
    const models = namedItems(isRecord(doc) ? doc.models : undefined);
    const model = models.find((m) => m.name === expected.model);
    if (!model) return `The ${expected.model} model is missing from this file`;
    const columns = namedItems(model.columns);

    if (expected.column === undefined) {
        if (columns.some((c) => c.name === expected.field)) return null;
        const elsewhere = models.find(
            (m) =>
                m !== model &&
                namedItems(m.columns).some((c) => c.name === expected.field),
        );
        if (elsewhere) {
            return `${expected.field} is under the ${String(elsewhere.name)} model. Add it under ${expected.model}`;
        }
        return `Add ${expected.field} to the ${expected.model} model's ${expected.under}`;
    }

    const column = columns.find((c) => c.name === expected.column);
    if (!column) {
        return `The ${expected.column} column is missing from ${expected.model}`;
    }
    if (columnHolds(column, expected.under, expected.field)) return null;
    const otherColumn = models
        .flatMap((m) => namedItems(m.columns))
        .find(
            (c) =>
                c !== column && columnHolds(c, expected.under, expected.field),
        );
    if (otherColumn) {
        return `${expected.field} is under the ${String(otherColumn.name)} column. Add it under ${expected.column}`;
    }
    return `Add ${expected.field} under the ${expected.column} column's ${expected.under}`;
};
