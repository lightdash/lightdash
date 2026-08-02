import { type DashboardFilterRule } from '../../types/filter';
import {
    type AiDashboardFilterRule,
    type AiDashboardFilters,
} from './requestTypes';

type AiDashboardFilterRuleInput = AiDashboardFilterRule &
    Partial<
        Pick<
            DashboardFilterRule,
            'id' | 'tileTargets' | 'lockedTabUuids' | 'requiredGroupId'
        >
    >;

type AiDashboardFiltersInput = {
    dimensions: AiDashboardFilterRuleInput[];
    metrics: AiDashboardFilterRuleInput[];
    tableCalculations: AiDashboardFilterRuleInput[];
};

const serializeDashboardFilterRuleForAiContext = ({
    id: _id,
    tileTargets: _tileTargets,
    lockedTabUuids: _lockedTabUuids,
    requiredGroupId: _requiredGroupId,
    ...filter
}: AiDashboardFilterRuleInput): AiDashboardFilterRule => filter;

export const serializeDashboardFiltersForAiContext = (
    filters: AiDashboardFiltersInput,
): AiDashboardFilters => ({
    dimensions: filters.dimensions.map(
        serializeDashboardFilterRuleForAiContext,
    ),
    metrics: filters.metrics.map(serializeDashboardFilterRuleForAiContext),
    tableCalculations: filters.tableCalculations.map(
        serializeDashboardFilterRuleForAiContext,
    ),
});
