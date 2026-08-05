import { findDeniedCommitPaths } from './deniedPaths';

describe('findDeniedCommitPaths', () => {
    const secrets = [
        '.env',
        '.env.production',
        'config/.env.local',
        // `<name>.env` files are secrets too — not just dotfile envs (M2/R6).
        'prod.env',
        'config/app.env',
        'config/app.env.local',
        'certs/server.pem',
        'deploy/id_rsa',
        'app/private.key',
        'release/app.keystore',
        'android/app.jks',
        '.npmrc',
        'service-account.keyfile.json',
    ];

    const ci = [
        '.github/workflows/deploy.yml',
        '.github/actions/build/action.yml',
        '.gitlab-ci.yml',
        // `.yaml` variants must be denied too — the alternate extension was a
        // bypass before (M1/R3).
        '.gitlab-ci.yaml',
        'Jenkinsfile',
        '.circleci/config.yml',
        'azure-pipelines.yml',
        'azure-pipelines.yaml',
        'bitbucket-pipelines.yaml',
    ];

    const allowed = [
        'README.md',
        'src/index.ts',
        'models/orders.sql',
        'schema.yml',
        'docs/.github-notes.md',
        '.github/CODEOWNERS', // not under workflows/actions
        // Near-misses that must NOT be denied.
        '.envrc',
        'src/environment.ts',
        'lib/myenv.py',
    ];

    it('denies secret paths', () => {
        expect(findDeniedCommitPaths(secrets)).toEqual(secrets);
    });

    it('denies CI/workflow paths', () => {
        expect(findDeniedCommitPaths(ci)).toEqual(ci);
    });

    it('never denies ordinary source/docs paths', () => {
        expect(findDeniedCommitPaths(allowed)).toEqual([]);
    });

    it('returns only the offending paths from a mixed changeset', () => {
        const mixed = ['README.md', '.env', 'src/app.ts', 'Jenkinsfile'];
        expect(findDeniedCommitPaths(mixed)).toEqual(['.env', 'Jenkinsfile']);
    });
});
