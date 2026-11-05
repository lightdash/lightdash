import { describe, expect, it } from 'vitest';
import { type StreamPart } from '../../../store/aiAgentThreadStreamSlice';
import { getPendingArtifactType } from './pendingArtifact';

const call = (
    toolName: string,
    toolResult: unknown,
    isPreliminary?: boolean,
): StreamPart =>
    ({
        type: 'toolCall',
        toolCallId: toolName,
        toolName,
        toolArgs: {},
        toolResult,
        isPreliminary,
    }) as StreamPart;

describe('getPendingArtifactType', () => {
    it('reports a chart while a visualize call runs', () => {
        expect(getPendingArtifactType([call('visualize', null)], false)).toBe(
            'chart',
        );
        expect(
            getPendingArtifactType([call('visualize', {}, true)], false),
        ).toBe('chart');
    });

    it('reports a dashboard for a running dashboard build', () => {
        expect(
            getPendingArtifactType([call('generateDashboard', null)], false),
        ).toBe('dashboard');
    });

    it('ignores finished calls, other tools, and turns that already have an artifact', () => {
        expect(getPendingArtifactType([call('visualize', {})], false)).toBe(
            null,
        );
        expect(getPendingArtifactType([call('runSql', null)], false)).toBe(
            null,
        );
        expect(getPendingArtifactType([call('visualize', null)], true)).toBe(
            null,
        );
    });
});
