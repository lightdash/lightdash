import { subject, type AnyAbility } from '@casl/ability';
import { type NodeRef } from './model';
import { type StudioPermissions } from './useSemanticStudio';

/**
 * What the person can change in Semantic Layer, per kind of source, from the
 * same checks the backend runs for each writer. Reading needs none of these:
 * everyone who can see the project opens the page.
 */
export const getStudioPermissions = (
    ability: AnyAbility,
    organizationUuid: string,
    projectUuid: string,
): StudioPermissions => {
    // subject() tags the object it is given, so each check needs its own.
    const scope = () => ({ organizationUuid, projectUuid });
    return {
        // Writeback opens its own branch, never the protected one.
        modelled: ability.can(
            'manage',
            subject('SourceCode', { ...scope(), isProtectedBranch: false }),
        ),
        sqlViews: ability.can('manage', subject('VirtualView', scope())),
        files: ability.can('manage', subject('ExternalSource', scope())),
        live: ability.can('manage', subject('ExternalConnection', scope())),
    };
};

/**
 * Everyone who can see the project opens the page. What they see comes from
 * the backend, which already filters explores and fields by role and user
 * attributes; what they can change follows getStudioPermissions.
 */
export const canOpenSemanticStudio = (
    ability: AnyAbility,
    organizationUuid: string,
    projectUuid: string,
) => ability.can('view', subject('Project', { organizationUuid, projectUuid }));

/**
 * Whether the project's settings pages open for this person; Settings and
 * Add links into them only show when they do. Editors manage external
 * sources but can't open project settings, so they add files in place.
 */
export const canOpenProjectSettings = (
    ability: AnyAbility,
    organizationUuid: string,
    projectUuid: string,
) =>
    ability.can(
        'update',
        subject('Project', { organizationUuid, projectUuid }),
    );

/**
 * Whether the live data sources list answers for this person: admins see
 * every source, other members only those an admin opened up for linking.
 * Without it, live explores still show, named after themselves.
 */
export const canListLiveSources = (
    ability: AnyAbility,
    organizationUuid: string,
    projectUuid: string,
) =>
    ability.can(
        'view',
        subject('ExternalConnection', {
            organizationUuid,
            projectUuid,
            allowDataAppBuilderLinking: true,
        }),
    );

/**
 * Live data sources and external sources keep their kind's page while
 * there are none, so the people who manage them can add the first one there.
 */
export const keepsKindPage = (
    permissions: StudioPermissions,
    ref: NodeRef | null,
): boolean =>
    ref?.type === 'kind' &&
    ((ref.kind === 'live' && permissions.live) ||
        (ref.kind === 'files' && permissions.files));
