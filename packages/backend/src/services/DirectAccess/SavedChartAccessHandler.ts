import type { SessionUser, SpaceMemberRole } from '@lightdash/common';
import type { SavedChartAccessModel } from '../../models/SavedChartAccessModel';
import type { SavedChartModel } from '../../models/SavedChartModel';
import type { SpacePermissionService } from '../SpaceService/SpacePermissionService';
import {
    BaseResourceAccessHandler,
    type DirectAccessResourceAdapter,
    type DirectAccessTarget,
} from './BaseResourceAccessHandler';
import type { DirectAccessAuditLogger } from './directAccessAudit';
import type { DirectAccessFeatureGate } from './DirectAccessFeatureGate';
import type { ResourceAccessInput } from './ResourceAccessHandler';

type SavedChartAccessTarget = DirectAccessTarget & {
    resourceUuid: string;
};

class SavedChartAccessAdapter implements DirectAccessResourceAdapter<SavedChartAccessTarget> {
    readonly auditResourceType = 'SavedChart';

    constructor(
        private readonly accessModel: SavedChartAccessModel,
        private readonly savedChartModel: SavedChartModel,
    ) {}

    async getTarget({
        projectUuid,
        resourceUuid,
    }: ResourceAccessInput): Promise<SavedChartAccessTarget> {
        const chart = await this.savedChartModel.get(resourceUuid, undefined, {
            projectUuid,
        });
        return {
            resourceUuid: chart.uuid,
            organizationUuid: chart.organizationUuid,
            projectUuid: chart.projectUuid,
            spaceUuid: chart.spaceUuid,
            accessTarget: {
                type: 'chart',
                chartUuid: chart.uuid,
                dashboardUuid: chart.dashboardUuid,
                spaceUuid: chart.spaceUuid,
            },
            canReceiveDirectAccess: chart.dashboardUuid === null,
        };
    }

    getDirectAccessList(
        target: SavedChartAccessTarget,
        options: Parameters<SavedChartAccessModel['getDirectAccessList']>[3],
    ) {
        return this.accessModel.getDirectAccessList(
            target.resourceUuid,
            target.organizationUuid,
            target.projectUuid,
            options,
        );
    }

    getGroupRolesForUsers(target: SavedChartAccessTarget, userUuids: string[]) {
        return this.accessModel.getGroupRolesForUsers(
            target.resourceUuid,
            target.organizationUuid,
            target.projectUuid,
            userUuids,
        );
    }

    upsertUserAccess(
        target: SavedChartAccessTarget,
        input: { userUuid: string; role: SpaceMemberRole; actor: SessionUser },
    ) {
        return this.accessModel.upsertUserAccess({
            resourceUuid: target.resourceUuid,
            organizationUuid: target.organizationUuid,
            userUuid: input.userUuid,
            role: input.role,
            grantedByUserUuid: input.actor.userUuid,
        });
    }

    upsertGroupAccess(
        target: SavedChartAccessTarget,
        input: {
            groupUuid: string;
            role: SpaceMemberRole;
            actor: SessionUser;
        },
    ) {
        return this.accessModel.upsertGroupAccess({
            resourceUuid: target.resourceUuid,
            organizationUuid: target.organizationUuid,
            groupUuid: input.groupUuid,
            role: input.role,
            grantedByUserUuid: input.actor.userUuid,
        });
    }

    revokeUserAccess(
        target: SavedChartAccessTarget,
        input: { userUuid: string },
    ) {
        return this.accessModel.revokeUserAccess({
            resourceUuid: target.resourceUuid,
            organizationUuid: target.organizationUuid,
            userUuid: input.userUuid,
        });
    }

    revokeGroupAccess(
        target: SavedChartAccessTarget,
        input: { groupUuid: string },
    ) {
        return this.accessModel.revokeGroupAccess({
            resourceUuid: target.resourceUuid,
            organizationUuid: target.organizationUuid,
            groupUuid: input.groupUuid,
        });
    }

    resetAccess(target: SavedChartAccessTarget) {
        return this.accessModel.resetAccess({
            resourceUuid: target.resourceUuid,
            organizationUuid: target.organizationUuid,
        });
    }
}

export class SavedChartAccessHandler extends BaseResourceAccessHandler<SavedChartAccessTarget> {
    constructor({
        savedChartAccessModel,
        savedChartModel,
        spacePermissionService,
        featureGate,
        auditLogger,
    }: {
        savedChartAccessModel: SavedChartAccessModel;
        savedChartModel: SavedChartModel;
        spacePermissionService: SpacePermissionService;
        featureGate: DirectAccessFeatureGate;
        auditLogger?: DirectAccessAuditLogger;
    }) {
        super(
            new SavedChartAccessAdapter(savedChartAccessModel, savedChartModel),
            spacePermissionService,
            featureGate,
            auditLogger,
        );
    }
}
