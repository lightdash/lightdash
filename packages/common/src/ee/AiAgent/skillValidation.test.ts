import { describe, expect, it } from 'vitest';
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
                        'allowed-tools: Bash(git:*)',
                        'model: opus',
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
        expect(result.warnings.map((w) => w.code)).toEqual([
            'field_ignored',
            'field_ignored',
        ]);
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
        expect(result.errors.map((e) => e.code)).toEqual(
            expect.arrayContaining(['field_rejected', 'body_shell_injection']),
        );
    });

    it('enforces the name rules and reserved names', () => {
        const invalid = validateAiAgentSkill({
            files: { 'SKILL.md': skill('name: Weekly Review\ndescription: x') },
        });
        expect(invalid.errors.map((e) => e.code)).toContain('name_invalid');

        const reserved = validateAiAgentSkill({
            files: {
                'SKILL.md': skill(
                    'name: developing-in-lightdash\ndescription: x',
                ),
            },
            reservedNames: ['developing-in-lightdash'],
        });
        expect(reserved.errors.map((e) => e.code)).toContain('name_reserved');

        const prefixed = validateAiAgentSkill({
            files: {
                'SKILL.md': skill('name: lightdash-thing\ndescription: x'),
            },
        });
        expect(prefixed.errors.map((e) => e.code)).toContain('name_reserved');

        const mismatch = validateAiAgentSkill({
            files: valid,
            folderName: 'other-folder',
        });
        expect(mismatch.errors.map((e) => e.code)).toContain('name_mismatch');
    });

    it('requires resources to be flat markdown with their own frontmatter', () => {
        const result = validateAiAgentSkill({
            files: {
                ...valid,
                'resources/reference.md': skill(
                    'name: reference\ndescription: Deep reference.',
                    'Details.',
                ),
                'resources/nested/bad.md': 'nope',
                'scripts/run.sh': 'echo hi',
            },
        });
        expect(result.valid).toBe(false);
        expect(
            result.errors.filter((e) => e.code === 'resource_path_invalid'),
        ).toHaveLength(2);

        const ok = validateAiAgentSkill({
            files: {
                ...valid,
                'resources/reference.md': skill(
                    'name: reference\ndescription: Deep reference.',
                    'Details.',
                ),
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

    it('caps sizes and warns on long bodies', () => {
        const longBody = Array.from({ length: 501 }, () => 'line').join('\n');
        const warned = validateAiAgentSkill({
            files: {
                'SKILL.md': skill('name: long\ndescription: Long.', longBody),
            },
        });
        expect(warned.valid).toBe(true);
        expect(warned.warnings.map((w) => w.code)).toContain('body_too_long');

        const huge = validateAiAgentSkill({
            files: {
                'SKILL.md': skill(
                    'name: huge\ndescription: Huge.',
                    'x'.repeat(64 * 1024 + 1),
                ),
            },
        });
        expect(huge.errors.map((e) => e.code)).toContain('body_too_large');
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
                'Issue $0 on $branch; also $1',
                '"hello world" main',
                ['issue', 'branch'],
            ),
        ).toBe('Issue hello world on main; also main');
    });

    it('appends ARGUMENTS when no placeholder received them', () => {
        expect(substituteAiAgentSkillArguments('Plain body.', 'EMEA', [])).toBe(
            'Plain body.\n\nARGUMENTS: EMEA',
        );
    });

    it('leaves unfilled positions literal and honours \\$ escapes', () => {
        expect(
            substituteAiAgentSkillArguments('Costs \\$1.00 and $2', 'a', []),
        ).toBe('Costs $1.00 and $2\n\nARGUMENTS: a');
    });

    it('returns the body untouched without arguments', () => {
        expect(
            substituteAiAgentSkillArguments('Body $ARGUMENTS', '  ', []),
        ).toBe('Body $ARGUMENTS');
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
