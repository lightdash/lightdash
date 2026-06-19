import { subject, type Ability } from '@casl/ability';
import { ForbiddenError, type SessionUser } from '@lightdash/common';
import { type CaslAuditWrapper } from '../../../logging/caslAuditWrapper';

export type AppViewAuthzApp = {
    project_uuid: string;
    space_uuid: string | null;
    created_by_user_uuid: string;
    organization_uuid: string;
};

export type AppViewAuthzDeps = {
    auditedAbility: CaslAuditWrapper<Ability>;
    getSpaceAccessContext: (
        userUuid: string,
        spaceUuid: string,
    ) => Promise<Record<string, unknown>>;
};

async function userCanViewApp(
    deps: AppViewAuthzDeps,
    user: SessionUser,
    app: AppViewAuthzApp,
): Promise<boolean> {
    const spaceContext = app.space_uuid
        ? await deps.getSpaceAccessContext(user.userUuid, app.space_uuid)
        : {};
    return deps.auditedAbility.can(
        'view',
        subject('DataApp', {
            organizationUuid: app.organization_uuid,
            projectUuid: app.project_uuid,
            ...spaceContext,
            createdByUserUuid: app.created_by_user_uuid,
        }),
    );
}

export async function assertCanViewApp(
    deps: AppViewAuthzDeps,
    user: SessionUser,
    app: AppViewAuthzApp,
): Promise<void> {
    const allowed = await userCanViewApp(deps, user, app);
    if (!allowed) {
        throw new ForbiddenError(
            'Insufficient permissions to access this data app',
        );
    }
}
