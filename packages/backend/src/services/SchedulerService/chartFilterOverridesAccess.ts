import { subject, type Ability } from '@casl/ability';
import {
    doChartFilterOverridesReplaceSavedRules,
    ForbiddenError,
    type Filters,
    type MetricQuery,
} from '@lightdash/common';
import { type CaslAuditWrapper } from '../../logging/caslAuditWrapper';

type ChartFilterSource = {
    organizationUuid: string;
    projectUuid: string;
    metricQuery: Pick<MetricQuery, 'filters'>;
};

/**
 * A delivery that replaces a chart's saved filter shows rows the chart author
 * filtered out. Only someone who could run that query on the explore anyway
 * may set it up, so the delivery can never widen what its creator can see.
 * Overrides that only add filters (threshold alerts) narrow and stay open.
 */
export const assertCanReplaceChartFilters = ({
    ability,
    chart,
    schedulerFilters,
}: {
    ability: Pick<CaslAuditWrapper<Ability>, 'cannot'>;
    chart: ChartFilterSource;
    schedulerFilters: Filters | undefined;
}): void => {
    if (!schedulerFilters) return;
    if (
        !doChartFilterOverridesReplaceSavedRules(
            chart.metricQuery.filters,
            schedulerFilters,
        )
    ) {
        return;
    }
    if (
        ability.cannot(
            'manage',
            subject('Explore', {
                organizationUuid: chart.organizationUuid,
                projectUuid: chart.projectUuid,
            }),
        )
    ) {
        throw new ForbiddenError(
            "Adjusting a chart's saved filters for a delivery requires explore access to the project",
        );
    }
};
