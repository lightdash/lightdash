import {
    ChartSourceType,
    ContentType,
    isChartValidationError,
    isDashboardValidationError,
    type ApiContentBulkActionBody,
    type ContentActionDelete,
    type ValidationResponse,
} from '@lightdash/common';

export type ValidationContentItem = {
    uuid: string;
    contentType: ContentType.CHART | ContentType.DASHBOARD;
    name: string;
    views: number;
};

// Table and data-app validations, and private/deleted rows, cannot be deleted
// from the Validator
export const getDeletableContentItem = (
    validationError: ValidationResponse,
): ValidationContentItem | null => {
    if (isChartValidationError(validationError) && validationError.chartUuid) {
        return {
            uuid: validationError.chartUuid,
            contentType: ContentType.CHART,
            name: validationError.name,
            views: validationError.chartViews ?? 0,
        };
    }
    if (
        isDashboardValidationError(validationError) &&
        validationError.dashboardUuid
    ) {
        return {
            uuid: validationError.dashboardUuid,
            contentType: ContentType.DASHBOARD,
            name: validationError.name,
            views: validationError.dashboardViews ?? 0,
        };
    }
    return null;
};

export const dedupeContentItems = (
    items: ValidationContentItem[],
): ValidationContentItem[] => {
    const byKey = new Map<string, ValidationContentItem>();
    items.forEach((item) => {
        byKey.set(`${item.contentType}:${item.uuid}`, item);
    });
    return [...byKey.values()];
};

export const toBulkDeletePayload = (
    items: ValidationContentItem[],
): ApiContentBulkActionBody<ContentActionDelete>['content'] =>
    items.map((item) =>
        item.contentType === ContentType.CHART
            ? {
                  uuid: item.uuid,
                  contentType: ContentType.CHART,
                  source: ChartSourceType.DBT_EXPLORE,
              }
            : {
                  uuid: item.uuid,
                  contentType: ContentType.DASHBOARD,
              },
    );
