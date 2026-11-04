import { toolLoadSkillOutputSchema } from '@lightdash/common';
import type { ModelMessage, ToolExecutionOptions } from 'ai';
import { describe, expect, it } from 'vitest';
import type { AiAgentSkill } from '../skills/types';
import {
    formatSkillResult,
    getLoadedSkillKeys,
    getLoadSkill,
} from './loadSkill';

const skill: AiAgentSkill = {
    name: 'developing-in-lightdash',
    description: 'Build charts and dashboards',
    body: 'Follow the reference for the content type you are building.',
    resources: [
        {
            name: 'dashboard-reference',
            description: 'Dashboard JSON reference',
            content: 'Dashboards are grids of tiles.',
        },
    ],
    metadata: {
        name: 'developing-in-lightdash',
        builtIn: true,
        uuid: null,
        versionNumber: null,
        contentHash: null,
    },
};

const loadSkill = async (name: string) =>
    name === skill.name ? skill : undefined;

const options: ToolExecutionOptions<Record<string, unknown>> = {
    toolCallId: 'call',
    messages: [],
    context: {},
};

/** Every output is checked against the public contract on the way out. */
const execute = async (
    tool: ReturnType<typeof getLoadSkill>,
    args: { name: string; resourceName?: string },
) => {
    if (!tool.execute) throw new Error('loadSkill has no execute');
    return toolLoadSkillOutputSchema.parse(await tool.execute(args, options));
};

const toolCall = (
    toolCallId: string,
    input: { name: string; resourceName?: string },
): ModelMessage => ({
    role: 'assistant',
    content: [{ type: 'tool-call', toolCallId, toolName: 'loadSkill', input }],
});

const toolResult = (
    toolCallId: string,
    output: { type: 'json' | 'text'; value: unknown },
): ModelMessage => ({
    role: 'tool',
    content: [
        {
            type: 'tool-result',
            toolCallId,
            toolName: 'loadSkill',
            output: output as never,
        },
    ],
});

describe('loadSkill', () => {
    it('serves a skill once per run and points back to it afterwards', async () => {
        const tool = getLoadSkill({ loadSkill });

        const first = await execute(tool, { name: skill.name });
        expect(first.structuredContent).toMatchObject({ kind: 'skill' });
        expect(first.result).toContain(skill.body);

        const second = await execute(tool, { name: skill.name });
        expect(second.structuredContent).toEqual({
            kind: 'already_loaded',
            skill: skill.name,
            resource: null,
        });
        expect(second.result).not.toContain(skill.body);
        expect(second.metadata.skill).toEqual(skill.metadata);
        expect(toolLoadSkillOutputSchema.safeParse(second).success).toBe(true);
    });

    it('serves a resource once per run, independently of the skill body', async () => {
        const tool = getLoadSkill({ loadSkill });
        await execute(tool, { name: skill.name });

        const first = await execute(tool, {
            name: skill.name,
            resourceName: 'Dashboard-Reference',
        });
        expect(first.structuredContent).toMatchObject({ kind: 'resource' });

        const second = await execute(tool, {
            name: skill.name,
            resourceName: 'dashboard-reference',
        });
        expect(second.structuredContent).toEqual({
            kind: 'already_loaded',
            skill: skill.name,
            resource: 'dashboard-reference',
        });
        expect(second.result).not.toContain('grids of tiles');
    });

    it('treats a copy already in the thread history as loaded', async () => {
        const history: ModelMessage[] = [
            { role: 'user', content: 'build a dashboard' },
            toolCall('c1', { name: skill.name }),
            toolResult('c1', { type: 'json', value: formatSkillResult(skill) }),
            toolCall('c2', {
                name: skill.name,
                resourceName: 'dashboard-reference',
            }),
            toolResult('c2', {
                type: 'json',
                value: {
                    result: '# Resource: dashboard-reference\n\nSkill: developing-in-lightdash\n\nDashboards are grids of tiles.',
                    status: 'success',
                },
            }),
            { role: 'user', content: 'please continue' },
        ];
        const tool = getLoadSkill({
            loadSkill,
            loadedSkillKeys: getLoadedSkillKeys(history),
        });

        const resource = await execute(tool, {
            name: skill.name,
            resourceName: 'dashboard-reference',
        });
        expect(resource.structuredContent).toMatchObject({
            kind: 'already_loaded',
        });

        const body = await execute(tool, { name: skill.name });
        expect(body.structuredContent).toMatchObject({
            kind: 'already_loaded',
        });
    });

    it('loads again when the earlier call failed or its copy was compacted away', async () => {
        const history: ModelMessage[] = [
            toolCall('c1', { name: skill.name, resourceName: 'missing' }),
            toolResult('c1', {
                type: 'json',
                value: 'Resource "missing" was not found for skill "developing-in-lightdash".',
            }),
            { role: 'user', content: 'please continue' },
        ];
        const tool = getLoadSkill({
            loadSkill,
            loadedSkillKeys: getLoadedSkillKeys(history),
        });

        const output = await execute(tool, {
            name: skill.name,
            resourceName: 'dashboard-reference',
        });
        expect(output.structuredContent).toMatchObject({ kind: 'resource' });
        expect(output.result).toContain('grids of tiles');
    });

    it('reports an unknown skill as an error', async () => {
        const tool = getLoadSkill({ loadSkill });
        const output = await execute(tool, { name: 'nope' });
        expect(output.metadata.status).toBe('error');
        expect(toolLoadSkillOutputSchema.safeParse(output).success).toBe(true);
    });
});
