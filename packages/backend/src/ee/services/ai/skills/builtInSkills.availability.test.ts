import { BuiltInSkills } from './builtInSkills';

const { skillAvailability } = vi.hoisted(() => ({
    skillAvailability: new Map([
        ['shared', ''],
        ['mcp-only', 'availability: [mcp]'],
        ['agent-only', 'availability: [agent]'],
        ['invalid', 'availability: [unknown]'],
        ['empty', 'availability: []'],
    ]),
}));

vi.mock('fs/promises', () => ({
    readdir: vi.fn(async () =>
        [...skillAvailability.keys()].map((name) => ({
            name,
            isDirectory: () => true,
        })),
    ),
    access: vi.fn(async () => {
        throw new Error('No supporting resources');
    }),
    readFile: vi.fn(async (filePath: string) => {
        const name = filePath.split('/').at(-2);
        if (!name || !skillAvailability.has(name)) {
            throw new Error(`Unexpected fixture path: ${filePath}`);
        }
        return `---
name: ${name}
description: Test runtime visibility
${skillAvailability.get(name)}
---
Test body.
`;
    }),
}));

describe('Built-in skill availability', () => {
    it.each([
        { name: 'shared', agent: true, mcp: true },
        { name: 'mcp-only', agent: false, mcp: true },
        { name: 'agent-only', agent: true, mcp: false },
        { name: 'invalid', agent: false, mcp: false },
        { name: 'empty', agent: false, mcp: false },
    ])('filters all access paths for $name', async ({ name, agent, mcp }) => {
        const agentNames = (await BuiltInSkills.getAiAgentSkills()).map(
            (skill) => skill.name,
        );
        expect(agentNames.includes(name)).toBe(agent);
        expect(
            Boolean(
                await BuiltInSkills.getAiAgentSkill(` ${name.toUpperCase()} `),
            ),
        ).toBe(agent);
        const mcpNames = (await BuiltInSkills.listSkillToolReferences()).map(
            (skill) => skill.name,
        );
        expect(mcpNames.includes(name)).toBe(mcp);
        expect(
            Boolean(
                await BuiltInSkills.readSkillTool(` ${name.toUpperCase()} `),
            ),
        ).toBe(mcp);
        expect(
            Boolean(
                await BuiltInSkills.getMcpResourceBody(
                    `skill://lightdash/${name}/SKILL.md`,
                ),
            ),
        ).toBe(mcp);
    });
});
