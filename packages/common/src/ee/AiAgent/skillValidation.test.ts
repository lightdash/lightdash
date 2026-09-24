import { describe, expect, it } from 'vitest';
import {
    AI_AGENT_SKILL_MAX_RESOURCES,
    AI_AGENT_SKILL_MAX_TOTAL_BYTES,
    AI_AGENT_SKILL_RESOURCE_MAX_BYTES,
} from './skillTypes';
import {
    getAiAgentSkillListingText,
    substituteAiAgentSkillArguments,
    suggestAiAgentSkillName,
    validateAiAgentSkill,
} from './skillValidation';

const skill = (frontmatter: string, body = 'Do the thing.') =>
    `---\n${frontmatter}\n---\n${body}\n`;

const valid = {
    'SKILL.md': skill(
        'name: weekly-review\ndescription: Summarise the week for a region.',
    ),
};

const resource = (name: string, body = 'Details.') =>
    skill(`name: ${name}\ndescription: About ${name}.`, body);

const codes = (result: { errors: { code: string }[] }) =>
    result.errors.map((e) => e.code);
const warningCodes = (result: { warnings: { code: string }[] }) =>
    result.warnings.map((w) => w.code);

describe('validateAiAgentSkill', () => {
    it('accepts a minimal agentskills.io skill and applies defaults', () => {
        const result = validateAiAgentSkill({ files: valid });
        expect(result.valid).toBe(true);
        if (!result.valid) return;
        expect(result.parsed.frontmatter).toMatchObject({
            name: 'weekly-review',
            userInvocable: true,
            disableModelInvocation: false,
            availability: ['agent', 'mcp'],
            arguments: [],
        });
        expect(result.parsed.body.trim()).toBe('Do the thing.');
    });

    it('lets a Claude Code skill drop in unchanged, warning on runtime fields', () => {
        const result = validateAiAgentSkill({
            files: {
                'SKILL.md': skill(
                    [
                        'name: fix-issue',
                        'description: Fix a GitHub issue.',
                        'argument-hint: "[issue-number]"',
                        'arguments: [issue]',
                        'disable-model-invocation: true',
                        'user-invocable: false',
                        'allowed-tools: Bash(git:*)',
                        'model: opus',
                        'shell: zsh',
                        'made-up-key: 1',
                    ].join('\n'),
                    'Fix issue $issue.',
                ),
            },
        });
        expect(result.valid).toBe(true);
        if (!result.valid) return;
        expect(result.parsed.frontmatter.argumentHint).toBe('[issue-number]');
        expect(result.parsed.frontmatter.arguments).toEqual(['issue']);
        expect(result.parsed.frontmatter.disableModelInvocation).toBe(true);
        expect(result.parsed.frontmatter.userInvocable).toBe(false);
        expect(warningCodes(result)).toEqual([
            'field_ignored',
            'field_ignored',
            'field_ignored',
            'field_ignored',
        ]);
    });

    it('rejects invalid booleans instead of silently defaulting', () => {
        const result = validateAiAgentSkill({
            files: {
                'SKILL.md': skill(
                    'name: x\ndescription: x\ndisable-model-invocation: maybe',
                ),
            },
        });
        expect(result.valid).toBe(false);
        expect(codes(result)).toEqual(['field_invalid']);
    });

    it('parses availability and rejects unknown values', () => {
        const mcpOnly = validateAiAgentSkill({
            files: {
                'SKILL.md': skill('name: x\ndescription: x\navailability: mcp'),
            },
        });
        expect(
            mcpOnly.valid && mcpOnly.parsed.frontmatter.availability,
        ).toEqual(['mcp']);
        const bad = validateAiAgentSkill({
            files: {
                'SKILL.md': skill(
                    'name: x\ndescription: x\navailability: [agent, slack]',
                ),
            },
        });
        expect(codes(bad)).toEqual(['field_invalid']);
    });

    it('rejects hooks and shell injection outright', () => {
        const result = validateAiAgentSkill({
            files: {
                'SKILL.md': skill(
                    'name: deploy\ndescription: Deploy.\nhooks:\n  PreToolUse: []',
                    'Status: !`git status`',
                ),
            },
        });
        expect(result.valid).toBe(false);
        expect(codes(result)).toEqual(
            expect.arrayContaining(['field_rejected', 'body_shell_injection']),
        );
    });

    it('catches shell injection without leading whitespace and ```! blocks', () => {
        const inline = validateAiAgentSkill({
            files: { 'SKILL.md': skill('name: x\ndescription: x', '(!`ls`)') },
        });
        expect(codes(inline)).toEqual(['body_shell_injection']);
        const fenced = validateAiAgentSkill({
            files: {
                'SKILL.md': skill('name: x\ndescription: x', '```!\nls\n```'),
            },
        });
        expect(codes(fenced)).toEqual(['body_shell_injection']);
        const cssBang = validateAiAgentSkill({
            files: {
                'SKILL.md': skill(
                    'name: x\ndescription: x',
                    'Use `!important`.',
                ),
            },
        });
        expect(cssBang.valid).toBe(true);
    });

    it('warns on @path and ${CLAUDE_*} references', () => {
        const result = validateAiAgentSkill({
            files: {
                'SKILL.md': skill(
                    'name: x\ndescription: x',
                    'Read @docs/guide.md in ${CLAUDE_PROJECT_DIR}.',
                ),
            },
        });
        expect(result.valid).toBe(true);
        expect(warningCodes(result)).toEqual([
            'body_file_reference',
            'body_env_variable',
        ]);
    });

    it('enforces the name rules and reserved names', () => {
        const invalid = validateAiAgentSkill({
            files: { 'SKILL.md': skill('name: Weekly Review\ndescription: x') },
        });
        expect(codes(invalid)).toContain('name_invalid');

        const reserved = validateAiAgentSkill({
            files: {
                'SKILL.md': skill(
                    'name: developing-in-lightdash\ndescription: x',
                ),
            },
            reservedNames: ['developing-in-lightdash'],
        });
        expect(codes(reserved)).toContain('name_reserved');

        const prefixed = validateAiAgentSkill({
            files: {
                'SKILL.md': skill('name: lightdash-thing\ndescription: x'),
            },
        });
        expect(codes(prefixed)).toContain('name_reserved');

        const mismatch = validateAiAgentSkill({
            files: valid,
            folderName: 'other-folder',
        });
        expect(codes(mismatch)).toContain('name_mismatch');
    });

    it('accepts a 64-character name and rejects 65', () => {
        const ok = validateAiAgentSkill({
            files: {
                'SKILL.md': skill(`name: ${'a'.repeat(64)}\ndescription: x`),
            },
        });
        expect(ok.valid).toBe(true);
        const long = validateAiAgentSkill({
            files: {
                'SKILL.md': skill(`name: ${'a'.repeat(65)}\ndescription: x`),
            },
        });
        expect(codes(long)).toEqual(['name_invalid']);
    });

    it('requires SKILL.md and a parseable frontmatter', () => {
        const missing = validateAiAgentSkill({
            files: { 'resources/a.md': resource('a') },
        });
        expect(codes(missing)).toEqual(['skill_file_missing']);

        const unterminated = validateAiAgentSkill({
            files: { 'SKILL.md': '---\nname: x\nbody without closing' },
        });
        expect(codes(unterminated)).toEqual(['frontmatter_invalid']);

        const empty = validateAiAgentSkill({
            files: { 'SKILL.md': '---\n---\nBody.' },
        });
        expect(codes(empty)).toEqual(['name_missing', 'description_missing']);
    });

    it('caps the description', () => {
        const result = validateAiAgentSkill({
            files: {
                'SKILL.md': skill(`name: x\ndescription: ${'d'.repeat(1025)}`),
            },
        });
        expect(codes(result)).toEqual(['description_too_long']);
    });

    it('requires resources to be flat markdown with their own frontmatter', () => {
        const result = validateAiAgentSkill({
            files: {
                ...valid,
                'resources/reference.md': resource('reference'),
                'resources/nested/bad.md': 'nope',
                'scripts/run.sh': 'echo hi',
            },
        });
        expect(result.valid).toBe(false);
        expect(
            result.errors.filter((e) => e.code === 'resource_path_invalid'),
        ).toHaveLength(2);

        const noFrontmatter = validateAiAgentSkill({
            files: { ...valid, 'resources/plain.md': 'Just text.' },
        });
        expect(codes(noFrontmatter)).toEqual(['frontmatter_invalid']);
        expect(noFrontmatter.errors[0].path).toBe('resources/plain.md');

        const ok = validateAiAgentSkill({
            files: {
                ...valid,
                'resources/reference.md': resource('reference'),
            },
        });
        expect(ok.valid).toBe(true);
        if (!ok.valid) return;
        expect(ok.parsed.resources).toEqual([
            expect.objectContaining({
                fileName: 'reference.md',
                name: 'reference',
            }),
        ]);
    });

    it('caps resource count and sizes', () => {
        const manyResources = Object.fromEntries(
            Array.from({ length: AI_AGENT_SKILL_MAX_RESOURCES + 1 }, (_, i) => [
                `resources/r${i}.md`,
                resource(`r${i}`),
            ]),
        );
        const tooMany = validateAiAgentSkill({
            files: { ...valid, ...manyResources },
        });
        expect(codes(tooMany)).toEqual(['too_many_resources']);

        const bigResource = validateAiAgentSkill({
            files: {
                ...valid,
                'resources/big.md': resource(
                    'big',
                    'x'.repeat(AI_AGENT_SKILL_RESOURCE_MAX_BYTES + 1),
                ),
            },
        });
        expect(codes(bigResource)).toEqual(['resource_too_large']);

        const wholeSkill = validateAiAgentSkill({
            files: {
                ...valid,
                ...Object.fromEntries(
                    Array.from({ length: 10 }, (_, i) => [
                        `resources/r${i}.md`,
                        resource(
                            `r${i}`,
                            'x'.repeat(AI_AGENT_SKILL_MAX_TOTAL_BYTES / 10),
                        ),
                    ]),
                ),
            },
        });
        expect(codes(wholeSkill)).toEqual(['skill_too_large']);
    });

    it('caps body size and warns strictly over 500 lines', () => {
        const exactly500 = Array.from({ length: 500 }, () => 'line').join('\n');
        const atLimit = validateAiAgentSkill({
            files: {
                'SKILL.md': skill('name: long\ndescription: Long.', exactly500),
            },
        });
        expect(warningCodes(atLimit)).toEqual([]);

        const over = validateAiAgentSkill({
            files: {
                'SKILL.md': skill(
                    'name: long\ndescription: Long.',
                    `${exactly500}\nline`,
                ),
            },
        });
        expect(warningCodes(over)).toContain('body_too_long');

        const huge = validateAiAgentSkill({
            files: {
                'SKILL.md': skill(
                    'name: huge\ndescription: Huge.',
                    'x'.repeat(64 * 1024 + 1),
                ),
            },
        });
        expect(codes(huge)).toContain('body_too_large');
    });
});

