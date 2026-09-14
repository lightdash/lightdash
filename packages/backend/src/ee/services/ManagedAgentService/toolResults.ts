import {
    isChartValidationError,
    isDashboardValidationError,
    isDataAppValidationError,
    type ValidationResponse,
} from '@lightdash/common';

export const MANAGED_AGENT_TOOL_RESULT_ITEM_LIMIT = 100;
export const MANAGED_AGENT_BROKEN_CONTENT_ERROR_LIMIT = 10;
export const MANAGED_AGENT_BROKEN_CONTENT_GROUP_ITEM_LIMIT = 10;
export const MANAGED_AGENT_BULK_DELETE_RUN_LIMIT = 25;
export const MANAGED_AGENT_SOFT_DELETE_RUN_LIMIT = 25;

// Root-cause model of a validation row. Guard order matters: table responses
// are structurally assignable from the others, so they are the fallback.
export const getValidationRootCauseTableName = (
    validation: ValidationResponse,
): string | null => {
    if (isChartValidationError(validation)) {
        return validation.tableName ?? null;
    }
    if (isDashboardValidationError(validation)) {
        return validation.tableName ?? null;
    }
    if (isDataAppValidationError(validation)) {
        return validation.modelName ?? null;
    }
    return validation.name ?? null;
};

export const getManagedAgentToolResultLimit = (
    requestedLimit: unknown,
    defaultLimit: number,
): number => {
    if (
        typeof requestedLimit !== 'number' ||
        !Number.isFinite(requestedLimit)
    ) {
        return defaultLimit;
    }

    return Math.min(
        Math.max(Math.floor(requestedLimit), 1),
        MANAGED_AGENT_TOOL_RESULT_ITEM_LIMIT,
    );
};

type ManagedAgentToolListResult<T> = {
    items: T[];
    total_count: number;
    returned_count: number;
    truncated: boolean;
    omitted_count: number;
};

export const buildManagedAgentToolListResult = <T>(
    items: T[],
    limit = MANAGED_AGENT_TOOL_RESULT_ITEM_LIMIT,
): ManagedAgentToolListResult<T> => {
    const limitedItems = items.slice(0, limit);
    return {
        items: limitedItems,
        total_count: items.length,
        returned_count: limitedItems.length,
        truncated: items.length > limitedItems.length,
        omitted_count: Math.max(items.length - limitedItems.length, 0),
    };
};

export const formatManagedAgentToolListResult = <T>(
    items: T[],
    limit = MANAGED_AGENT_TOOL_RESULT_ITEM_LIMIT,
): string => JSON.stringify(buildManagedAgentToolListResult(items, limit));

type ManagedAgentBrokenContentItem = {
    uuid: string;
    name: string;
    type: 'chart' | 'dashboard';
    source: ValidationResponse['source'];
    error_count: number;
    errors: {
        error: string;
        error_type: ValidationResponse['errorType'];
    }[];
    errors_truncated: boolean;
};

export const summarizeManagedAgentBrokenContent = (
    validations: {
        uuid: string;
        name: string;
        type: 'chart' | 'dashboard';
        error: string;
        error_type: ValidationResponse['errorType'];
        source: ValidationResponse['source'];
    }[],
): ManagedAgentBrokenContentItem[] => {
    const byContentUuid = new Map<string, ManagedAgentBrokenContentItem>();

    validations.forEach((validation) => {
        const existing = byContentUuid.get(validation.uuid);
        if (!existing) {
            byContentUuid.set(validation.uuid, {
                uuid: validation.uuid,
                name: validation.name,
                type: validation.type,
                source: validation.source,
                error_count: 1,
                errors: [
                    {
                        error: validation.error,
                        error_type: validation.error_type,
                    },
                ],
                errors_truncated: false,
            });
            return;
        }

        existing.error_count += 1;
        if (existing.errors.length < MANAGED_AGENT_BROKEN_CONTENT_ERROR_LIMIT) {
            existing.errors.push({
                error: validation.error,
                error_type: validation.error_type,
            });
        } else {
            existing.errors_truncated = true;
        }
    });

    return [...byContentUuid.values()];
};
