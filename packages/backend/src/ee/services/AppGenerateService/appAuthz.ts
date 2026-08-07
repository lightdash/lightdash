import { subject, type Ability } from '@casl/ability';
import {
    ForbiddenError,
    type ProjectType,
    type SessionUser,
} from '@lightdash/common';
import { type CaslAuditWrapper } from '../../../logging/caslAuditWrapper';

export type AppViewAuthzApp = {
    project_uuid: string;
    space_uuid: string | null;
    created_by_user_uuid: string;
    organization_uuid: string;
};

/**
 * The project half of a `DataApp` CASL subject. `projectType` /
 * `projectCreatedByUserUuid` are prefixed because plain `createdByUserUuid`
 * on this subject already means the app's creator — the preview-scoped rules
 * (`create:DataApp@preview`, `manage:DataApp@preview`) need the project's.
 */
export type DataAppProjectContext = {
    organizationUuid: string;
    projectUuid: string;
    projectType: ProjectType;
    projectCreatedByUserUuid: string | null;
    upstreamProjectUuid: string | null;
};

export type AppViewAuthzDeps = {
    auditedAbility: CaslAuditWrapper<Ability>;
    getSpaceAccessContext: (
        userUuid: string,
        spaceUuid: string,
    ) => Promise<Record<string, unknown>>;
    getProjectContext: (projectUuid: string) => Promise<DataAppProjectContext>;
};

async function userCanViewApp(
    deps: AppViewAuthzDeps,
    user: SessionUser,
    app: AppViewAuthzApp,
): Promise<boolean> {
    const [spaceContext, projectContext] = await Promise.all([
        app.space_uuid
            ? deps.getSpaceAccessContext(user.userUuid, app.space_uuid)
            : Promise.resolve({}),
        deps.getProjectContext(app.project_uuid),
    ]);
    return deps.auditedAbility.can(
        'view',
        subject('DataApp', {
            ...projectContext,
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
