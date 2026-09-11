import type { ToolSet } from 'ai';
import { autopilotToolDefinitions } from './agent';
import {
    AUTOPILOT_SLACK_SUMMARY_TOOL_NAME,
    buildAutopilotTools,
} from './tools';

const toolCallOptions = { toolCallId: 'call-1', messages: [] };

const executeTool = (tools: ToolSet, name: string, input: unknown) => {
    const { execute } = tools[name];
    if (!execute) throw new Error(`Tool ${name} has no execute`);
    return execute(input, toolCallOptions);
};

describe('buildAutopilotTools', () => {
    it('exposes one AI SDK tool per definition under the same name', () => {
        const tools = buildAutopilotTools({
            definitions: autopilotToolDefinitions,
            executeTool: vi.fn(),
            onSlackSummary: vi.fn(),
        });

        expect(Object.keys(tools).sort()).toEqual(
            autopilotToolDefinitions.map((tool) => tool.name).sort(),
        );
        expect(tools.flag_content.description).toBe(
            autopilotToolDefinitions.find(
                (tool) => tool.name === 'flag_content',
            )?.description,
        );
    });

    it('dispatches action tools to the handler with the tool name and input', async () => {
        const handler = vi.fn().mockResolvedValue('{"actions":[]}');
        const tools = buildAutopilotTools({
            definitions: autopilotToolDefinitions,
            executeTool: handler,
            onSlackSummary: vi.fn(),
        });

        const result = await executeTool(tools, 'get_recent_actions', {
            limit: 5,
        });

        expect(handler).toHaveBeenCalledWith('get_recent_actions', {
            limit: 5,
        });
        expect(result).toBe('{"actions":[]}');
    });

    it('returns handler failures to the model as an error result', async () => {
        const tools = buildAutopilotTools({
            definitions: autopilotToolDefinitions,
            executeTool: vi.fn().mockRejectedValue(new Error('boom')),
            onSlackSummary: vi.fn(),
        });

        const result = await executeTool(tools, 'get_stale_charts', {});

        expect(JSON.parse(String(result))).toEqual({ error: 'boom' });
    });

    it('captures the Slack summary instead of calling the handler', async () => {
        const handler = vi.fn();
        const onSlackSummary = vi.fn();
        const tools = buildAutopilotTools({
            definitions: autopilotToolDefinitions,
            executeTool: handler,
            onSlackSummary,
        });

        const result = await executeTool(
            tools,
            AUTOPILOT_SLACK_SUMMARY_TOOL_NAME,
            { summary: '  Flagged 3 stale charts.  ' },
        );

        expect(onSlackSummary).toHaveBeenCalledWith('Flagged 3 stale charts.');
        expect(handler).not.toHaveBeenCalled();
        expect(JSON.parse(String(result))).toEqual({
            ok: true,
            summary_length: 23,
        });
    });

    it('rejects an empty Slack summary without recording it', async () => {
        const onSlackSummary = vi.fn();
        const tools = buildAutopilotTools({
            definitions: autopilotToolDefinitions,
            executeTool: vi.fn(),
            onSlackSummary,
        });

        const result = await executeTool(
            tools,
            AUTOPILOT_SLACK_SUMMARY_TOOL_NAME,
            { summary: '   ' },
        );

        expect(onSlackSummary).not.toHaveBeenCalled();
        expect(JSON.parse(String(result))).toEqual({
            error: 'summary must be a non-empty string',
        });
    });
});
