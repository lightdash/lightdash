import { describe, expect, it } from 'vitest';
import { shouldIncludeAttachedMcpServers } from './AiAgentService';

describe('shouldIncludeAttachedMcpServers', () => {
    it('includes attached MCP servers for standard and coordinator execution', () => {
        expect(shouldIncludeAttachedMcpServers('standard')).toBe(true);
        expect(
            shouldIncludeAttachedMcpServers('deep_research', 'coordinator'),
        ).toBe(true);
    });

    it('excludes attached MCP servers from isolated workers', () => {
        expect(shouldIncludeAttachedMcpServers('deep_research', 'worker')).toBe(
            false,
        );
    });
});
