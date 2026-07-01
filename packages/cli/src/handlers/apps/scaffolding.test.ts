import { buildStaticAuthoringFiles, rewriteWorkspaceDeps } from './scaffolding';

describe('rewriteWorkspaceDeps', () => {
    it('replaces workspace protocol pins with a concrete version', () => {
        const pkg = JSON.stringify({
            dependencies: {
                '@lightdash/query-sdk': 'workspace:*',
                react: '19.2.5',
            },
        });
        const out = JSON.parse(rewriteWorkspaceDeps(pkg, '0.3275.0'));
        expect(out.dependencies['@lightdash/query-sdk']).toBe('0.3275.0');
        expect(out.dependencies.react).toBe('19.2.5');
    });

    it('handles workspace:^ and workspace:~ variants', () => {
        const pkg = JSON.stringify({
            dependencies: {
                '@lightdash/query-sdk': 'workspace:^',
                'some-lib': 'workspace:~1.2.3',
                other: '2.0.0',
            },
        });
        const out = JSON.parse(rewriteWorkspaceDeps(pkg, '1.0.0'));
        expect(out.dependencies['@lightdash/query-sdk']).toBe('1.0.0');
        expect(out.dependencies['some-lib']).toBe('1.0.0');
        expect(out.dependencies.other).toBe('2.0.0');
    });
});

describe('buildStaticAuthoringFiles', () => {
    const files = buildStaticAuthoringFiles({
        appName: 'Revenue',
        sdkVersion: '0.3275.0',
    });
    const byPath = (p: string) => files.find((f) => f.path === p);
    const text = (p: string) =>
        Buffer.from(byPath(p)!.contentBase64, 'base64').toString('utf-8');

    it('ships both skills', () => {
        expect(
            byPath('.claude/skills/lightdash-data-app/SKILL.md'),
        ).toBeDefined();
        expect(
            byPath('.claude/skills/developing-data-apps-locally/SKILL.md'),
        ).toBeDefined();
    });

    it('pins the SDK to a concrete version in package.json', () => {
        expect(text('package.json')).toContain(
            '"@lightdash/query-sdk": "0.3275.0"',
        );
        expect(text('package.json')).not.toContain('workspace:');
    });

    it('renders the README with the app name and ships a .gitignore', () => {
        expect(text('README.md')).toContain('Revenue');
        expect(text('.gitignore')).toContain('node_modules');
    });

    it('never writes app source (no src/ files)', () => {
        expect(files.every((f) => !f.path.startsWith('src/'))).toBe(true);
    });
});
