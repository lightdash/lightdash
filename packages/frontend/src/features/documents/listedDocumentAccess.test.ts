import { SpaceMemberRole, type SpaceAccess } from '@lightdash/common';
import { getListedDocumentAccess } from './listedDocumentAccess';

const spaceAccess = {
    userUuid: 'member',
    role: SpaceMemberRole.EDITOR,
} as SpaceAccess;

describe('getListedDocumentAccess', () => {
    it("uses the Space's access for a Document in a Space", () => {
        expect(
            getListedDocumentAccess(
                { spaceUuid: 'space', createdByUserUuid: 'creator' },
                spaceAccess,
            ),
        ).toEqual([spaceAccess]);
    });

    it('makes the creator the admin of a personal Document', () => {
        expect(
            getListedDocumentAccess(
                { spaceUuid: null, createdByUserUuid: 'creator' },
                undefined,
            ),
        ).toMatchObject([{ userUuid: 'creator', role: SpaceMemberRole.ADMIN }]);
    });

    it('leaves a personal Document without a creator to admins', () => {
        expect(
            getListedDocumentAccess(
                { spaceUuid: null, createdByUserUuid: null },
                undefined,
            ),
        ).toEqual([]);
    });
});
