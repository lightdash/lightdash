import { getRepoFsSection } from './systemV2RepoFs';

describe('getRepoFsSection', () => {
    it('describes the project and linked-user authorization boundary', () => {
        const section = getRepoFsSection({
            enableGrepFields: false,
            enableAiWriteback: true,
        });
        expect(section).toContain(
            "this project's configured repository plus repositories the current user can access through their linked provider account",
        );
        expect(section).not.toContain(
            'mounts every repository the organization can access',
        );
        expect(section).not.toContain("Reading another organization's source");
    });
});
