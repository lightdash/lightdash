import {
    DimensionType,
    FieldReferenceError,
    FilterGroup,
    isAndFilterGroup,
    isFilterGroup,
    renderFilterRuleSql,
    SupportedDbtAdapter,
    WeekDay,
    type ParametersValuesMap,
} from '@lightdash/common';
import { safeReplaceParameters } from './parameters';
import {
    extractOuterLimitOffsetFromSQL,
    removeCommentsAndOuterLimitOffset,
    removeTrailingSemicolon,
    type LimitOffsetClause,
} from './utils';

type ReferenceObject = { type: DimensionType; sql: string };
export type ReferenceMap = Record<string, ReferenceObject> | undefined;
type From = { name: string; sql?: string };

export class SqlQueryBuilder {
    // Column references, to be used in select, filters, etc
    private readonly referenceMap: ReferenceMap;

    // Select values are references
    private readonly select: string[];

    private readonly from: From;

    private readonly filters: FilterGroup | undefined;

    private readonly parameters?: ParametersValuesMap;

    private readonly limit: number | undefined;

    constructor(
        args: {
            referenceMap: ReferenceMap;
            select: string[];
            from: From;
            filters?: FilterGroup;
            parameters?: ParametersValuesMap;
            limit: number | undefined;
        },
        private config: {
            fieldQuoteChar: string;
            stringQuoteChar: string;
            escapeStringQuoteChar: string;
            escapeString: (string: string) => string;
            startOfWeek: WeekDay | null | undefined;
            adapterType: SupportedDbtAdapter;
            timezone?: string;
        },
    ) {
        this.select = args.select;
        this.from = args.from;
        this.filters = args.filters;
        this.referenceMap = args.referenceMap;
        this.parameters = args.parameters;
        this.limit = args.limit;
    }

    private quotedName(value: string) {
        return `${this.config.fieldQuoteChar}${value}${this.config.fieldQuoteChar}`;
    }

    private getReference(reference: string): ReferenceObject {
        const referenceObject = this.referenceMap?.[reference];
        if (!referenceObject) {
            throw new FieldReferenceError(`Unknown reference: ${reference}`);
        }
        return referenceObject;
    }

    private selectsToSql(): string | undefined {
        let selectSQL = '*';
        if (this.select.length > 0) {
            selectSQL = this.select
                .map((reference) => {
                    const referenceObject = this.getReference(reference);
                    return `${referenceObject.sql} AS ${this.quotedName(
                        reference,
                    )}`;
                })
                .join(',\n');
        }
        return `SELECT\n${selectSQL}`;
    }

    private fromToSql(): string {
        if (this.from.sql) {
            // strip any trailing semicolons, comments and outer limit/offset
            let sanitizedSql = removeCommentsAndOuterLimitOffset(this.from.sql);
            sanitizedSql = removeTrailingSemicolon(sanitizedSql);
            return `FROM (\n${sanitizedSql}\n) AS ${this.quotedName(
                this.from.name,
            )}`;
        }
        return `FROM ${this.quotedName(this.from.name)}`;
    }

    private filtersToSql() {
        // Recursive function to convert filters to SQL
        const getNestedFilterSQLFromGroup = (
            filterGroup: FilterGroup | undefined,
        ): string | undefined => {
            if (filterGroup) {
                const operator = isAndFilterGroup(filterGroup) ? 'AND' : 'OR';
                const items = isAndFilterGroup(filterGroup)
                    ? filterGroup.and
                    : filterGroup.or;
                if (items.length === 0) return undefined;
                const filterRules: string[] = items.reduce<string[]>(
                    (sum, item) => {
                        // Handle nested filters
                        if (isFilterGroup(item)) {
                            const nestedFilterSql =
                                getNestedFilterSQLFromGroup(item);
                            return nestedFilterSql
                                ? [...sum, nestedFilterSql]
                                : sum;
                        }
                        // Handle filter rule
                        const reference = this.getReference(
                            item.target.fieldId,
                        );
                        const filterSQl = `(\n${renderFilterRuleSql(
                            item,
                            reference.type,
                            reference.sql,
                            this.config.stringQuoteChar,
                            this.config.escapeString,
                            this.config.startOfWeek,
                            this.config.adapterType,
                            this.config.timezone,
                        )}\n)`;
                        return [...sum, filterSQl];
                    },
                    [],
                );
                return filterRules.length > 0
                    ? `(${filterRules.join(` ${operator} `)})`
                    : undefined;
            }
            return undefined;
        };

        const filtersSql = getNestedFilterSQLFromGroup(this.filters);
        if (filtersSql) {
            return `WHERE ${filtersSql}`;
        }
        return undefined;
    }

    private limitToSql() {
        if (!this.limit) {
            return undefined;
        }

        // If there is this.from.sql then we removed the outer limit/offset from the from clause, we need to append the limit to the query if it exists
        if (this.from.sql) {
            const limitOffset = extractOuterLimitOffsetFromSQL(this.from.sql);
            return SqlQueryBuilder.buildLimitOffsetSql(this.limit, limitOffset);
        }

        return `LIMIT ${this.limit}`;
    }

    private static buildLimitOffsetSql(
        limit: number,
        limitOffset?: LimitOffsetClause,
    ): string {
        const limitToAppend = limitOffset?.limit
            ? Math.min(limitOffset.limit, limit)
            : limit;

        const offsetString = limitOffset?.offset
            ? ` OFFSET ${limitOffset.offset}`
            : '';

        return `LIMIT ${limitToAppend}${offsetString}`;
    }

    getSqlAndReferences(): {
        sql: string;
        parameterReferences: string[];
        missingParameterReferences: string[];
        usedParameters: ParametersValuesMap;
    } {
        // Combine all parts of the query
        const sql = [
            this.selectsToSql(),
            this.fromToSql(),
            this.filtersToSql(),
            this.limitToSql(),
        ]
            .filter((l) => l !== undefined)
            .join('\n');

        const { replacedSql, references, missingReferences } =
            safeReplaceParameters({
                sql,
                parameterValuesMap: this.parameters ?? {},
                escapeString: this.config.escapeString,
                quoteChar: this.config.stringQuoteChar,
            });

        // Filter parameters to only include those that are referenced in the query
        const usedParameters: ParametersValuesMap = Object.fromEntries(
            Object.entries(this.parameters ?? {}).filter(([key]) =>
                references.has(key),
            ),
        );

        return {
            sql: replacedSql,
            parameterReferences: Array.from(references),
            missingParameterReferences: Array.from(missingReferences),
            usedParameters,
        };
    }

    toSql(): string {
        return this.getSqlAndReferences().sql;
    }
}
