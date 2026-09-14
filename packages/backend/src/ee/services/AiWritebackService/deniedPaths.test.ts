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

    it('denies environment filenames with trailing whitespace', () => {
        const paths = ['config/.env ', 'config/.env\u00a0'];
        expect(findDeniedCommitPaths(paths)).toEqual(paths);
    });

    it('denies names whose segments carry surrounding whitespace', () => {
        // Each pattern anchors on `^` or `/`, so whitespace hugging a separator
        // hides the name from it — at the repo root and, more importantly, at
        // any nesting level, which is where the agent actually writes.
        const paths = [
            ' credentials',
            'ci/ Jenkinsfile',
            'ci/ .npmrc',
            'a/b/ id_rsa',
            '\u00a0credentials',
            '.github/workflows /deploy.yml',
        ];
        expect(findDeniedCommitPaths(paths)).toEqual(paths);
    });

    it('allows interior spaces in ordinary directory and file names', () => {
        const paths = ['my docs/notes.md', 'models/env.sql'];
        expect(findDeniedCommitPaths(paths)).toEqual([]);
    });

    it('denies Jenkinsfile variants with dot suffixes', () => {
        const paths = ['Jenkinsfile.groovy', 'ci/Jenkinsfile.production'];
        expect(findDeniedCommitPaths(paths)).toEqual(paths);
    });

    it('denies credentials filenames with extensions', () => {
        const paths = [
            'credentials.json',
            'config/credentials.local.json',
            'config/credentials.',
        ];
        expect(findDeniedCommitPaths(paths)).toEqual(paths);
    });

    it('allows names that only contain denied path terms', () => {
        const paths = [
            'models/environment.sql',
            'docs/credentials-setup.md',
            'docs/Jenkinsfile-setup.md',
        ];
        expect(findDeniedCommitPaths(paths)).toEqual([]);
    });
});
