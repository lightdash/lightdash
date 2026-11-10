import {
    SpaceMemberRole,
    type DocumentSummary,
    type SpaceAccess,
} from '@lightdash/common';

/**
 * Access rows for a Document listed without its own access: its Space's, or
 * for a personal Document its creator as admin, as the server resolves it.
 */
export const getListedDocumentAccess = (
    document: Pick<DocumentSummary, 'spaceUuid' | 'createdByUserUuid'>,
    spaceUserAccess: SpaceAccess | undefined,
): SpaceAccess[] => {
    if (document.spaceUuid !== null) {
        return spaceUserAccess ? [spaceUserAccess] : [];
    }
    return document.createdByUserUuid === null
        ? []
        : [
              {
                  userUuid: document.createdByUserUuid,
                  role: SpaceMemberRole.ADMIN,
                  hasDirectAccess: true,
                  projectRole: undefined,
                  inheritedRole: undefined,
                  inheritedFrom: undefined,
              },
          ];
};
