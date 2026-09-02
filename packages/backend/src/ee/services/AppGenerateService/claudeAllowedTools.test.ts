import { describe, expect, it } from 'vitest';
import { buildClaudeAllowedTools } from './claudeAllowedTools';

describe('buildClaudeAllowedTools', () => {
    it('lets ordinary builds write anywhere under src', () => {
        const tools = buildClaudeAllowedTools('source');
        expect(tools).toContain('Write(//app/src/**)');
        expect(tools).toContain('Edit(//app/src/**)');
        expect(tools).toContain('Read(//tmp/dbt-repo/**)');
    });

    it('limits a seeded template build to the manifest', () => {
        const tools = buildClaudeAllowedTools('manifest');
        expect(tools).toContain('Edit(//app/src/template.json)');
        expect(tools).toContain('Write(//app/src/template.json)');
        expect(tools).not.toContain('src/**)');
        // Reading and searching the whole app stays allowed: binding needs it.
        expect(tools).toContain('Read(//app/**)');
        expect(tools).toContain('Grep(//app/**)');
    });
});
