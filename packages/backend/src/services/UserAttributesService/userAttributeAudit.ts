import {
    getErrorMessage,
    getFilterRules,
    getItemId,
    isCustomBinDimension,
    type Account,
    type CompiledDimension,
    type CompiledMetric,
    type CompiledTable,
    type Explore,
    type MetricQuery,
    type UserAttributeValueMap,
} from '@lightdash/common';
import {
    createAuditLogEvent,
    type AuditLogEvent,
    type AuditStatusType,
} from '../../logging/auditLog';
import { captureServiceCallStack } from '../../logging/callStack';
import { createActorFromAccount } from '../../logging/caslAuditWrapper';
import Logger from '../../logging/logger';
import { logAuditEvent, winstonLogger } from '../../logging/winston';
import {
    checkUserAttributesAccess,
    doesExploreMatchRequiredAttributes,
    getFilteredExplore,
} from './UserAttributeUtils';

export type UserAttributeAuditLogger = (event: AuditLogEvent) => void;

/** Actor, request context and call stack all derive from the account. */
export type UserAttributeAuditScope = {
    account: Account;
    projectUuid: string;
    auditLogger?: UserAttributeAuditLogger;
};

type AttributeRestrictions = Pick<
    CompiledTable,
    'requiredAttributes' | 'anyAttributes'
>;

type RestrictedFieldDecision = AttributeRestrictions & {
    fieldId: string;
    access: Extract<AuditStatusType, 'allowed' | 'denied'>;
    tableRequiredAttributes: CompiledTable['requiredAttributes'];
    tableAnyAttributes: CompiledTable['anyAttributes'];
};

const ACCESS_CONTROL = 'user_attributes';

const resolveSink = (
    auditLogger: UserAttributeAuditLogger | undefined,
): UserAttributeAuditLogger | null => {
    if (auditLogger) return auditLogger;
    return winstonLogger.isLevelEnabled('audit') ? logAuditEvent : null;
};

type ExploreAuditEvent = {
    scope: UserAttributeAuditScope;
    sink: UserAttributeAuditLogger;
    exploreName: string;
    metadata: Record<string, unknown>;
    status: AuditStatusType;
    reason: string | null;
};

const emitExploreEvent = ({
    scope: { account, projectUuid },
    sink,
    exploreName,
    metadata,
    status,
    reason,
}: ExploreAuditEvent): void => {
    try {
        sink(
            createAuditLogEvent(
                createActorFromAccount(account),
                'view',
                {
                    type: 'Explore',
                    organizationUuid:
                        account.organization.organizationUuid || 'unknown',
                    projectUuid,
                    metadata: {
                        exploreName,
                        accessControl: ACCESS_CONTROL,
                        ...metadata,
                    },
                },
                {
                    ip: account.requestContext?.ip,
                    userAgent: account.requestContext?.userAgent,
                    requestId: account.requestContext?.requestId,
                },
                status,
                reason ?? undefined,
                undefined,
                captureServiceCallStack(),
            ),
        );
    } catch (error) {
        Logger.warn('Failed to write user attribute audit event', {
            error: getErrorMessage(error),
            exploreName,
        });
    }
};

const hasAttributeRestriction = (restrictions: AttributeRestrictions) =>
    restrictions.requiredAttributes !== undefined ||
    restrictions.anyAttributes !== undefined;

const getUnsatisfiedAttributes = (
    restrictions: AttributeRestrictions,
    userAttributes: UserAttributeValueMap,
): string[] => {
    const unsatisfiedRequired = Object.entries(
        restrictions.requiredAttributes ?? {},
    )
        .filter(
            ([name, value]) =>
                !checkUserAttributesAccess(
                    { [name]: value },
                    undefined,
                    userAttributes,
                ),
        )
        .map(([name]) => name);
    const anySatisfied =
        restrictions.anyAttributes === undefined ||
        checkUserAttributesAccess(
            undefined,
            restrictions.anyAttributes,
            userAttributes,
        );
    return [
        ...unsatisfiedRequired,
        ...(anySatisfied ? [] : Object.keys(restrictions.anyAttributes ?? {})),
    ];
};

/**
 * Records whether the actor satisfies the explore's base-table attribute
 * restrictions and returns that decision. Unrestricted explores are not a
 * decision, so they emit nothing.
 */
