import { toolLoadSkillOutputSchema } from '@lightdash/common';
import { AiAgentSkill } from '../skills/types';
import { executeLoadSkill } from './loadSkill';

vi.mock('@sentry/node', () => ({
    captureException: vi.fn(),
    addBreadcrumb: vi.fn(),
    getActiveSpan: vi.fn(),
}));

vi.mock('../../../../logging/logger', () => ({
    __esModule: true,
    default: { error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const skill: AiAgentSkill = {
    name: 'charting',
    description: 'How to build charts',
    body: '\nUse bar charts for categories.\n',
    resources: [
        {
            name: 'palette.md',
            description: 'Colour palette',
            content: '\n# Palette\n\nBlue, green.\n',
        },
        {
            name: 'axes.md',
            description: 'Axis rules',
            content: 'Label every axis.',
        },
    ],
};

const withSkill = (loaded: AiAgentSkill | undefined) => ({
    loadSkill: vi.fn().mockResolvedValue(loaded),
});

describe('executeLoadSkill', () => {
    it('loads a skill with its body and resource list', async () => {
        const output = await executeLoadSkill(
            { name: 'charting' },
            withSkill(skill),
        );

        expect(output.result).toBe(`# Skill: charting

Use bar charts for categories.

## Available Resources

- palette.md: Colour palette
- axes.md: Axis rules`);
        expect(output.metadata).toEqual({ status: 'success' });
        expect(output.structuredContent).toEqual({
            kind: 'skill',
            skill: 'charting',
            body: 'Use bar charts for categories.',
            resources: [
                { name: 'palette.md', description: 'Colour palette' },
                { name: 'axes.md', description: 'Axis rules' },
            ],
        });
        expect(toolLoadSkillOutputSchema.safeParse(output).success).toBe(true);
    });

    it('reports an empty resource list when the skill has none', async () => {
        const output = await executeLoadSkill(
            { name: 'charting' },
            withSkill({ ...skill, resources: undefined }),
        );

        expect(output.result).toContain(
            '- No resources available for this skill.',
        );
        expect(output.structuredContent).toEqual({
            kind: 'skill',
            skill: 'charting',
            body: 'Use bar charts for categories.',
            resources: [],
        });
        expect(toolLoadSkillOutputSchema.safeParse(output).success).toBe(true);
    });

    it('loads a resource by case-insensitive name', async () => {
        const output = await executeLoadSkill(
            { name: 'charting', resourceName: ' PALETTE.md ' },
            withSkill(skill),
        );

        expect(output.result).toBe(`# Resource: palette.md

Skill: charting

# Palette

Blue, green.`);
        expect(output.metadata).toEqual({ status: 'success' });
        expect(output.structuredContent).toEqual({
            kind: 'resource',
            skill: 'charting',
            resource: {
                name: 'palette.md',
                content: '# Palette\n\nBlue, green.',
            },
        });
        expect(toolLoadSkillOutputSchema.safeParse(output).success).toBe(true);
    });

    it('returns an error envelope when the skill is missing', async () => {
        const output = await executeLoadSkill(
            { name: 'unknown' },
            withSkill(undefined),
        );

        expect(output.result).toBe('Skill "unknown" was not found.');
        expect(output.metadata).toEqual({ status: 'error' });
        expect(output.structuredContent).toEqual({ error: output.result });
        expect(toolLoadSkillOutputSchema.safeParse(output).success).toBe(true);
    });

    it('returns an error envelope listing resources when the resource is missing', async () => {
        const output = await executeLoadSkill(
            { name: 'charting', resourceName: 'missing.md' },
            withSkill(skill),
        );

        expect(output.result)
            .toBe(`Resource "missing.md" was not found for skill "charting".

Available resources:
- palette.md: Colour palette
- axes.md: Axis rules`);
        expect(output.metadata).toEqual({ status: 'error' });
        expect(output.structuredContent).toEqual({ error: output.result });
        expect(toolLoadSkillOutputSchema.safeParse(output).success).toBe(true);
    });

    it('returns an error envelope when loading throws', async () => {
        const output = await executeLoadSkill(
            { name: 'charting' },
            { loadSkill: vi.fn().mockRejectedValue(new Error('boom')) },
        );

        expect(output.result).toContain('Error loading skill');
        expect(output.result).toContain('boom');
        expect(output.metadata).toEqual({ status: 'error' });
        expect(output.structuredContent).toEqual({ error: output.result });
        expect(toolLoadSkillOutputSchema.safeParse(output).success).toBe(true);
    });
});
