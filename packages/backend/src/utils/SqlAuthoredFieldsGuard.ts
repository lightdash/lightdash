import { subject, type Ability } from '@casl/ability';
import {
    CustomSqlQueryForbiddenError,
    hasSqlAuthoredFields,
    type MetricQuery,
} from '@lightdash/common';
import { type CaslAuditWrapper } from '../logging/caslAuditWrapper';

export const assertCanWriteSqlAuthoredFields = ({
    ability,
    organizationUuid,
    projectUuid,
    metricQuery,
    errorMessage,
}: {
    ability: CaslAuditWrapper<Ability>;
    organizationUuid: string;
    projectUuid: string;
    metricQuery:
        | Pick<MetricQuery, 'customDimensions' | 'tableCalculations'>
        | null
        | undefined;
    errorMessage?: string;
}): void => {
    if (!hasSqlAuthoredFields(metricQuery)) return;
    if (
        ability.cannot(
            'manage',
            subject('CustomFields', { organizationUuid, projectUuid }),
        )
    ) {
        throw new CustomSqlQueryForbiddenError(
            errorMessage ?? 'User cannot save queries with custom SQL fields',
        );
    }
};