export const auditExploreAttributeAccess = ({
    explore,
    userAttributes,
    ...scope
}: UserAttributeAuditScope & {
    explore: Explore;
    userAttributes: UserAttributeValueMap;
}): boolean => {
    const baseTable = explore.tables[explore.baseTable];
    const allowed = doesExploreMatchRequiredAttributes(
        baseTable?.requiredAttributes,
        baseTable?.anyAttributes,
        userAttributes,
    );
    const sink = resolveSink(scope.auditLogger);
    if (!sink || !baseTable || !hasAttributeRestriction(baseTable)) {
        return allowed;
    }
    emitExploreEvent({
        scope,
        sink,
        exploreName: explore.name,
        metadata: {
            requiredAttributes: baseTable.requiredAttributes,
            anyAttributes: baseTable.anyAttributes,
            unsatisfiedAttributes: allowed
                ? []
                : getUnsatisfiedAttributes(baseTable, userAttributes),
        },
        status: allowed ? 'allowed' : 'denied',
        reason: allowed
            ? null
            : `User attributes do not satisfy the restrictions on explore "${explore.name}"`,
    });
    return allowed;
};

/** `getFilteredExplore` with the base-table decision written to the audit log. */
export const auditAndFilterExplore = (
    args: UserAttributeAuditScope & {
        explore: Explore;
        userAttributes: UserAttributeValueMap;
    },
): Explore => {
    auditExploreAttributeAccess(args);
    return getFilteredExplore(args.explore, args.userAttributes);
};

type IndexedField = {
    field: CompiledDimension | CompiledMetric;
    table: CompiledTable;
};

const indexFieldsByItemId = (
    tables: Explore['tables'],
): Record<string, IndexedField> =>
    Object.values(tables).reduce<Record<string, IndexedField>>((acc, table) => {
        if (!table) return acc;
        [
            ...Object.values(table.dimensions),
            ...Object.values(table.metrics),
        ].forEach((field) => {
            if (field) acc[getItemId(field)] = { field, table };
        });
        return acc;
    }, {});

export const getMetricQueryFieldIds = (metricQuery: MetricQuery): string[] => [
    ...new Set([
        ...metricQuery.dimensions,
        ...metricQuery.metrics,
        ...metricQuery.sorts.map(({ fieldId }) => fieldId),
        ...getFilterRules(metricQuery.filters).map(
            ({ target }) => target.fieldId,
        ),
        ...(metricQuery.customDimensions ?? [])
            .filter(isCustomBinDimension)
            .map(({ dimensionId }) => dimensionId),
        ...(metricQuery.additionalMetrics ?? []).flatMap(
            ({ table, baseDimensionName }) =>
                baseDimensionName ? [`${table}_${baseDimensionName}`] : [],
        ),
    ]),
];

/** `explore` must be the attribute-filtered one: a field present in
 *  `unfilteredTables` but missing from `tables` was hidden by user attributes. */
export const auditFieldAttributeAccess = ({
    explore,
    fieldIds,
    ...scope
}: UserAttributeAuditScope & {
    explore: Explore;
    fieldIds: string[];
}): void => {
    const sink = resolveSink(scope.auditLogger);
    if (!sink || !explore.unfilteredTables) return;

    const unfiltered = indexFieldsByItemId(explore.unfilteredTables);
    const visible = indexFieldsByItemId(explore.tables);
    const decisions = [...new Set(fieldIds)].flatMap<RestrictedFieldDecision>(
        (fieldId) => {
            const entry = unfiltered[fieldId];
            if (!entry) return [];
            const hidden = visible[fieldId] === undefined;
            if (
                !hidden &&
                !hasAttributeRestriction(entry.field) &&
                !hasAttributeRestriction(entry.table)
            ) {
                return [];
            }
            return [
                {
                    fieldId,
                    access: hidden ? 'denied' : 'allowed',
                    requiredAttributes: entry.field.requiredAttributes,
                    anyAttributes: entry.field.anyAttributes,
                    tableRequiredAttributes: entry.table.requiredAttributes,
                    tableAnyAttributes: entry.table.anyAttributes,
                },
            ];
        },
    );
    if (decisions.length === 0) return;

    const deniedFieldIds = decisions
        .filter(({ access }) => access === 'denied')
        .map(({ fieldId }) => fieldId);
    emitExploreEvent({
        scope,
        sink,
        exploreName: explore.name,
        metadata: { fields: decisions, deniedFieldIds },
        status: deniedFieldIds.length > 0 ? 'denied' : 'allowed',
        reason:
            deniedFieldIds.length > 0
                ? `User attributes do not satisfy the restrictions on ${
                      deniedFieldIds.length === 1 ? 'field' : 'fields'
                  } ${deniedFieldIds.join(', ')}`
                : null,
    });
};

export const auditMetricQueryAttributeAccess = ({
    metricQuery,
    ...args
}: UserAttributeAuditScope & {
    explore: Explore;
    metricQuery: MetricQuery;
}): void =>
    auditFieldAttributeAccess({
        ...args,
        fieldIds: getMetricQueryFieldIds(metricQuery),
    });
