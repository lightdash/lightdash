import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import {
    buildStaticAuthoringFiles,
    firstExistingDir,
    loadVendoredStarterSource,
    rewriteWorkspaceDeps,
} from './scaffolding';

describe('firstExistingDir', () => {
    it('returns the first path that exists when a later candidate exists', () => {
        const realDir = mkdtempSync(`${tmpdir()}/ld-test-`);
        const result = firstExistingDir(['/nonexistent/path/xyz', realDir]);
        expect(result).toBe(realDir);
    });

    it('returns the first candidate when it exists', () => {
        const realDir = mkdtempSync(`${tmpdir()}/ld-test-`);
        const result = firstExistingDir([realDir, '/nonexistent/path/xyz']);
        expect(result).toBe(realDir);
    });

    it('returns null when all candidates are missing', () => {
        const result = firstExistingDir([
            '/nonexistent/path/aaa',
            '/nonexistent/path/bbb',
        ]);
        expect(result).toBeNull();
    });
});

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

    it.each([
        'lightdash-data-app',
        'developing-data-apps-locally',
        'frontend-design',
        'reusable-visualization',
        'sdk-features',
    ])('ships the %s skill', (skill) => {
        expect(byPath(`.claude/skills/${skill}/SKILL.md`)).toBeDefined();
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

    it('uses npm for the standard local workflow', () => {
        expect(text('README.md')).toContain('run `npm install` first');
        expect(text('AGENTS.md')).toContain('npm install && npm run build');
        expect(
            text('.claude/skills/developing-data-apps-locally/SKILL.md'),
        ).toContain('run `npm install` first');
        expect(text('.npmrc')).toContain('ignore-scripts=true');
        expect(text('.npmrc')).not.toContain('shamefully-hoist');
    });

    it('never writes app source (no src/ files)', () => {
        expect(files.every((f) => !f.path.startsWith('src/'))).toBe(true);
    });
});

describe('loadVendoredStarterSource', () => {
    const files = loadVendoredStarterSource();

    it('loads the starter app source with bundle-relative paths', () => {
        expect(files.map((file) => file.path)).toEqual(
            expect.arrayContaining([
                'src/App.jsx',
                'src/main.jsx',
                'src/index.css',
            ]),
        );
        expect(files.every((file) => file.path.startsWith('src/'))).toBe(true);
        expect(
            files.some((file) => file.path.startsWith('src/components/ui/')),
        ).toBe(false);
    });
});
