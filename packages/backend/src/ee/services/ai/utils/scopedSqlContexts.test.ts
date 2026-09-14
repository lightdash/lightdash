import { QueryExecutionContext } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { isAgentScopedQueryContext } from './scopedSqlContexts';

describe('isAgentScopedQueryContext', () => {
    it('scopes SQL the AI agent runs', () => {
        expect(isAgentScopedQueryContext(QueryExecutionContext.AI)).toBe(true);
    });

    it('scopes SQL run through the MCP run_sql tool', () => {
        expect(
            isAgentScopedQueryContext(QueryExecutionContext.MCP_RUN_SQL),
        ).toBe(true);
    });

    it('leaves the human SQL Runner unrestricted', () => {
        expect(
            isAgentScopedQueryContext(QueryExecutionContext.SQL_RUNNER),
        ).toBe(false);
    });

    it('leaves an unknown context unrestricted rather than breaking it', () => {
        expect(isAgentScopedQueryContext(undefined)).toBe(false);
    });
});
