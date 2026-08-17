import { subject, type Ability } from '@casl/ability';
import {
    ForbiddenError,
    type AnonymousAccount,
    type ProjectType,
    type SessionUser,
} from '@lightdash/common';
import { type CaslAuditWrapper } from '../../../logging/caslAuditWrapper';
import { type AppModel } from '../../../models/AppModel';

export type AppViewAuthzApp = {
    project_uuid: string;
    space_uuid: string | null;
    created_by_user_uuid: string;
    organization_uuid: string;
};

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

export type EmbeddedAppViewAuthzDeps = {
    createAuditedAbility: (
        account: AnonymousAccount,
    ) => CaslAuditWrapper<Ability>;
    appModel: Pick<AppModel, 'findDashboardsContainingApp'>;
};

type EmbeddedAppViewAuthzApp = Pick<
    AppViewAuthzApp,
    'organization_uuid' | 'project_uuid'
> & { app_id: string };

/**
 * Authorize a JWT account against the app it is trying to render or use.
 * Standalone app embeds are pinned to one app; dashboard embeds may use only
 * apps referenced by the dashboard named in the JWT.
 */
export async function assertCanViewEmbeddedApp(
    deps: EmbeddedAppViewAuthzDeps,
    account: AnonymousAccount,
    app: EmbeddedAppViewAuthzApp,
): Promise<void> {
    const appUuid = app.app_id;
    const auditedAbility = deps.createAuditedAbility(account);
    if (
        auditedAbility.cannot(
            'view',
            subject('DataApp', {
                organizationUuid: app.organization_uuid,
                projectUuid: app.project_uuid,
                metadata: { appUuid },
            }),
        )
    ) {
        throw new ForbiddenError(
            'Insufficient permissions to access this data app',
        );
    }

    if (account.access.content.type === 'dataApp') {
        if (account.access.content.appUuid !== appUuid) {
            throw new ForbiddenError(
                'This embed is not authorized for this data app',
            );
        }
        return;
    }

    const { dashboardUuid } = account.access.content;
    if (!dashboardUuid) {
        throw new ForbiddenError('Data app is not authorized by this embed');
    }

    const dashboardsWithApp = await deps.appModel.findDashboardsContainingApp(
        appUuid,
        app.project_uuid,
        [dashboardUuid],
    );
    if (!dashboardsWithApp.includes(dashboardUuid)) {
        throw new ForbiddenError('Data app is not authorized by this embed');
    }
}