describe('substituteAiAgentSkillArguments', () => {
    it('replaces $ARGUMENTS with the raw string', () => {
        expect(
            substituteAiAgentSkillArguments(
                'Review $ARGUMENTS now.',
                'last quarter, EMEA',
                [],
            ),
        ).toBe('Review last quarter, EMEA now.');
    });

    it('supports positional and named tokens with shell-style quoting', () => {
        expect(
            substituteAiAgentSkillArguments(
                'Issue $0 on $branch; also $1 and $ARGUMENTS[0]',
                '"hello world" main',
                ['issue', 'branch'],
            ),
        ).toBe('Issue hello world on main; also main and hello world');
    });

    it('matches hyphenated argument names', () => {
        expect(
            substituteAiAgentSkillArguments(
                'Fix $pr-number for $pr',
                '42 seven',
                ['pr-number', 'pr'],
            ),
        ).toBe('Fix 42 for seven');
    });

    it('gives a declared but missing named argument an empty string', () => {
        expect(
            substituteAiAgentSkillArguments('A=$a B=$b.', 'one', ['a', 'b']),
        ).toBe('A=one B=.');
    });

    it('never re-expands inserted argument text', () => {
        expect(
            substituteAiAgentSkillArguments('Pay $ARGUMENTS', '$1 dollars', []),
        ).toBe('Pay $1 dollars');
        expect(
            substituteAiAgentSkillArguments('Say $ARGUMENTS', 'a $0', []),
        ).toBe('Say a $0');
        expect(
            substituteAiAgentSkillArguments('Say $x', '$ARGUMENTS', ['x']),
        ).toBe('Say $ARGUMENTS');
    });

    it('appends ARGUMENTS when no placeholder received them', () => {
        expect(substituteAiAgentSkillArguments('Plain body.', 'EMEA', [])).toBe(
            'Plain body.\n\nARGUMENTS: EMEA',
        );
    });

    it('leaves unfilled positions literal and honours \\$ escapes', () => {
        expect(
            substituteAiAgentSkillArguments(
                'Costs \\$1.00 and $2 and $ARGUMENTS[7]',
                'a',
                [],
            ),
        ).toBe('Costs $1.00 and $2 and $ARGUMENTS[7]\n\nARGUMENTS: a');
    });

    it('unescapes \\$ even without arguments and leaves placeholders alone', () => {
        expect(
            substituteAiAgentSkillArguments('Body $ARGUMENTS \\$5', '  ', []),
        ).toBe('Body $ARGUMENTS $5');
    });
});

describe('helpers', () => {
    it('suggests a valid name from a title', () => {
        expect(suggestAiAgentSkillName('Weekly Review (EMEA)!')).toBe(
            'weekly-review-emea',
        );
    });

    it('caps the listing text', () => {
        expect(
            getAiAgentSkillListingText(
                { description: 'abcdef', whenToUse: 'ghij' },
                8,
            ),
        ).toBe('abcdef …');
    });
});
