import { subject, type Ability } from '@casl/ability';
import {
    CustomSqlQueryForbiddenError,
    hasSqlAuthoredFields,
    stripSqlBodiesFromMetricQuery,
    type MetricQuery,
} from '@lightdash/common';
import { type CaslAuditWrapper } from '../logging/caslAuditWrapper';

const canManageCustomFields = (
    ability: CaslAuditWrapper<Ability>,
    organizationUuid: string,
    projectUuid: string,
): boolean =>
    ability.can(
        'manage',
        subject('CustomFields', { organizationUuid, projectUuid }),
    );

export const hasForbiddenSqlAuthoredFields = ({
    ability,
    organizationUuid,
    projectUuid,
    metricQuery,
}: {
    ability: CaslAuditWrapper<Ability>;
    organizationUuid: string;
    projectUuid: string;
    metricQuery:
        | Pick<MetricQuery, 'customDimensions' | 'tableCalculations'>
        | null
        | undefined;
}): boolean =>
    hasSqlAuthoredFields(metricQuery) &&
    !canManageCustomFields(ability, organizationUuid, projectUuid);

export const assertCanAccessSqlAuthoredFields = ({
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
    if (!canManageCustomFields(ability, organizationUuid, projectUuid)) {
        throw new CustomSqlQueryForbiddenError(
            errorMessage ?? 'User cannot access custom SQL fields',
        );
    }
};

export const stripSqlBodiesIfForbidden = <T extends MetricQuery>({
    ability,
    organizationUuid,
    projectUuid,
    metricQuery,
}: {
    ability: CaslAuditWrapper<Ability>;
    organizationUuid: string;
    projectUuid: string;
    metricQuery: T;
}): T =>
    canManageCustomFields(ability, organizationUuid, projectUuid)
        ? metricQuery
        : stripSqlBodiesFromMetricQuery(metricQuery);
