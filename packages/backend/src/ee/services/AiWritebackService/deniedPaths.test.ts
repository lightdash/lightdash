import { findDeniedCommitPaths } from './deniedPaths';

describe('findDeniedCommitPaths', () => {
    const secrets = [
        '.env',
        '.env.production',
        'config/.env.local',
        'certs/server.pem',
        'deploy/id_rsa',
        'app/private.key',
        '.npmrc',
        'service-account.keyfile.json',
    ];

    const ci = [
        '.github/workflows/deploy.yml',
        '.github/actions/build/action.yml',
        '.gitlab-ci.yml',
        'Jenkinsfile',
        '.circleci/config.yml',
        'azure-pipelines.yml',
    ];

    const allowed = [
        'README.md',
        'src/index.ts',
        'models/orders.sql',
        'schema.yml',
        'docs/.github-notes.md',
        '.github/CODEOWNERS', // not under workflows/actions
    ];

    it('always denies secret paths regardless of denyCiPaths', () => {
        expect(findDeniedCommitPaths(secrets, { denyCiPaths: false })).toEqual(
            secrets,
        );
        expect(findDeniedCommitPaths(secrets, { denyCiPaths: true })).toEqual(
            secrets,
        );
    });

    it('denies CI/workflow paths only when denyCiPaths is set', () => {
        expect(findDeniedCommitPaths(ci, { denyCiPaths: false })).toEqual([]);
        expect(findDeniedCommitPaths(ci, { denyCiPaths: true })).toEqual(ci);
    });

    it('never denies ordinary source/docs paths', () => {
        expect(findDeniedCommitPaths(allowed, { denyCiPaths: true })).toEqual(
            [],
        );
    });

    it('returns only the offending paths from a mixed changeset', () => {
        const mixed = ['README.md', '.env', 'src/app.ts', 'Jenkinsfile'];
        expect(findDeniedCommitPaths(mixed, { denyCiPaths: true })).toEqual([
            '.env',
            'Jenkinsfile',
        ]);
    });
});
