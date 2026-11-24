import {
    describeWarehouseTableToolDefinition,
    METRIC_VIEW_TABLE_TYPE,
    type ToolDescribeWarehouseTableStructuredContent,
    type WarehouseMetricViewDefinition,
    type WarehouseTableMetadata,
} from '@lightdash/common';
import { tool } from 'ai';
import type { DescribeWarehouseTableFn } from '../types/aiAgentDependencies';
import { formatPartitioning } from '../utils/partitionGuidance';
import type {
    ExecuteStructuredToolResult,
    ExecuteToolErrorResult,
} from '../utils/structuredToolResult';
import { toolErrorOutput } from '../utils/toolErrorHandler';

type Dependencies = {
    describeWarehouseTable: DescribeWarehouseTableFn;
};

type ExecuteResult =
    | ExecuteStructuredToolResult<
          ToolDescribeWarehouseTableStructuredContent,
          { status: 'success' | 'not_found' }
      >
    | ExecuteToolErrorResult;

type DefinedField = WarehouseMetricViewDefinition['measures'][number];

const formatDefinedField = (field: DefinedField): string[] => [
    ...(field.synonyms.length > 0
        ? [`Synonyms: ${field.synonyms.join(', ')}`]
        : []),
    `Defined as: ${field.expr}`,
    ...field.window.map((window) =>
        [
            `Window: order by ${window.order}, range ${window.range}`,
            ...(window.semiAdditive
                ? [`semi-additive ${window.semiAdditive}`]
                : []),
            ...(window.offset ? [`offset ${window.offset}`] : []),
        ].join(', '),
    ),
];

const formatMetricViewSource = (
    metricView: WarehouseMetricViewDefinition,
): string[] => [
    ...(metricView.source ? [`Metric view source: ${metricView.source}`] : []),
    ...(metricView.filter ? [`Metric view filter: ${metricView.filter}`] : []),
    ...metricView.joins.map(
        (join) =>
            `Metric view join ${join.name}: ${join.source} ${join.on ? `on ${join.on}` : `using ${join.using.join(', ')}`}`,
    ),
    ...(metricView.parameterized
        ? [
              'This metric view takes parameters, so it is queried as a table function with named arguments.',
          ]
        : []),
];

const formatTags = (tags: WarehouseTableMetadata['tags']): string =>
    tags
        .map(({ name, value }) => (value === null ? name : `${name}=${value}`))
        .join(', ');

const formatKeysAndAccess = (metadata: WarehouseTableMetadata): string[] => {
    const tableTags = metadata.tags.filter(({ column }) => column === null);
    return [
        ...(metadata.primaryKey
            ? [`Primary key: ${metadata.primaryKey.join(', ')}`]
            : []),
        ...metadata.foreignKeys.map(
            (key) =>
                `Foreign key: (${key.columns.join(', ')}) references ${key.referencedTable} (${key.referencedColumns.join(', ')})`,
        ),
        ...(tableTags.length > 0
            ? [`Table tags: ${formatTags(tableTags)}`]
            : []),
        ...(metadata.partitionColumns.length > 0
            ? [`Partition columns: ${metadata.partitionColumns.join(', ')}`]
            : []),
        ...(metadata.hasRowFilter
            ? ['A row filter applies, so results depend on who queries.']
            : []),
        ...(metadata.hasColumnMasks
            ? ['Column masks apply, so some values may be masked.']
            : []),
    ];
};

const toolDefinition = describeWarehouseTableToolDefinition.for('agent');

export const getDescribeWarehouseTable = ({
    describeWarehouseTable,
}: Dependencies) =>
    tool({
        ...toolDefinition,
        execute: async ({
            table,
            schema,
            database,
        }): Promise<ExecuteResult> => {
            try {
                const {
                    columns,
                    resolvedSchema,
                    resolvedDatabase,
                    partitioning,
                    metadata,
                    warehouseType,
                } = await describeWarehouseTable({
                    table,
                    schema: schema ?? null,
                    database: database ?? null,
                });

                const qualifiedName = [
                    resolvedDatabase ?? database,
                    resolvedSchema ?? schema ?? '(default schema)',
                    table,
                ]
                    .filter(
                        (part) =>
                            part !== null && part !== undefined && part !== '',
                    )
                    .join('.');

                const structuredContent: ToolDescribeWarehouseTableStructuredContent =
                    {
                        qualifiedName,
                        columnCount: columns.length,
                        columns: columns.map(({ name, type, nativeType }) => ({
                            name,
                            type: nativeType ? `${type} (${nativeType})` : type,
                        })),
                        partitioning,
                        metadata,
                    };

                if (structuredContent.columnCount === 0) {
                    return {
                        result: `No columns found for \`${qualifiedName}\`. The table may not exist or may be empty of metadata. Confirm the name via listWarehouseTables or ask the user.`,
                        metadata: { status: 'not_found' },
                        structuredContent,
                    };
                }

                const described = new Map(
                    (metadata?.columns ?? []).map((c) => [c.name, c]),
                );
                const metricView = metadata?.metricView ?? null;
                const definedFields = new Map<string, DefinedField>(
                    [
                        ...(metricView?.dimensions ?? []).map((field) => ({
                            ...field,
                            window: [],
                        })),
                        ...(metricView?.measures ?? []),
                    ].map((field) => [field.name, field]),
                );
                const lines = [
                    `Columns for \`${qualifiedName}\` (${structuredContent.columnCount}):`,
                    ...(metadata
                        ? [
                              `Table type: ${metadata.tableType.replace(/_/g, ' ')}`,
                          ]
                        : []),
                    ...(metadata?.comment
                        ? [`Table comment: ${metadata.comment}`]
                        : []),
                    ...(partitioning
                        ? [formatPartitioning(partitioning, warehouseType)]
                        : []),
                    ...(metadata ? formatKeysAndAccess(metadata) : []),
                    ...structuredContent.columns.map((c) => {
                        const column = described.get(c.name);
                        const defined = definedFields.get(c.name);
                        const comment = column?.comment ?? defined?.comment;
                        const columnTags = (metadata?.tags ?? []).filter(
                            (tag) => tag.column === c.name,
                        );
                        return [
                            `  - ${c.name}: ${c.type}`,
                            ...(column?.isMeasure ? ['Measure'] : []),
                            ...(defined?.label
                                ? [`Label: ${defined.label}`]
                                : []),
                            ...(comment ? [`Comment: ${comment}`] : []),
                            ...(columnTags.length > 0
                                ? [`Tags: ${formatTags(columnTags)}`]
                                : []),
                            ...(defined ? formatDefinedField(defined) : []),
                        ].join('. ');
                    }),
                    ...(metricView ? formatMetricViewSource(metricView) : []),
                    // The parsed fields above replace the raw YAML, which can be cut short
                    ...(metadata?.definition && !metricView
                        ? [
                              `${metadata.tableType === METRIC_VIEW_TABLE_TYPE ? 'Metric view' : 'View'} definition:`,
                              metadata.definition.text,
                          ]
                        : []),
                ];

                return {
                    result: lines.join('\n'),
                    metadata: { status: 'success' },
                    structuredContent,
                };
            } catch (e) {
                return toolErrorOutput(e, 'Error describing warehouse table.');
            }
        },
    });
