import {
    getErrorMessage,
    getFilterRules,
    getItemId,
    isAccount,
    isCustomBinDimension,
    type Account,
    type CompiledDimension,
    type CompiledMetric,
    type CompiledTable,
    type Explore,
    type MetricQuery,
    type SessionUser,
    type UserAttributeValueMap,
} from '@lightdash/common';
import {
    createAuditLogEvent,
    type AuditActor,
    type AuditContext,
    type AuditLogEvent,
    type AuditStatusType,
} from '../../logging/auditLog';
import { captureServiceCallStack } from '../../logging/callStack';
import {
    createActorFromAccount,
    createActorFromUser,
} from '../../logging/caslAuditWrapper';
import Logger from '../../logging/logger';
import { logAuditEvent, winstonLogger } from '../../logging/winston';
import {
    checkUserAttributesAccess,
    doesExploreMatchRequiredAttributes,
    getFilteredExplore,
} from './UserAttributeUtils';

export type UserAttributeAuditLogger = (event: AuditLogEvent) => void;

/**
 * Who is asking and where. The actor, IP, user agent and request id come from
 * the account so a denial can be tied back to the HTTP request that caused it.
 */
export type UserAttributeAuditScope = {
    account: Account | SessionUser;
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

const resolveActor = (account: Account | SessionUser): AuditActor =>
    isAccount(account)
        ? createActorFromAccount(account)
        : createActorFromUser(account);

const resolveContext = (account: Account | SessionUser): AuditContext => ({
    ip: account.requestContext?.ip,
    userAgent: account.requestContext?.userAgent,
    requestId: account.requestContext?.requestId,
});

const resolveOrganizationUuid = (account: Account | SessionUser): string =>
    (isAccount(account)
        ? account.organization.organizationUuid
        : account.organizationUuid) || 'unknown';

const emitExploreEvent = (
    scope: UserAttributeAuditScope,
    sink: UserAttributeAuditLogger,
    exploreName: string,
    metadata: Record<string, unknown>,
    status: AuditStatusType,
    reason?: string,
): void => {
    try {
        sink(
            createAuditLogEvent(
                resolveActor(scope.account),
                'view',
                {
                    type: 'Explore',
                    organizationUuid: resolveOrganizationUuid(scope.account),
                    projectUuid: scope.projectUuid,
                    metadata: {
                        exploreName,
                        accessControl: ACCESS_CONTROL,
                        ...metadata,
                    },
                },
                resolveContext(scope.account),
                status,
                reason,
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
    emitExploreEvent(
        scope,
        sink,
        explore.name,
        {
            requiredAttributes: baseTable.requiredAttributes,
            anyAttributes: baseTable.anyAttributes,
            unsatisfiedAttributes: allowed
                ? []
                : getUnsatisfiedAttributes(baseTable, userAttributes),
        },
        allowed ? 'allowed' : 'denied',
        allowed
            ? undefined
            : `User attributes do not satisfy the restrictions on explore "${explore.name}"`,
    );
    return allowed;
};

/** `getFilteredExplore` with the base-table decision written to the audit log. */
export const getFilteredExploreForAccount = (
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

/**
 * Records which of the requested fields are attribute-restricted and whether
 * the actor can see each one. `explore` must be the attribute-filtered
 * explore: a field present in `unfilteredTables` but missing from `tables`
 * was hidden by user attributes, so requesting it is a denial. A query that
 * touches no restricted field emits nothing.
 */
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
    emitExploreEvent(
        scope,
        sink,
        explore.name,
        { fields: decisions, deniedFieldIds },
        deniedFieldIds.length > 0 ? 'denied' : 'allowed',
        deniedFieldIds.length > 0
            ? `User attributes do not satisfy the restrictions on ${
                  deniedFieldIds.length === 1 ? 'field' : 'fields'
              } ${deniedFieldIds.join(', ')}`
            : undefined,
    );
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
