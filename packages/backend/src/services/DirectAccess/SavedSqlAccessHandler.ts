import type { SessionUser, SpaceMemberRole } from '@lightdash/common';
import type {
    SavedSqlAccessModel,
    SavedSqlMutationExpectation,
} from '../../models/SavedSqlAccessModel';
import { canReceiveSavedSqlDirectAccess } from '../../models/SavedSqlAccessModel';
import type { SavedSqlModel } from '../../models/SavedSqlModel';
import type { SpacePermissionService } from '../SpaceService/SpacePermissionService';
import {
    BaseResourceAccessHandler,
    type DirectAccessResourceAdapter,
    type DirectAccessTarget,
} from './BaseResourceAccessHandler';
import type { DirectAccessAuditLogger } from './directAccessAudit';
import type { DirectAccessFeatureGate } from './DirectAccessFeatureGate';
import type { ResourceAccessInput } from './ResourceAccessHandler';

type SavedSqlAccessTarget = DirectAccessTarget & {
    storedSpaceUuid: string | null;
    dashboardUuid: string | null;
};

class SavedSqlAccessAdapter implements DirectAccessResourceAdapter<SavedSqlAccessTarget> {
    readonly auditResourceType = 'SavedSql';

    constructor(
        private readonly accessModel: SavedSqlAccessModel,
        private readonly savedSqlModel: SavedSqlModel,
    ) {}

    async getTarget({
        projectUuid,
        resourceUuid,
    }: ResourceAccessInput): Promise<SavedSqlAccessTarget> {
        const chart = await this.savedSqlModel.getByUuid(resourceUuid, {
            projectUuid,
        });
        const dashboardUuid = chart.dashboard?.uuid ?? null;
        const spaceUuid = dashboardUuid === null ? chart.space.uuid : null;
        return {
            resourceUuid: chart.savedSqlUuid,
            organizationUuid: chart.organization.organizationUuid,
            projectUuid: chart.project.projectUuid,
            spaceUuid: chart.space.uuid,
            storedSpaceUuid: spaceUuid,
            dashboardUuid,
            accessTarget: dashboardUuid
                ? {
                      type: 'dashboard',
                      dashboardUuid,
                      spaceUuid: chart.space.uuid,
                  }
                : {
                      type: 'sqlChart',
                      savedSqlUuid: chart.savedSqlUuid,
                      spaceUuid: chart.space.uuid,
                  },
            canReceiveDirectAccess: canReceiveSavedSqlDirectAccess({
                spaceUuid,
                dashboardUuid,
            }),
        };
    }

    private static expectation(
        target: SavedSqlAccessTarget,
    ): SavedSqlMutationExpectation {
        return {
            organizationUuid: target.organizationUuid,
            projectUuid: target.projectUuid,
            spaceUuid: target.storedSpaceUuid,
            dashboardUuid: target.dashboardUuid,
        };
    }

    getDirectAccessList(
        target: SavedSqlAccessTarget,
        options: Parameters<SavedSqlAccessModel['getDirectAccessList']>[3],
    ) {
        return this.accessModel.getDirectAccessList(
            target.resourceUuid,
            target.organizationUuid,
            target.projectUuid,
            options,
        );
    }

    getGroupRolesForUsers(target: SavedSqlAccessTarget, userUuids: string[]) {
        return this.accessModel.getGroupRolesForUsers(
            target.resourceUuid,
            target.organizationUuid,
            target.projectUuid,
            userUuids,
        );
    }

    upsertUserAccess(
        target: SavedSqlAccessTarget,
        input: { userUuid: string; role: SpaceMemberRole; actor: SessionUser },
    ) {
        return this.accessModel.upsertUserAccess({
            resourceUuid: target.resourceUuid,
            userUuid: input.userUuid,
            role: input.role,
            grantedByUserUuid: input.actor.userUuid,
            ...SavedSqlAccessAdapter.expectation(target),
        });
    }

    upsertGroupAccess(
        target: SavedSqlAccessTarget,
        input: {
            groupUuid: string;
            role: SpaceMemberRole;
            actor: SessionUser;
        },
    ) {
        return this.accessModel.upsertGroupAccess({
            resourceUuid: target.resourceUuid,
            groupUuid: input.groupUuid,
            role: input.role,
            grantedByUserUuid: input.actor.userUuid,
            ...SavedSqlAccessAdapter.expectation(target),
        });
    }

    revokeUserAccess(
        target: SavedSqlAccessTarget,
        input: { userUuid: string },
    ) {
        return this.accessModel.revokeUserAccess({
            resourceUuid: target.resourceUuid,
            userUuid: input.userUuid,
            ...SavedSqlAccessAdapter.expectation(target),
        });
    }

    revokeGroupAccess(
        target: SavedSqlAccessTarget,
        input: { groupUuid: string },
    ) {
        return this.accessModel.revokeGroupAccess({
            resourceUuid: target.resourceUuid,
            groupUuid: input.groupUuid,
            ...SavedSqlAccessAdapter.expectation(target),
        });
    }

    resetAccess(target: SavedSqlAccessTarget) {
        return this.accessModel.resetAccess({
            resourceUuid: target.resourceUuid,
            ...SavedSqlAccessAdapter.expectation(target),
        });
    }
}

export class SavedSqlAccessHandler extends BaseResourceAccessHandler<SavedSqlAccessTarget> {
    constructor({
        savedSqlAccessModel,
        savedSqlModel,
        spacePermissionService,
        featureGate,
        auditLogger,
    }: {
        savedSqlAccessModel: SavedSqlAccessModel;
        savedSqlModel: SavedSqlModel;
        spacePermissionService: SpacePermissionService;
        featureGate: DirectAccessFeatureGate;
        auditLogger?: DirectAccessAuditLogger;
    }) {
        super(
            new SavedSqlAccessAdapter(savedSqlAccessModel, savedSqlModel),
            spacePermissionService,
            featureGate,
            auditLogger,
        );
    }
}
