import { z } from 'zod';
import { ToolNameSchema } from '../visualizations';
import { makeBuiltInToolResultGuard } from './builtInToolResultGuard';
import {
    agentToolDefinitionsByName,
    builtInToolDefinitions,
} from './toolDefinitions';
import { isToolEditRepoResult } from './toolEditRepoArgs';

describe('makeBuiltInToolResultGuard', () => {
    const metadataSchema = z.object({ status: z.literal('success') });
    const isMyToolResult = makeBuiltInToolResultGuard('myTool', metadataSchema);

    const base = {
        toolType: 'built-in',
        toolName: 'myTool',
        metadata: { status: 'success' },
    };

    it('accepts a matching built-in result', () => {
        expect(isMyToolResult(base)).toBe(true);
    });

    it('rejects other tool names and types', () => {
        expect(isMyToolResult({ ...base, toolName: 'otherTool' })).toBe(false);
        expect(isMyToolResult({ ...base, toolType: 'mcp' })).toBe(false);
    });

    it('rejects metadata that fails the schema, without throwing', () => {
        expect(isMyToolResult({ ...base, metadata: null })).toBe(false);
        expect(isMyToolResult({ ...base, metadata: { status: 'nope' } })).toBe(
            false,
        );
    });

    it('narrows metadata to the schema type', () => {
        const result: {
            toolType: string;
            toolName: string;
            metadata: unknown;
        } = base;
        if (isMyToolResult(result)) {
            // type-level check: metadata.status is narrowed
            const status: 'success' = result.metadata.status;
            expect(status).toBe('success');
        } else {
            throw new Error('expected guard to pass');
        }
    });
});

describe('retired repository-editing results', () => {
    it('reads stored successes and errors without registering an executable tool', () => {
        expect(ToolNameSchema.parse('editRepo')).toBe('editRepo');
        for (const metadata of [
            { status: 'success', prUrl: 'https://github.com/acme/repo/pull/1' },
            { status: 'error' },
        ]) {
            expect(
                isToolEditRepoResult({
                    toolType: 'built-in',
                    toolName: 'editRepo',
                    metadata,
                }),
            ).toBe(true);
        }
        expect(agentToolDefinitionsByName).not.toHaveProperty('editRepo');
        expect(builtInToolDefinitions.map(({ name }) => name)).not.toContain(
            'editRepo',
        );
    });
});
