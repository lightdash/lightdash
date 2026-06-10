import { getSystemPromptV2 } from './systemV2';

const promptText = (args: Parameters<typeof getSystemPromptV2>[0]): string => {
    const { content } = getSystemPromptV2(args);
    return typeof content === 'string' ? content : JSON.stringify(content);
};

describe('getSystemPromptV2 project context', () => {
    test('advertises the loadProjectContext tool when context exists', () => {
        const content = promptText({
            availableExplores: [],
            hasProjectContext: true,
        });
        expect(content).toContain('## Project context');
        expect(content).toContain('loadProjectContext');
        expect(content).toContain('BEFORE');
    });

    test('shows a placeholder when no project context is configured', () => {
        const content = promptText({
            availableExplores: [],
            hasProjectContext: false,
        });
        expect(content).toContain(
            'No project context has been configured for this project.',
        );
        expect(content).not.toContain('loadProjectContext');
    });

    test('leaves no unfilled project_context placeholder', () => {
        const content = promptText({ availableExplores: [] });
        expect(content).not.toContain('{{project_context}}');
    });
});

describe('getSystemPromptV2 chart-as-code artifacts', () => {
    test('advertises chart-as-code instructions when enabled', () => {
        const content = promptText({
            availableExplores: [],
            enableChartAsCodeArtifacts: true,
        });

        expect(content).toContain('using chart-as-code');
        expect(content).toContain('`metricQuery`');
        expect(content).toContain('`chartConfig.config.columns`');
    });

    test('uses legacy visualization instructions when disabled', () => {
        const content = promptText({
            availableExplores: [],
            enableChartAsCodeArtifacts: false,
        });

        expect(content).toContain("defaultVizType: 'table'");
        expect(content).toContain('`queryConfig.metrics`');
        expect(content).not.toContain('using chart-as-code');
        expect(content).not.toContain('`metricQuery`');
    });
});
