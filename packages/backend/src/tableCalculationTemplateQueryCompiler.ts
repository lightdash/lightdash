import {
    assertUnreachable,
    FrameBoundaryType,
    MetricQuery,
    TableCalculationTemplate,
    TableCalculationTemplateType,
    WindowFunctionType,
    type FrameBoundary,
    type WarehouseSqlBuilder,
} from '@lightdash/common';

const compileWindowFunctionTemplate = (
    template: Extract<
        TableCalculationTemplate,
        { type: TableCalculationTemplateType.WINDOW_FUNCTION }
    >,
    quoteChar: string,
): string => {
    // Build the window function name and determine if it needs a field argument
    let functionName: string;
    let needsFieldId = false;

    switch (template.windowFunction) {
        case WindowFunctionType.ROW_NUMBER:
            functionName = 'ROW_NUMBER';
            break;
        case WindowFunctionType.PERCENT_RANK:
            functionName = 'PERCENT_RANK';
            break;
        case WindowFunctionType.CUME_DIST:
            functionName = 'CUME_DIST';
            break;
        case WindowFunctionType.RANK:
            functionName = 'RANK';
            break;
        case WindowFunctionType.SUM:
            functionName = 'SUM';
            needsFieldId = true;
            break;
        case WindowFunctionType.AVG:
            functionName = 'AVG';
            needsFieldId = true;
            break;
        case WindowFunctionType.COUNT:
            functionName = 'COUNT';
            needsFieldId = true;
            break;
        case WindowFunctionType.MIN:
            functionName = 'MIN';
            needsFieldId = true;
            break;
        case WindowFunctionType.MAX:
            functionName = 'MAX';
            needsFieldId = true;
            break;
        default:
            return assertUnreachable(
                template.windowFunction,
                `Unknown window function type`,
            );
    }

    // Build function call - with or without field argument
    let functionCall: string;
    if (needsFieldId) {
        if (!template.fieldId) {
            throw new Error(
                `Field ID is required for ${functionName} window function`,
            );
        }
        const quotedAggFieldId = `${quoteChar}${template.fieldId}${quoteChar}`;
        functionCall = `${functionName}(${quotedAggFieldId})`;
    } else {
        functionCall = `${functionName}()`;
    }

    // Build OVER clause components
    const overParts: string[] = [];

    // Add PARTITION BY if specified
    if (template.partitionBy.length > 0) {
        const partitionFields = template.partitionBy
            .map((fieldId) => `${quoteChar}${fieldId}${quoteChar}`)
            .join(', ');
        overParts.push(`PARTITION BY ${partitionFields}`);
    }

    // Add ORDER BY if specified
    if (template.orderBy.length > 0) {
        const orderByFields = template.orderBy
            .map(({ fieldId: orderFieldId, order }) => {
                const quotedOrderFieldId = `${quoteChar}${orderFieldId}${quoteChar}`;
                const orderDirection = order === 'desc' ? 'DESC' : 'ASC';
                return `${quotedOrderFieldId} ${orderDirection}`;
            })
            .join(', ');
        overParts.push(`ORDER BY ${orderByFields}`);
    }

    // Add frame clause if specified
    if (template.frame) {
        const { frameType, start, end } = template.frame;
        const frameTypeSql = frameType.toUpperCase();

        const buildBoundary = (boundary: FrameBoundary): string => {
            switch (boundary.type) {
                case FrameBoundaryType.UNBOUNDED_PRECEDING:
                    return 'UNBOUNDED PRECEDING';
                case FrameBoundaryType.UNBOUNDED_FOLLOWING:
                    return 'UNBOUNDED FOLLOWING';
                case FrameBoundaryType.CURRENT_ROW:
                    return 'CURRENT ROW';
                case FrameBoundaryType.PRECEDING:
                    if (boundary.offset === undefined) {
                        throw new Error('PRECEDING boundary requires offset');
                    }
                    return `${boundary.offset} PRECEDING`;
                case FrameBoundaryType.FOLLOWING:
                    if (boundary.offset === undefined) {
                        throw new Error('FOLLOWING boundary requires offset');
                    }
                    return `${boundary.offset} FOLLOWING`;
                default:
                    return assertUnreachable(
                        boundary.type,
                        'Unknown frame boundary type',
                    );
            }
        };

        if (start) {
            // BETWEEN syntax
            overParts.push(
                `${frameTypeSql} BETWEEN ${buildBoundary(
                    start,
                )} AND ${buildBoundary(end)}`,
            );
        } else {
            // Single boundary syntax
            overParts.push(`${frameTypeSql} ${buildBoundary(end)}`);
        }
    }

    const overClause = overParts.join(' ');
    return `${functionCall} OVER (${overClause})`;
};

