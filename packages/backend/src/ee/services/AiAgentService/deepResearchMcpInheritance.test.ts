import { describe, expect, it } from 'vitest';
import { shouldIncludeAttachedMcpServers } from './AiAgentService';

describe('shouldIncludeAttachedMcpServers', () => {
    it('includes attached MCP servers for standard and investigator execution', () => {
        expect(shouldIncludeAttachedMcpServers('standard')).toBe(true);
        expect(
            shouldIncludeAttachedMcpServers('deep_research', 'investigator'),
        ).toBe(true);
    });

    it('excludes attached MCP servers from planning and synthesis', () => {
        expect(
            shouldIncludeAttachedMcpServers('deep_research', 'planner'),
        ).toBe(false);
        expect(shouldIncludeAttachedMcpServers('deep_research', 'judge')).toBe(
            false,
        );
    });
});
