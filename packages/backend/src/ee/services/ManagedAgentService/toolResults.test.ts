import {
    ValidationErrorType,
    ValidationSourceType,
    type ValidationResponse,
} from '@lightdash/common';
import {
    getValidationRootCauseTableName,
    summarizeManagedAgentBrokenContent,
} from './toolResults';

const base = {
    validationId: null,
    createdAt: new Date(),
    projectUuid: 'project-uuid',
};

describe('getValidationRootCauseTableName', () => {
    it('reads tableName from chart validations', () => {
        const validation: ValidationResponse = {
            ...base,
            validationUuid: 'v1',
            source: ValidationSourceType.Chart,
            name: 'Chart',
            error: "Model error: the model 'orders' no longer exists",
            errorType: ValidationErrorType.Model,
            chartUuid: 'chart-1',
            chartViews: 0,
            tableName: 'orders',
        };
        expect(getValidationRootCauseTableName(validation)).toBe('orders');
    });

    it('reads tableName from dashboard validations', () => {
        const validation: ValidationResponse = {
            ...base,
            validationUuid: 'v2',
            source: ValidationSourceType.Dashboard,
            name: 'Dashboard',
            error: "Table 'orders' no longer exists",
            errorType: ValidationErrorType.Filter,
            dashboardUuid: 'dashboard-1',
            dashboardViews: 0,
            tableName: 'orders',
        };
        expect(getValidationRootCauseTableName(validation)).toBe('orders');
    });

    it('reads the model name from table validations', () => {
        const validation: ValidationResponse = {
            ...base,
            validationUuid: 'v3',
            source: ValidationSourceType.Table,
            name: 'orders',
            error: 'Compile error',
            errorType: ValidationErrorType.Model,
        };
        expect(getValidationRootCauseTableName(validation)).toBe('orders');
    });

    it('returns null when the row has no structural model reference', () => {
        const validation: ValidationResponse = {
            ...base,
            validationUuid: 'v4',
            source: ValidationSourceType.Chart,
            name: 'Chart',
            error: "Dimension error: the field 'x' no longer exists",
            errorType: ValidationErrorType.Dimension,
            chartUuid: 'chart-1',
            chartViews: 0,
        };
        expect(getValidationRootCauseTableName(validation)).toBeNull();
    });
});

describe('summarizeManagedAgentBrokenContent', () => {
    it('groups rows by content uuid with per-content error counts', () => {
        const rows = [
            {
                uuid: 'chart-1',
                name: 'Chart one',
                type: 'chart' as const,
                error: 'error a',
                error_type: ValidationErrorType.Dimension,
                source: ValidationSourceType.Chart,
            },
            {
                uuid: 'chart-1',
                name: 'Chart one',
                type: 'chart' as const,
                error: 'error b',
                error_type: ValidationErrorType.Metric,
                source: ValidationSourceType.Chart,
            },
        ];
        const summary = summarizeManagedAgentBrokenContent(rows);
        expect(summary).toHaveLength(1);
        expect(summary[0]).toMatchObject({
            uuid: 'chart-1',
            error_count: 2,
            errors_truncated: false,
        });
    });
});
