import * as fs from 'fs';
import * as path from 'path';

// Repo-root `skills/` packages are baked into the writeback sandbox by
// `lightdash install-skills` (see handlers/installSkills.ts). Unlike the
// chat-agent copies under packages/backend/.../builtInSkills, nothing else
// validates these at build time, so this test guards their shape: valid
// frontmatter, name matching the directory, and no dead resource links.

const SKILLS_DIR = path.resolve(__dirname, '../../../skills');

const listSkillDirs = (): string[] =>
    fs
        .readdirSync(SKILLS_DIR, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);

// Minimal YAML-frontmatter reader — the CLI package has no gray-matter dep and
// we only need the two scalar fields the skill contract requires.
const parseFrontmatter = (
    markdown: string,
): { name: string | null; description: string | null } => {
    const match = markdown.match(/^---\n([\s\S]*?)\n---/);
    if (!match) {
        return { name: null, description: null };
    }
    const readField = (field: string): string | null => {
        const line = match[1]
            .split('\n')
            .find((l) => l.startsWith(`${field}:`));
        if (!line) {
            return null;
        }
        return line.slice(field.length + 1).trim() || null;
    };
    return { name: readField('name'), description: readField('description') };
};

describe('repo-root skills packages', () => {
    const skillDirs = listSkillDirs();

    it('has at least one skill package', () => {
        expect(skillDirs.length).toBeGreaterThan(0);
    });

    it.each(skillDirs)(
        'skill "%s" has valid frontmatter, matching name, and resolvable resource links',
        (dir) => {
            const skillPath = path.join(SKILLS_DIR, dir, 'SKILL.md');
            expect(fs.existsSync(skillPath)).toBe(true);

            const markdown = fs.readFileSync(skillPath, 'utf-8');
            const { name, description } = parseFrontmatter(markdown);

            expect(name).toBe(dir);
            expect(description).toEqual(expect.any(String));
            expect((description ?? '').length).toBeGreaterThan(0);

            // Every ./resources/*.md link referenced in SKILL.md must resolve.
            const linked = [
                ...markdown.matchAll(/\]\((\.\/resources\/[^)]+)\)/g),
            ].map((m) => m[1]);
            linked.forEach((rel) => {
                const resolved = path.join(SKILLS_DIR, dir, rel);
                expect(
                    fs.existsSync(resolved),
                    `dead resource link ${rel} in ${dir}/SKILL.md`,
                ).toBe(true);
            });
        },
    );
});

describe('effective-dbt-sql skill content policy', () => {
    const skillDir = path.join(SKILLS_DIR, 'effective-dbt-sql');
    const skillMd = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf-8');

    it('exists', () => {
        expect(fs.existsSync(skillDir)).toBe(true);
    });

    it('encodes the core semantic rules', () => {
        const body = skillMd.toLowerCase();
        expect(body).toContain('correlated subquer');
        expect(body).toContain('cte');
        expect(body).toContain('reuse');
    });

    it('carries the "match the target repo" fallback-defaults guardrail', () => {
        expect(skillMd.toLowerCase()).toContain('fallback default');
        expect(skillMd.toLowerCase()).toMatch(/match the (target )?repo/);
    });

    it('declares itself semantics-only (defers naming/formatting to the repo)', () => {
        // The skill deliberately drops house-style opinions so it never fights
        // the target repo's conventions. Assert the contract is stated rather
        // than grepping for banned tokens (a disclaimer legitimately names
        // them), so the semantics-only scope can't silently drift into
        // prescribing naming or formatting.
        const body = skillMd.toLowerCase();
        expect(body).toContain('semantics only');
        expect(body).toMatch(/does not prescribe|not in scope/);
    });
});

describe('developing-in-lightdash catalog workflow', () => {
    const skillDir = path.join(SKILLS_DIR, 'developing-in-lightdash');
    const skillMd = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf-8');
    const workflowPath = path.join(
        skillDir,
        'resources',
        'creating-from-warehouse-catalog.md',
    );
    const workflow = fs.readFileSync(workflowPath, 'utf-8');

    it('routes catalog bootstrapping through the conditional workflow', () => {
        expect(skillMd).toContain(
            './resources/creating-from-warehouse-catalog.md',
        );
        expect(skillMd).toMatch(
            /no usable dbt project[\s\S]*always read and follow/i,
        );
    });

    it('keeps the workflow credential-safe, additive, and project-pinned', () => {
        expect(workflow).toContain(
            'Never request, read, print, copy, or edit warehouse credentials.',
        );
        expect(workflow).toContain(
            'Immediately before deploy, the selected UUID must equal `EXPECTED_PROJECT_UUID`.',
        );
        expect(workflow).toContain(
            'On reruns, merge into the existing model by name: update evidenced definitions, add missing definitions, and never duplicate a dimension, metric, join, or model.',
        );
        expect(workflow).toContain(
            'A rerun with unchanged evidence should produce no YAML diff.',
        );
    });

    it('supports existing Snowflake and GCP CLI connections safely', () => {
        expect(workflow).toMatch(
            /already-authenticated warehouse CLI session[^.]+for read-only metadata and aggregate queries\./,
        );
        expect(workflow).toContain('snow sql --format json');
        expect(workflow).toContain('bq query --use_legacy_sql=false --dry_run');
        expect(workflow).toContain(
            'If there is no usable Lightdash catalog connection and the user has no authenticated warehouse CLI, stop: the catalog cannot be inspected safely, so this workflow cannot continue.',
        );
        expect(workflow).toContain(
            "The direct CLI supplies evidence for the YAML; it does not configure the Lightdash project's warehouse connection.",
        );
    });
});
