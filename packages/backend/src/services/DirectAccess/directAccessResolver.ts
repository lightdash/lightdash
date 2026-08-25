import {
    resolveDirectAccessRole,
    type SpaceMemberRole,
    type UUID,
} from '@lightdash/common';
import { type DirectAccess } from '../../models/directAccessModelUtils';

/**
 * Every resource carries an explicit ceiling decision; an absent entry cannot
 * be silently conflated with "no capability".
 */
export type DirectAccessResources = Record<
    UUID,
    {
        logicalRole: SpaceMemberRole | undefined;
        capabilityCeiling: SpaceMemberRole | null;
    }
>;

export const resolveDirectAccessBatch = ({
    resources,
    directAccess,
    organizationUuid,
}: {
    resources: DirectAccessResources;
    directAccess: Record<string, DirectAccess>;
    organizationUuid: UUID;
}): Record<string, SpaceMemberRole | undefined> =>
    Object.fromEntries(
        Object.entries(resources).map(
            ([resourceUuid, { logicalRole, capabilityCeiling }]) => {
                const candidate = directAccess[resourceUuid];
                const direct =
                    candidate?.organizationUuid === organizationUuid
                        ? candidate
                        : undefined;
                return [
                    resourceUuid,
                    resolveDirectAccessRole({
                        logicalSpaceRole: logicalRole,
                        directUserRole: direct?.userRole ?? undefined,
                        directGroupRoles: direct?.groupRoles ?? [],
                        capabilityCeiling,
                    }),
                ];
            },
        ),
    );

export const getLogicalAccessBatch = (
    resources: DirectAccessResources,
): Record<string, SpaceMemberRole | undefined> =>
    Object.fromEntries(
        Object.entries(resources).map(([resourceUuid, { logicalRole }]) => [
            resourceUuid,
            logicalRole,
        ]),
    );
