import { FILTER_EXPRESSION_GRAMMAR_DESCRIPTION } from '@lightdash/common';
import { MCP_FILTER_EXPRESSION_GUIDANCE_SECTION } from './filterGuidance';
import { getMcpAnalystPrompt, MCP_ANALYST_PROMPT } from './mcpAnalyst';

const semanticQueryOptions = {
    runSqlEnabled: true,
    runMetricQueryEnabled: true,
    filterExpressionsEnabled: false,
};

describe('getMcpAnalystPrompt', () => {
    it('returns the query-building workflow with formula guidance', () => {
        const prompt = getMcpAnalystPrompt(semanticQueryOptions);

        expect(prompt).toContain('Query Building Workflow');
        expect(prompt).toContain('grep_fields');
        expect(prompt).toContain('### Table Calculations');
        expect(prompt).toContain('Author table calculations as type `formula`');
        expect(prompt).not.toContain('Saved Content Mode');
    });

    it('keeps the stable prompt on structured filters', () => {
        const prompt = getMcpAnalystPrompt(semanticQueryOptions);

        expect(prompt).toBe(MCP_ANALYST_PROMPT);
        expect(prompt).not.toContain(MCP_FILTER_EXPRESSION_GUIDANCE_SECTION);
    });

    it('includes canonical filter expression guidance when enabled', () => {
        const prompt = getMcpAnalystPrompt({
            ...semanticQueryOptions,
            filterExpressionsEnabled: true,
        });

        expect(prompt).toContain(MCP_FILTER_EXPRESSION_GUIDANCE_SECTION);
        expect(prompt).toContain(FILTER_EXPRESSION_GRAMMAR_DESCRIPTION);
        expect(prompt).toContain('`queryConfig.filters`');
        expect(prompt).toContain('`search_field_values.filters`');
        expect(prompt).toContain('### Table Calculations');
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
