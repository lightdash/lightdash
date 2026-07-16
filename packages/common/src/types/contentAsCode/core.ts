import type { FilterRule } from '../filter';

export const currentVersion = 1;

export enum ContentAsCodeType {
    CHART = 'chart',
    DASHBOARD = 'dashboard',
    SQL_CHART = 'sql_chart',
    SPACE = 'space',
    AI_AGENT = 'ai_agent',
    SCHEDULED_DELIVERY = 'scheduled_delivery',
    ALERT = 'alert',
    GOOGLE_SHEETS_SYNC = 'google_sheets_sync',
    VIRTUAL_VIEW = 'virtual_view',
}

/**
 * Permissive filter types for chart-as-code uploads where `id` may be omitted.
 * Filter IDs are auto-generated during upsert if absent.
 * After normalization these become the strict runtime types (FilterGroup, Filters).
 */
export type FilterRuleInput = Omit<FilterRule, 'id'> & { id?: string };
export type OrFilterGroupInput = {
    id?: string;
    or: Array<FilterGroupItemInput>;
};
export type AndFilterGroupInput = {
    id?: string;
    and: Array<FilterGroupItemInput>;
};
export type FilterGroupInput = OrFilterGroupInput | AndFilterGroupInput;
export type FilterGroupItemInput = FilterGroupInput | FilterRuleInput;
export type FiltersInput = {
    dimensions?: FilterGroupInput;
    metrics?: FilterGroupInput;
    tableCalculations?: FilterGroupInput;
};
