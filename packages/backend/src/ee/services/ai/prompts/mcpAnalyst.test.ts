import { getMcpAnalystPrompt } from './mcpAnalyst';

describe('getMcpAnalystPrompt', () => {
    it('returns the query-building workflow by default', () => {
        const prompt = getMcpAnalystPrompt();

        expect(prompt).toContain('Query Building Workflow');
        expect(prompt).toContain('grep_fields');
        expect(prompt).not.toContain('Saved Content Mode');
    });

    it('tells the model to report a stale catalogue instead of substituting run_sql', () => {
        const prompt = getMcpAnalystPrompt({
            runSqlEnabled: true,
            runMetricQueryEnabled: true,
        });

        expect(prompt).toContain('cached an outdated tool list');
        expect(prompt).toContain('never substitute `run_sql` for it');
    });

    it('returns the query-building workflow when only run_sql is disabled', () => {
        const prompt = getMcpAnalystPrompt({
            runSqlEnabled: false,
            runMetricQueryEnabled: true,
        });

        expect(prompt).toContain('Query Building Workflow');
        expect(prompt).not.toContain('run_sql');
    });

    it('returns saved-content mode when no query execution is available', () => {
        const prompt = getMcpAnalystPrompt({
            runSqlEnabled: false,
            runMetricQueryEnabled: false,
        });

        expect(prompt).toContain('Saved Content Mode');
        expect(prompt).toContain('find_content');
        expect(prompt).not.toContain('grep_fields');
        expect(prompt).not.toContain('get_metadata');
        expect(prompt).not.toContain('run_metric_query');
        expect(prompt).not.toContain('run_sql');
    });

    it('returns SQL runner mode when only run_sql is available', () => {
        const prompt = getMcpAnalystPrompt({
            runSqlEnabled: true,
            runMetricQueryEnabled: false,
        });

        expect(prompt).toContain('SQL Runner Mode');
        expect(prompt).toContain('not available in this session');
        expect(prompt).toContain('run_sql');
        expect(prompt).not.toContain('grep_fields');
        expect(prompt).not.toContain('get_metadata');
        expect(prompt).not.toContain('search_field_values');
        expect(prompt).not.toContain('render_chart');
    });
});
