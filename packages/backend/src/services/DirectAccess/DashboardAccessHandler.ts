import type { SessionUser, SpaceMemberRole } from '@lightdash/common';
import type { DashboardAccessModel } from '../../models/DashboardAccessModel';
import type { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import type { SpacePermissionService } from '../SpaceService/SpacePermissionService';
import {
    BaseResourceAccessHandler,
    type DirectAccessResourceAdapter,
    type DirectAccessTarget,
} from './BaseResourceAccessHandler';
import type { DirectAccessAuditLogger } from './directAccessAudit';
import type { DirectAccessFeatureGate } from './DirectAccessFeatureGate';
import type { ResourceAccessInput } from './ResourceAccessHandler';

type DashboardAccessTarget = DirectAccessTarget & {
    resourceUuid: string;
};

class DashboardAccessAdapter implements DirectAccessResourceAdapter<DashboardAccessTarget> {
    readonly auditResourceType = 'Dashboard';

    constructor(
        private readonly accessModel: DashboardAccessModel,
        private readonly dashboardModel: DashboardModel,
    ) {}

    async getTarget({
        projectUuid,
        resourceUuid,
    }: ResourceAccessInput): Promise<DashboardAccessTarget> {
        const dashboard = await this.dashboardModel.getByIdOrSlug(
            resourceUuid,
            { projectUuid },
        );
        return {
            resourceUuid: dashboard.uuid,
            organizationUuid: dashboard.organizationUuid,
            projectUuid: dashboard.projectUuid,
            spaceUuid: dashboard.spaceUuid,
            accessTarget: {
                type: 'dashboard',
                dashboardUuid: dashboard.uuid,
                spaceUuid: dashboard.spaceUuid,
            },
            canReceiveDirectAccess: true,
        };
    }

    getDirectAccessList(
        target: DashboardAccessTarget,
        options: Parameters<DashboardAccessModel['getDirectAccessList']>[3],
    ) {
        return this.accessModel.getDirectAccessList(
            target.resourceUuid,
            target.organizationUuid,
            target.projectUuid,
            options,
        );
    }

    getGroupRolesForUsers(target: DashboardAccessTarget, userUuids: string[]) {
        return this.accessModel.getGroupRolesForUsers(
            target.resourceUuid,
            target.organizationUuid,
            target.projectUuid,
            userUuids,
        );
    }

    upsertUserAccess(
        target: DashboardAccessTarget,
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
        target: DashboardAccessTarget,
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
        target: DashboardAccessTarget,
        input: { userUuid: string },
    ) {
        return this.accessModel.revokeUserAccess({
            resourceUuid: target.resourceUuid,
            organizationUuid: target.organizationUuid,
            userUuid: input.userUuid,
        });
    }

    revokeGroupAccess(
        target: DashboardAccessTarget,
        input: { groupUuid: string },
    ) {
        return this.accessModel.revokeGroupAccess({
            resourceUuid: target.resourceUuid,
            organizationUuid: target.organizationUuid,
            groupUuid: input.groupUuid,
        });
    }

    resetAccess(target: DashboardAccessTarget) {
        return this.accessModel.resetAccess({
            resourceUuid: target.resourceUuid,
            organizationUuid: target.organizationUuid,
        });
    }
}

export class DashboardAccessHandler extends BaseResourceAccessHandler<DashboardAccessTarget> {
    constructor({
        dashboardAccessModel,
        dashboardModel,
        spacePermissionService,
        featureGate,
        auditLogger,
    }: {
        dashboardAccessModel: DashboardAccessModel;
        dashboardModel: DashboardModel;
        spacePermissionService: SpacePermissionService;
        featureGate: DirectAccessFeatureGate;
        auditLogger?: DirectAccessAuditLogger;
    }) {
        super(
            new DashboardAccessAdapter(dashboardAccessModel, dashboardModel),
            spacePermissionService,
            featureGate,
            auditLogger,
        );
    }
}
