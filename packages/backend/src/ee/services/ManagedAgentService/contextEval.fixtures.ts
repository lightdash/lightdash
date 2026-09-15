import {
    ValidationErrorType,
    ValidationSourceType,
    type ValidationResponse,
} from '@lightdash/common';
import { ValidationService } from '../../../services/ValidationService/ValidationService';
import {
    formatManagedAgentBrokenContentPage,
    formatManagedAgentToolListResult,
    MANAGED_AGENT_BROKEN_CONTENT_GROUP_ITEM_LIMIT,
    summarizeManagedAgentBrokenContent,
} from './toolResults';

export const createAutopilotContextFixture = (
    scenario: 'shared-model' | 'many-models' | 'pagination',
) => {
    const validations = Array.from({ length: 350 }, (_, chart) =>
        Array.from(
            { length: scenario === 'shared-model' ? 12 : 1 },
            (_unusedField, field) => ({
                validationId: null,
                validationUuid: `validation-${chart}-${field}`,
                createdAt: new Date('2026-01-01T00:00:00Z'),
                projectUuid: 'context-fixture',
                source: ValidationSourceType.Chart,
                name: `Regional revenue by product and customer segment ${chart}`,
                chartUuid: `chart-${chart}`,
                chartViews: 0,
                tableName:
                    scenario === 'many-models' ? `orders_${chart}` : 'orders',
                fieldName: `legacy_revenue_${field}`,
                errorType: ValidationErrorType.Dimension,
                error: `Dimension error: the field legacy_revenue_${field} no longer exists in the compiled model. Review the semantic definition before replacing or removing this field.`,
            }),
        ),
    ).flat() satisfies ValidationResponse[];
    const summary = ValidationService.groupValidationsByRootCause(validations);
    const broken = JSON.stringify({
        total_errors: summary.totalErrors,
        total_affected_items: summary.totalAffectedItems,
        groups: summary.groups.map((group) => ({
            group_key: group.groupKey,
            error_type: group.errorType,
            table_name: group.tableName,
            field_name: group.fieldName,
            error_count: group.errorCount,
            affected_charts: group.affectedCharts,
            affected_dashboards: group.affectedDashboards,
            affected_tables: group.affectedTables,
            affected_data_apps: group.affectedDataApps,
            sample_error: group.sampleError,
            items: group.affectedContent
                .slice(0, MANAGED_AGENT_BROKEN_CONTENT_GROUP_ITEM_LIMIT)
                .map((content) => ({
                    uuid: content.uuid,
                    name: content.name,
                    source: content.source,
                    views: content.views,
                    error_count: content.errorCount,
                })),
            items_truncated:
                group.affectedContent.length < group.affectedCharts ||
                group.affectedContent.length >
                    MANAGED_AGENT_BROKEN_CONTENT_GROUP_ITEM_LIMIT,
        })),
        note: 'Complete set of validation error groups. Use table_name for capped content details. This synthetic fixture grants visibility to every item.',
    });
    const detail = (tableName: string, cursor: string | null = null) =>
        formatManagedAgentBrokenContentPage(
            summarizeManagedAgentBrokenContent(
                validations
                    .filter((row) => row.tableName === tableName)
                    .map((row) => ({
                        uuid: row.chartUuid,
                        name: row.name,
                        type: 'chart' as const,
                        error: row.error,
                        error_type: row.errorType,
                        source: row.source,
                    })),
            ),
            100,
            cursor,
        );
    const staleDashboards = formatManagedAgentToolListResult(
        Array.from({ length: 12 }, (_, index) => ({
            uuid: `dashboard-${index}`,
            name: `Archived regional sales dashboard ${index}`,
            type: 'dashboard',
            last_viewed_at: null,
            views_count: 0,
            reason: 'Never viewed; created more than 90 days ago',
            created_by: 'Synthetic benchmark user',
            created_at: '2025-01-01T00:00:00Z',
        })),
    );
    return {
        broken,
        detail,
        staleDashboards,
        detailTable: scenario === 'many-models' ? 'orders_0' : 'orders',
    };
};
