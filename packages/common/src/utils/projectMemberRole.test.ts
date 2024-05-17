import { SpaceMemberRole } from '../types/space';
import { getHighestSpaceRole } from './projectMemberRole';

describe('projectMemberRole', () => {
    describe('getHighestSpaceRole', () => {
        it('should get the highest space role', () => {
            const highestRole = getHighestSpaceRole([
                SpaceMemberRole.ADMIN,
                SpaceMemberRole.EDITOR,
                SpaceMemberRole.VIEWER,
            ]);
            expect(highestRole).toBe(SpaceMemberRole.ADMIN);

            const highestRole2 = getHighestSpaceRole([
                SpaceMemberRole.EDITOR,
                SpaceMemberRole.VIEWER,
            ]);
            expect(highestRole2).toBe(SpaceMemberRole.EDITOR);

            const highestRole3 = getHighestSpaceRole([SpaceMemberRole.VIEWER]);
            expect(highestRole3).toBe(SpaceMemberRole.VIEWER);

            const highestRole4 = getHighestSpaceRole([
                SpaceMemberRole.VIEWER,
                undefined,
            ]);
            expect(highestRole4).toBe(SpaceMemberRole.VIEWER);

            const highestRole5 = getHighestSpaceRole([undefined, undefined]);
            expect(highestRole5).toBe(undefined);

            const highestRole6 = getHighestSpaceRole([
                undefined,
                SpaceMemberRole.VIEWER,
                SpaceMemberRole.EDITOR,
            ]);
            expect(highestRole6).toBe(SpaceMemberRole.EDITOR);
            // Test goes here
        });
    });
});
