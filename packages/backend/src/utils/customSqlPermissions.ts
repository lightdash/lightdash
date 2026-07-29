import { subject } from '@casl/ability';
import type { Ability } from '@casl/ability';
import {
    CustomSqlQueryForbiddenError,
    isCustomSqlDimension,
    isSqlTableCalculation,
    type MetricQuery,
} from '@lightdash/common';
import type { CaslAuditWrapper } from '../logging/caslAuditWrapper';

/**
 * Custom SQL dimensions and SQL table calculations inject raw SQL into the
 * compiled query, so running a client-supplied metric query that contains them
 * requires the same abilities that gate saving them.
 */
export const assertCanRunCustomSqlInMetricQuery = ({
    ability,
    metricQuery,
    organizationUuid,
    projectUuid,
}: {
    ability: CaslAuditWrapper<Ability>;
    metricQuery: Pick<MetricQuery, 'customDimensions' | 'tableCalculations'>;
    organizationUuid: string;
    projectUuid: string;
}) => {
    const hasCustomSqlDimension = (metricQuery.customDimensions ?? []).some(
        isCustomSqlDimension,
    );
    if (
        hasCustomSqlDimension &&
        ability.cannot(
            'manage',
            subject('CustomFields', { organizationUuid, projectUuid }),
        )
    ) {
        throw new CustomSqlQueryForbiddenError();
    }

    const hasSqlTableCalculation = (metricQuery.tableCalculations ?? []).some(
        isSqlTableCalculation,
    );
    if (
        hasSqlTableCalculation &&
        ability.cannot(
            'manage',
            subject('CustomSqlTableCalculations', {
                organizationUuid,
                projectUuid,
            }),
        )
    ) {
        throw new CustomSqlQueryForbiddenError(
            'User cannot run queries with SQL table calculations',
        );
    }
};
