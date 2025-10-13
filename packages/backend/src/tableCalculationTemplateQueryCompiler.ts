import {
    assertUnreachable,
    TableCalculationTemplate,
    TableCalculationTemplateType,
    WindowFunctionType,
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

    const overClause = overParts.join(' ');
    return `${functionCall} OVER (${overClause})`;
};

export const compileTableCalculationFromTemplate = (
    template: TableCalculationTemplate,
    warehouseSqlBuilder: WarehouseSqlBuilder,
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
            return `SUM(${quotedFieldId}) OVER (ORDER BY ${quotedFieldId} DESC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)`;
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
