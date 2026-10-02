import {
    Account,
    FeatureFlags,
    QueryCredentialKind,
    QueryRefusalReason,
    QuerySurface,
} from '@lightdash/common';
import { createHash } from 'node:crypto';
import type { LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import { createAuditLogEvent } from '../../logging/auditLog';
import { createActorFromAccount } from '../../logging/caslAuditWrapper';
import Logger from '../../logging/logger';
import { logAuditEvent } from '../../logging/winston';
import type { FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';

export const recordQueryRefusal = async ({
    account,
    featureFlagModel,
    analytics,
    organizationUuid,
    projectUuid,
    surface,
    aiClient,
    warehouseConnectionUuid,
    credentialKind,
    credentialUuid,
    reason,
    sql,
}: {
    account: Account;
    featureFlagModel: Pick<FeatureFlagModel, 'get'>;
    analytics: Pick<LightdashAnalytics, 'track'>;
    organizationUuid: string;
    projectUuid: string;
    surface: QuerySurface;
    aiClient: string | null;
    warehouseConnectionUuid: string | null;
    credentialKind: QueryCredentialKind | null;
    credentialUuid: string | null;
    reason: QueryRefusalReason;
    sql: string | null;
}): Promise<void> => {
    let enabled: boolean;
    try {
        ({ enabled } = await featureFlagModel.get({
            user: {
                organizationUuid,
                ...(account.isRegisteredUser()
                    ? { userUuid: account.user.id }
                    : {}),
            },
            featureFlagId: FeatureFlags.QueryProvenance,
        }));
    } catch (error) {
        Logger.warn('Failed to resolve query refusal flag', { error });
        return;
    }
    if (!enabled) return;

    const sqlHash = sql ? createHash('sha256').update(sql).digest('hex') : null;
    try {
        logAuditEvent(
            createAuditLogEvent(
                createActorFromAccount(account),
                'query.refused',
                {
                    type: 'query',
                    organizationUuid,
                    projectUuid,
                    metadata: {
                        surface,
                        aiClient,
                        warehouseConnectionUuid,
                        credentialKind,
                        credentialUuid,
                        sqlHash,
                    },
                },
                {},
                'denied',
                reason,
            ),
        );
    } catch (error) {
        Logger.warn('Failed to audit query refusal', { error });
    }
    try {
        analytics.track({
            ...(account.isRegisteredUser()
                ? { userId: account.user.id }
                : { anonymousId: account.user.id }),
            event: 'query.refused',
            properties: {
                organizationUuid,
                projectUuid,
                userUuid: account.isRegisteredUser() ? account.user.id : null,
                surface,
                aiClient,
                warehouseConnectionUuid,
                credentialKind,
                credentialUuid,
                reason,
                sqlHash,
            },
        });
    } catch (error) {
        Logger.warn('Failed to track query refusal', { error });
    }
};
