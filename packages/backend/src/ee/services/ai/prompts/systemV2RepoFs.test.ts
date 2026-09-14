import { REPO_FS_SECTION } from './systemV2RepoFs';

describe('REPO_FS_SECTION', () => {
    it('describes the project and linked-user authorization boundary', () => {
        expect(REPO_FS_SECTION).toContain(
            "this project's configured repository plus repositories the current user can access through their linked provider account",
        );
        expect(REPO_FS_SECTION).not.toContain(
            'mounts every repository the organization can access',
        );
        expect(REPO_FS_SECTION).not.toContain(
            "Reading another organization's source",
        );
    });
});
