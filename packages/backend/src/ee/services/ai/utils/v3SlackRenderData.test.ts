import { describe, expect, it } from 'vitest';
import { projectV3SlackToolData } from './v3SlackRenderData';

describe('projectV3SlackToolData', () => {
    it('projects canonical tool results and artifacts for Slack cards', () => {
        const projected = projectV3SlackToolData({
            promptUuid: 'prompt-1',
            parts: [
                {
                    uuid: 'tool-part-1',
                    type: 'tool',
                    payloadVersion: 1,
                    payload: {
                        state: 'output-available',
                        toolName: 'runSql',
                        input: { sql: 'select 1', limit: 10 },
                        output: {
                            result: 'value\n1',
                            metadata: { status: 'success', rowCount: 1 },
                        },
                    },
                    toolCallId: 'call-1',
                    artifactVersionUuid: null,
                },
                {
                    uuid: 'artifact-part-1',
                    type: 'artifact',
                    payloadVersion: 1,
                    payload: {},
                    toolCallId: null,
                    artifactVersionUuid: 'artifact-version-1',
                },
            ],
        });

        expect(projected).toEqual({
            toolCalls: [
                {
                    tool_call_id: 'call-1',
                    tool_name: 'runSql',
                    tool_args: { sql: 'select 1', limit: 10 },
                },
            ],
            toolResults: [
                expect.objectContaining({
                    uuid: 'tool-part-1',
                    promptUuid: 'prompt-1',
                    toolCallId: 'call-1',
                    toolName: 'runSql',
                    toolType: 'built-in',
                    result: 'value\n1',
                    metadata: { status: 'success', rowCount: 1 },
                }),
            ],
            artifactVersionUuids: ['artifact-version-1'],
        });
    });

    it('maps canonical tool errors without a result metadata envelope', () => {
        const projected = projectV3SlackToolData({
            promptUuid: 'prompt-1',
            parts: [
                {
                    uuid: 'tool-part-1',
                    type: 'tool',
                    payloadVersion: 1,
                    payload: {
                        state: 'output-error',
                        toolName: 'runSql',
                        input: { sql: 'select bad' },
                        error: { message: 'bad query' },
                    },
                    toolCallId: 'call-1',
                    artifactVersionUuid: null,
                },
            ],
        });

        expect(projected.toolResults[0]).toEqual(
            expect.objectContaining({ metadata: { status: 'error' } }),
        );
    });
});
