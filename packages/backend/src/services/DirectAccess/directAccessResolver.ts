import {
    resolveDirectAccessRole,
    type SpaceMemberRole,
    type UUID,
} from '@lightdash/common';
import { type DirectAccess } from '../../models/directAccessModelUtils';

export const resolveDirectAccessBatch = ({
    resourceUuids,
    directAccess,
    organizationUuid,
    logicalRoles,
    capabilityCeilings,
}: {
    resourceUuids: UUID[];
    directAccess: Record<string, DirectAccess>;
    organizationUuid: UUID;
    logicalRoles: Record<string, SpaceMemberRole | undefined>;
    capabilityCeilings: Record<string, SpaceMemberRole | null>;
}): Record<string, SpaceMemberRole | undefined> =>
    Object.fromEntries(
        [...new Set(resourceUuids)].map((resourceUuid) => {
            const candidate = directAccess[resourceUuid];
            const direct =
                candidate?.organizationUuid === organizationUuid
                    ? candidate
                    : undefined;
            return [
                resourceUuid,
                resolveDirectAccessRole({
                    logicalSpaceRole: logicalRoles[resourceUuid],
                    directUserRole: direct?.userRole ?? undefined,
                    directGroupRoles: direct?.groupRoles ?? [],
                    capabilityCeiling: capabilityCeilings[resourceUuid] ?? null,
                }),
            ];
        }),
    );

export const getLogicalAccessBatch = (
    resourceUuids: UUID[],
    logicalRoles: Record<string, SpaceMemberRole | undefined>,
): Record<string, SpaceMemberRole | undefined> =>
    Object.fromEntries(
        [...new Set(resourceUuids)].map((resourceUuid) => [
            resourceUuid,
            logicalRoles[resourceUuid],
        ]),
    );