export const compileTableCalculationFromTemplate = (
    template: TableCalculationTemplate,
    warehouseSqlBuilder: WarehouseSqlBuilder,
    sortFields: MetricQuery['sorts'],
): string => {
    const quoteChar = warehouseSqlBuilder.getFieldQuoteChar();
    const floatType = warehouseSqlBuilder.getFloatingType();
    const quotedFieldId =
        'fieldId' in template
            ? `${quoteChar}${template.fieldId}${quoteChar}`
            : '';

    // Build ORDER BY clause if needed
    const buildOrderByClause = (
        calcTemplate: TableCalculationTemplate,
    ): string => {
        if (!('orderBy' in calcTemplate)) return '';

        const { orderBy } = calcTemplate;
        if (!orderBy || orderBy.length === 0) return '';

        const orderClauses = orderBy
            .map((ob) =>
                ob.order
                    ? `${quoteChar}${
                          ob.fieldId
                      }${quoteChar} ${ob.order.toUpperCase()}`
                    : `${quoteChar}${ob.fieldId}${quoteChar}`,
            )
            .join(', ');

        return `ORDER BY ${orderClauses} `;
    };

    const orderByClause = buildOrderByClause(template);
    const templateType = template.type;
    switch (templateType) {
        case TableCalculationTemplateType.PERCENT_CHANGE_FROM_PREVIOUS: {
            return (
                `(CAST(${quotedFieldId} AS ${floatType}) / ` +
                `CAST(NULLIF(LAG(${quotedFieldId}) OVER(${orderByClause}), 0) AS ${floatType})) - 1`
            );
        }

        case TableCalculationTemplateType.PERCENT_OF_PREVIOUS_VALUE: {
            return (
                `(CAST(${quotedFieldId} AS ${floatType}) / ` +
                `CAST(NULLIF(LAG(${quotedFieldId}) OVER(${orderByClause}), 0) AS ${floatType}))`
            );
        }

        case TableCalculationTemplateType.PERCENT_OF_COLUMN_TOTAL: {
            let overClause = '';
            if (template.partitionBy && template.partitionBy.length > 0) {
                const partitionFields = template.partitionBy
                    .map((fieldId) => `${quoteChar}${fieldId}${quoteChar}`)
                    .join(', ');
                overClause = `PARTITION BY ${partitionFields}`;
            }
            return (
                `(CAST(${quotedFieldId} AS ${floatType}) / ` +
                `CAST(NULLIF(SUM(${quotedFieldId}) OVER(${overClause}), 0) AS ${floatType}))`
            );
        }

        case TableCalculationTemplateType.RANK_IN_COLUMN:
            return `RANK() OVER (ORDER BY ${quotedFieldId} ASC)`;

        case TableCalculationTemplateType.RUNNING_TOTAL: {
            const orderByArgumentsSql = (sortFields || [])
                .map(
                    (sort) =>
                        `${quoteChar}${sort.fieldId}${quoteChar} ${
                            sort.descending ? 'DESC' : 'ASC'
                        }`,
                )
                .join(', ');
            const orderByClauseSql =
                orderByArgumentsSql && `ORDER BY ${orderByArgumentsSql} `; // trailing space intentional
            return `SUM(${quotedFieldId}) OVER (${orderByClauseSql}ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)`;
        }

        case TableCalculationTemplateType.WINDOW_FUNCTION:
            return compileWindowFunctionTemplate(template, quoteChar);

        default:
            return assertUnreachable(
                templateType,
                `Unknown table calculation template type`,
            );
    }
};
