import { FILTER_EXPRESSION_GRAMMAR_DESCRIPTION } from '@lightdash/common';
import { MCP_FILTER_EXPRESSION_GUIDANCE_SECTION } from './filterGuidance';
import { getMcpAnalystPrompt, MCP_ANALYST_PROMPT } from './mcpAnalyst';

const semanticQueryOptions = {
    runSqlEnabled: true,
    runMetricQueryEnabled: true,
    filterExpressionsEnabled: false,
};

describe('getMcpAnalystPrompt', () => {
    it('keeps workflow guidance without table-calculation or visualization manuals', () => {
        const prompt = getMcpAnalystPrompt(semanticQueryOptions);

        expect(prompt).toContain('Query Building Workflow');
        expect(prompt).toContain('grep_fields');
        expect(prompt).not.toContain('### Table Calculations');
        expect(prompt).not.toContain('MOVING_AVG');
        expect(prompt).not.toContain('### Visualization');
        expect(prompt).not.toContain('xAxisType');
        expect(prompt).toContain('render completed metric queries');
        expect(prompt).toContain('### Custom Metrics');
        expect(prompt).not.toContain('Saved Content Mode');
    });

    it.each([false, true])(
        'keeps workflow order and cross-tool safeguards without tool-specific details: sql=%s',
        (runSqlEnabled) => {
            const prompt = getMcpAnalystPrompt({
                ...semanticQueryOptions,
                runSqlEnabled,
            });
            expect(
                [...prompt.matchAll(/^\d\. `([^`]+)`/gm)].map(
                    (match) => match[1],
                ),
            ).toEqual([
                'get_context',
                'grep_fields',
                'get_metadata',
                'search_field_values',
                'run_metric_query',
                'get_query_result',
                'render_chart',
                'list_content',
                'find_content',
            ]);
            expect(prompt).toContain('explicitly to project-scoped tools');
            expect(prompt).toContain('select one explore at the right grain');
            expect(prompt).toContain(
                'use only exact field IDs returned by discovery',
            );
            expect(prompt).toContain('never resubmit the original query');
            expect(prompt).toContain('render completed metric queries');
            expect(prompt).toContain('If still ambiguous, ask the user');
            expect(prompt).not.toContain('revenue|sales');
            expect(prompt).not.toContain('case-sensitivity');
            expect(prompt).not.toContain('set_agent');
            expect(prompt).not.toContain('done/error/cancelled/expired');
        },
    );

    it('keeps the stable prompt on structured filters', () => {
        const prompt = getMcpAnalystPrompt(semanticQueryOptions);

        expect(prompt).toBe(MCP_ANALYST_PROMPT);
        expect(prompt).not.toContain(MCP_FILTER_EXPRESSION_GUIDANCE_SECTION);
    });

    it('defers detailed filter expression guidance to the shared skill when enabled', () => {
        const prompt = getMcpAnalystPrompt({
            ...semanticQueryOptions,
            filterExpressionsEnabled: true,
        });

        expect(prompt).not.toContain(MCP_FILTER_EXPRESSION_GUIDANCE_SECTION);
        expect(prompt).not.toContain(FILTER_EXPRESSION_GRAMMAR_DESCRIPTION);
        expect(prompt).toContain('read the shared skill');
        expect(prompt).toContain('run_metric_query and search_field_values');
        expect(prompt).not.toContain('### Table Calculations');
    });

    it('tells the model to report a stale catalogue instead of substituting run_sql', () => {
        const prompt = getMcpAnalystPrompt(semanticQueryOptions);

        expect(prompt).toContain('cached an outdated tool list');
        expect(prompt).toContain('never substitute `run_sql` for it');
    });

    it('returns the query-building workflow when only run_sql is disabled', () => {
        const prompt = getMcpAnalystPrompt({
            ...semanticQueryOptions,
            runSqlEnabled: false,
        });

        expect(prompt).toContain('Query Building Workflow');
        expect(prompt).not.toContain('run_sql');
    });

    it('returns saved-content mode when no query execution is available', () => {
        const prompt = getMcpAnalystPrompt({
            runSqlEnabled: false,
            runMetricQueryEnabled: false,
            filterExpressionsEnabled: true,
        });

        expect(prompt).toContain('Saved Content Mode');
        expect(prompt).toContain('find_content');
        expect(prompt).not.toContain('grep_fields');
        expect(prompt).not.toContain('get_metadata');
        expect(prompt).not.toContain('run_metric_query');
        expect(prompt).not.toContain('run_sql');
        expect(prompt).not.toContain('Filter Expressions');
        expect(prompt).not.toContain('Table Calculations');
    });

    it('returns SQL runner mode when only run_sql is available', () => {
        const prompt = getMcpAnalystPrompt({
            runSqlEnabled: true,
            runMetricQueryEnabled: false,
            filterExpressionsEnabled: true,
        });

        expect(prompt).toContain('SQL Runner Mode');
        expect(prompt).toContain('not available in this session');
        expect(prompt).toContain('run_sql');
        expect(prompt).not.toContain('grep_fields');
        expect(prompt).not.toContain('get_metadata');
        expect(prompt).not.toContain('search_field_values');
        expect(prompt).not.toContain('render_chart');
        expect(prompt).not.toContain('Filter Expressions');
        expect(prompt).not.toContain('Table Calculations');
    });
});
