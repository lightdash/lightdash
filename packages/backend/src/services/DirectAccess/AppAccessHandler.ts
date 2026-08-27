import type { SessionUser, SpaceMemberRole } from '@lightdash/common';
import type { AppAccessModel } from '../../models/AppAccessModel';
import type { AppModel } from '../../models/AppModel';
import type { SpacePermissionService } from '../SpaceService/SpacePermissionService';
import {
    BaseResourceAccessHandler,
    type DirectAccessResourceAdapter,
    type DirectAccessTarget,
} from './BaseResourceAccessHandler';
import type { DirectAccessAuditLogger } from './directAccessAudit';
import type { DirectAccessFeatureGate } from './DirectAccessFeatureGate';
import type { ResourceAccessInput } from './ResourceAccessHandler';

type AppAccessTarget = DirectAccessTarget & {
    resourceUuid: string;
};

class AppAccessAdapter implements DirectAccessResourceAdapter<AppAccessTarget> {
    readonly auditResourceType = 'App';

    constructor(
        private readonly accessModel: AppAccessModel,
        private readonly appModel: AppModel,
    ) {}

    async getTarget({
        projectUuid,
        resourceUuid,
    }: ResourceAccessInput): Promise<AppAccessTarget> {
        const app = await this.appModel.getApp(resourceUuid, projectUuid);
        return {
            resourceUuid: app.app_id,
            organizationUuid: app.organization_uuid,
            projectUuid: app.project_uuid,
            spaceUuid: app.space_uuid,
            accessTarget: {
                type: 'app',
                appUuid: app.app_id,
                organizationUuid: app.organization_uuid,
                projectUuid: app.project_uuid,
                spaceUuid: app.space_uuid,
            },
            canReceiveDirectAccess: true,
        };
    }

    private static expectation(target: AppAccessTarget) {
        return {
            organizationUuid: target.organizationUuid,
            projectUuid: target.projectUuid,
            spaceUuid: target.spaceUuid,
        };
    }

    getDirectAccessList(
        target: AppAccessTarget,
        options: Parameters<AppAccessModel['getDirectAccessList']>[3],
    ) {
        return this.accessModel.getDirectAccessList(
            target.resourceUuid,
            target.organizationUuid,
            target.projectUuid,
            options,
        );
    }

    getGroupRolesForUsers(target: AppAccessTarget, userUuids: string[]) {
        return this.accessModel.getGroupRolesForUsers(
            target.resourceUuid,
            target.organizationUuid,
            target.projectUuid,
            userUuids,
        );
    }

    getAdditionalEffectiveRolesForUsers(
        target: AppAccessTarget,
        userUuids: string[],
    ) {
        return this.accessModel.getAdminRolesForUsers(
            target.organizationUuid,
            target.projectUuid,
            userUuids,
        );
    }

    upsertUserAccess(
        target: AppAccessTarget,
        input: { userUuid: string; role: SpaceMemberRole; actor: SessionUser },
    ) {
        return this.accessModel.upsertUserAccess({
            resourceUuid: target.resourceUuid,
            userUuid: input.userUuid,
            role: input.role,
            grantedByUserUuid: input.actor.userUuid,
            ...AppAccessAdapter.expectation(target),
        });
    }

    upsertGroupAccess(
        target: AppAccessTarget,
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
            ...AppAccessAdapter.expectation(target),
        });
    }

    revokeUserAccess(target: AppAccessTarget, input: { userUuid: string }) {
        return this.accessModel.revokeUserAccess({
            resourceUuid: target.resourceUuid,
            userUuid: input.userUuid,
            ...AppAccessAdapter.expectation(target),
        });
    }

    revokeGroupAccess(target: AppAccessTarget, input: { groupUuid: string }) {
        return this.accessModel.revokeGroupAccess({
            resourceUuid: target.resourceUuid,
            groupUuid: input.groupUuid,
            ...AppAccessAdapter.expectation(target),
        });
    }

    resetAccess(target: AppAccessTarget) {
        return this.accessModel.resetAccess({
            resourceUuid: target.resourceUuid,
            ...AppAccessAdapter.expectation(target),
        });
    }
}

export class AppAccessHandler extends BaseResourceAccessHandler<AppAccessTarget> {
    constructor({
        appAccessModel,
        appModel,
        spacePermissionService,
        featureGate,
        auditLogger,
    }: {
        appAccessModel: AppAccessModel;
        appModel: AppModel;
        spacePermissionService: SpacePermissionService;
        featureGate: DirectAccessFeatureGate;
        auditLogger?: DirectAccessAuditLogger;
    }) {
        super(
            new AppAccessAdapter(appAccessModel, appModel),
            spacePermissionService,
            featureGate,
            auditLogger,
        );
    }
}
