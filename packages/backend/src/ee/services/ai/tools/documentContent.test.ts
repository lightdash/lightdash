import {
    ChartType,
    ConflictError,
    ParameterError,
    toolCreateContentOutputSchema,
} from '@lightdash/common';
import { asSchema, type FlexibleSchema, type ToolExecutionOptions } from 'ai';
import { getSystemPromptV2 } from '../prompts/systemV2';
import type { DocumentContentResult } from '../types/aiAgentDependencies';
import type { PreparedChartAsCode } from '../utils/chartAsCode';
import { getCreateContent } from './createContent';
import { getEditContent } from './editContent';
import { getReadContent } from './readContent';

const versionUuid = '83b3faf3-a320-49ae-8119-0117e813723e';
const documentUuid = 'ccf2dbb5-26f0-4ea3-94e7-758de087326f';
const metadata = {
    schemaVersion: 2 as const,
    name: 'Findings',
    slug: 'findings',
    description: 'Order analysis',
    spaceSlug: 'reports',
};
const input = {
    ...metadata,
    markdown: '# Findings\n\n## Detail\n\nEvidence.',
    charts: {},
};
const document: DocumentContentResult = {
    type: 'document',
    uuid: documentUuid,
    href: `/projects/project/documents/${documentUuid}`,
    versionUuid,
    content: { ...metadata, markdown: input.markdown, chart: null },
};
const metricQuery = {
    exploreName: 'orders',
    dimensions: ['orders_country'],
    metrics: ['orders_growth'],
    filters: {},
    sorts: [],
    limit: 100,
    tableCalculations: [],
};
const customChartInput = {
    ...metadata,
    markdown: '<document-chart id="growth">',
    charts: {
        growth: {
            source: 'semantic' as const,
            chart: {
                name: 'Growth by country',
                tableName: 'orders',
                metricQuery,
                chartConfig: {
                    type: ChartType.DATA_APP_VIZ,
                    config: {
                        dataAppVizSlug: 'sprouts',
                        dataAppVizVersion: 3,
                        fieldMapping: {
                            category: 'orders_country',
                            value: 'orders_growth',
                        },
                        optionValues: { showStage: true },
                    },
                },
            },
        },
    },
};
const artifactVersionUuid = '0b4f6c2e-55a7-4f0e-9f1e-0d3c3b9e8a11';
const preparedChart = {
    name: 'Revenue by country',
    description: 'From chat',
    tableName: 'orders',
    metricQuery,
    chartConfig: { type: ChartType.CARTESIAN, config: undefined },
    version: 1,
    contentType: 'chart',
} as unknown as PreparedChartAsCode;
const artifacts = (prepared = preparedChart) => ({
    list: vi.fn(),
    prepare: vi.fn(),
    prepareVersion: vi.fn().mockResolvedValue(prepared),
});
const options: ToolExecutionOptions<Record<string, unknown>> = {
    toolCallId: 'call',
    messages: [],
    context: {},
};

describe('AI Agent Document authoring', () => {
    test.each([false, true])(
        'only exposes Documents when enabled: %s',
        (documentsEnabled) => {
            const definitions: { inputSchema: FlexibleSchema }[] = [
                getCreateContent({
                    createContent: vi.fn(),
                    documentsEnabled,
                }),
                getReadContent({
                    readContent: vi.fn(),
                    documentsEnabled,
                }),
                getEditContent({
                    editContent: vi.fn(),
                    documentsEnabled,
                }),
            ];
            for (const definition of definitions) {
                expect(
                    JSON.stringify(
                        asSchema(definition.inputSchema).jsonSchema,
                    ).includes('"document"'),
                ).toBe(documentsEnabled);
            }
        },
    );

    test('creates with the shared ID-free contract and returns the canonical reference', async () => {
        const createContent = vi.fn().mockResolvedValue(document);
        const tool = getCreateContent({
            createContent,
            documentsEnabled: true,
        });
        if (!tool.execute) {
            throw new Error('Missing executor');
        }
        const result = await tool.execute(
            { type: 'document', content: input },
            options,
        );
        if (Symbol.asyncIterator in result) {
            throw new Error('Unexpected streamed output');
        }
        expect(createContent).toHaveBeenCalledWith({
            type: 'document',
            content: input,
        });
        expect(result).toMatchObject({
            metadata: {
                status: 'success',
                href: document.href,
                uuid: documentUuid,
                versionUuid,
            },
        });
        expect(result).toHaveProperty(
            'result',
            expect.stringContaining(versionUuid),
        );
        expect(result.structuredContent).toEqual({
            type: 'document',
            href: document.href,
            uuid: documentUuid,
            versionUuid,
            slug: document.content.slug,
            name: document.content.name,
            content: document.content,
            warnings: [],
        });
        expect(toolCreateContentOutputSchema.safeParse(result).success).toBe(
            true,
        );
    });

    test('creates a Document with a custom chart type by slug and version', async () => {
        const createContent = vi.fn().mockResolvedValue(document);
        const tool = getCreateContent({
            createContent,
            documentsEnabled: true,
        });
        if (!tool.execute) {
            throw new Error('Missing executor');
        }
        const result = await tool.execute(
            { type: 'document', content: customChartInput },
            options,
        );
        expect(createContent).toHaveBeenCalledWith({
            type: 'document',
            content: customChartInput,
        });
        expect(result).toMatchObject({ metadata: { status: 'success' } });
    });

    test('returns an unknown custom chart type to the model with a next step', async () => {
        const message =
            'Custom chart type "sprouts" was not found in this project. Install the chart type in this project, or pick a different chart type.';
        const createContent = vi
            .fn()
            .mockRejectedValue(new ParameterError(message));
        const tool = getCreateContent({
            createContent,
            documentsEnabled: true,
        });
        if (!tool.execute) {
            throw new Error('Missing executor');
        }
        const result = await tool.execute(
            { type: 'document', content: customChartInput },
            options,
        );
        expect(result).toMatchObject({
            metadata: { status: 'error' },
            result: expect.stringContaining(message),
        });
    });

    test('rejects disabled creation even when called directly', async () => {
        const createContent = vi.fn();
        const tool = getCreateContent({
            createContent,
            documentsEnabled: false,
        });
        if (!tool.execute) {
            throw new Error('Missing executor');
        }
        const result = await tool.execute(
            { type: 'document', content: input },
            options,
        );
        if (Symbol.asyncIterator in result) {
            throw new Error('Unexpected streamed output');
        }
        expect(result).toMatchObject({ metadata: { status: 'error' } });
        expect(result.structuredContent).toEqual({ error: result.result });
        expect(toolCreateContentOutputSchema.safeParse(result).success).toBe(
            true,
        );
        expect(createContent).not.toHaveBeenCalled();
    });

    test.each([{ slug: 'findings' }, { documentUuid }])(
        'reads a Document using %j',
        async (identifier) => {
            const readContent = vi.fn().mockResolvedValue(document);
            const tool = getReadContent({
                readContent,
                documentsEnabled: true,
            });
            if (!tool.execute) {
                throw new Error('Missing executor');
            }
            const result = await tool.execute(
                { type: 'document', ...identifier },
                options,
            );
            expect(readContent).toHaveBeenCalledWith({
                type: 'document',
                ...identifier,
                chartId: null,
            });
            expect(result).toHaveProperty(
                'result',
                expect.stringContaining(versionUuid),
            );
        },
    );

    test('rejects disabled reads even when called directly', async () => {
        const readContent = vi.fn();
        const tool = getReadContent({ readContent, documentsEnabled: false });
        if (!tool.execute) {
            throw new Error('Missing executor');
        }
        expect(
            await tool.execute({ type: 'document', documentUuid }, options),
        ).toMatchObject({ metadata: { status: 'error' } });
        expect(readContent).not.toHaveBeenCalled();
    });

    test('rejects disabled edits even when called directly', async () => {
        const editContent = vi.fn();
        const tool = getEditContent({ editContent, documentsEnabled: false });
        if (!tool.execute) {
            throw new Error('Missing executor');
        }
        expect(
            await tool.execute(
                {
                    type: 'document',
                    slug: 'findings',
                    documentEdit: { type: 'metadata', name: 'New title' },
                },
                options,
            ),
        ).toMatchObject({ metadata: { status: 'error' } });
        expect(editContent).not.toHaveBeenCalled();
    });

    test('returns metadata updates with the canonical reference and current version', async () => {
        const editContent = vi.fn().mockResolvedValue(document);
        const tool = getEditContent({ editContent, documentsEnabled: true });
        if (!tool.execute) {
            throw new Error('Missing executor');
        }
        const args = {
            type: 'document' as const,
            slug: 'findings',
            documentEdit: { type: 'metadata' as const, name: 'Findings' },
        };
        expect(await tool.execute(args, options)).toMatchObject({
            metadata: {
                status: 'success',
                href: document.href,
                versionUuids: { before: null, after: versionUuid },
            },
        });
        expect(editContent).toHaveBeenCalledWith(args);
    });

    test('returns version conflicts to the model without retrying the write', async () => {
        const editContent = vi
            .fn()
            .mockRejectedValue(new ConflictError('Document has changed'));
        const tool = getEditContent({ editContent, documentsEnabled: true });
        if (!tool.execute) {
            throw new Error('Missing executor');
        }
        const result = await tool.execute(
            {
                type: 'document',
                slug: 'findings',
                documentEdit: {
                    type: 'content',
                    baseVersionUuid: versionUuid,
                    markdown: input.markdown,
                    charts: {},
                },
            },
            options,
        );
        expect(result).toMatchObject({
            metadata: { status: 'error' },
            result: expect.stringContaining('Document has changed'),
        });
        expect(editContent).toHaveBeenCalledOnce();
    });

    test('rejects ambiguous Document identifiers', async () => {
        const readContent = vi.fn();
        const tool = getReadContent({ readContent, documentsEnabled: true });
        if (!tool.execute) {
            throw new Error('Missing executor');
        }
        expect(
            await tool.execute(
                { type: 'document', slug: 'findings', documentUuid },
                options,
            ),
        ).toMatchObject({ metadata: { status: 'error' } });
        expect(readContent).not.toHaveBeenCalled();
    });

    test('passes full replacement and base version to the shared edit path', async () => {
        const editContent = vi.fn().mockResolvedValue(document);
        const tool = getEditContent({ editContent, documentsEnabled: true });
        if (!tool.execute) {
            throw new Error('Missing executor');
        }
        const args = {
            type: 'document' as const,
            slug: 'findings',
            documentEdit: {
                type: 'content' as const,
                baseVersionUuid: versionUuid,
                markdown: '<document-chart id="c1">\n\nNew text',
                charts: {},
            },
        };
        expect(await tool.execute(args, options)).toMatchObject({
            metadata: { status: 'success', href: document.href },
        });
        expect(editContent).toHaveBeenCalledWith(args);
    });

    test('rejects patch-based Document edits', async () => {
        const editContent = vi.fn();
        const tool = getEditContent({ editContent, documentsEnabled: true });
        if (!tool.execute) {
            throw new Error('Missing executor');
        }
        expect(
            await tool.execute(
                { type: 'document', slug: 'findings', patch: [] },
                options,
            ),
        ).toMatchObject({ metadata: { status: 'error' } });
        expect(editContent).not.toHaveBeenCalled();
    });

    test('reads one chart in full by id', async () => {
        const readContent = vi.fn().mockResolvedValue(document);
        const tool = getReadContent({ readContent, documentsEnabled: true });
        if (!tool.execute) {
            throw new Error('Missing executor');
        }
        await tool.execute(
            { type: 'document', slug: 'findings', chartId: 'c2' },
            options,
        );
        expect(readContent).toHaveBeenCalledWith({
            type: 'document',
            slug: 'findings',
            chartId: 'c2',
        });
    });

    test('places a chart from the conversation with <artifact-chart>', async () => {
        const createContent = vi.fn().mockResolvedValue(document);
        const access = artifacts();
        const tool = getCreateContent({
            createContent,
            documentsEnabled: true,
            artifacts: access,
        });
        if (!tool.execute) {
            throw new Error('Missing executor');
        }
        const result = await tool.execute(
            {
                type: 'document',
                content: {
                    ...input,
                    markdown: `# Revenue\n\n<artifact-chart version="${artifactVersionUuid}" title="Revenue">\n\n<query-result version="${artifactVersionUuid}" display="big_number">`,
                },
            },
            options,
        );
        expect(result).toMatchObject({ metadata: { status: 'success' } });
        expect(access.prepareVersion).toHaveBeenCalledWith(artifactVersionUuid);
        const [[{ content }]] = createContent.mock.calls;
        expect(content.markdown).toBe(
            '# Revenue\n\n<document-chart id="artifact-1">\n\n<document-chart id="artifact-2">',
        );
        expect(content.charts['artifact-1']).toEqual({
            source: 'semantic',
            chart: {
                name: 'Revenue',
                description: 'From chat',
                tableName: 'orders',
                metricQuery,
                chartConfig: { type: ChartType.CARTESIAN },
            },
        });
        expect(content.charts['artifact-2'].chart.chartConfig).toEqual({
            type: ChartType.BIG_NUMBER,
        });
    });

    test('replaces a chart with an artifact on edit', async () => {
        const editContent = vi.fn().mockResolvedValue(document);
        const tool = getEditContent({
            editContent,
            documentsEnabled: true,
            artifacts: artifacts(),
        });
        if (!tool.execute) {
            throw new Error('Missing executor');
        }
        await tool.execute(
            {
                type: 'document',
                slug: 'findings',
                documentEdit: {
                    type: 'content',
                    baseVersionUuid: versionUuid,
                    markdown: `<document-chart id="c1">\n\n<artifact-chart version="${artifactVersionUuid}">`,
                    charts: {},
                },
            },
            options,
        );
        const [[{ documentEdit }]] = editContent.mock.calls;
        expect(documentEdit.markdown).toBe(
            '<document-chart id="c1">\n\n<document-chart id="artifact-1">',
        );
        expect(Object.keys(documentEdit.charts)).toEqual(['artifact-1']);
    });

    test.each([
        ['without conversation charts', undefined, 'cannot be placed here'],
        [
            'for a merged chart',
            artifacts({
                ...preparedChart,
                merge: { queries: [] },
            } as unknown as PreparedChartAsCode),
            'Merged charts cannot be placed',
        ],
    ])('returns an actionable error %s', async (_label, access, message) => {
        const createContent = vi.fn();
        const tool = getCreateContent({
            createContent,
            documentsEnabled: true,
            artifacts: access,
        });
        if (!tool.execute) {
            throw new Error('Missing executor');
        }
        const result = await tool.execute(
            {
                type: 'document',
                content: {
                    ...input,
                    markdown: `<artifact-chart version="${artifactVersionUuid}">`,
                },
            },
            options,
        );
        expect(result).toMatchObject({
            metadata: { status: 'error' },
            result: expect.stringContaining(message),
        });
        expect(createContent).not.toHaveBeenCalled();
    });

    test.each([false, true])(
        'gates authoring instructions: %s',
        (enableDocuments) => {
            const prompt = getSystemPromptV2({
                availableExplores: [],
                enableContentTools: true,
                enableDocuments,
            });
            expect(
                prompt.content.includes(
                    'Create a Document only when the user explicitly asks',
                ),
            ).toBe(enableDocuments);
            if (enableDocuments) {
                expect(prompt.content).toContain(
                    'Ask the user when the destination is missing or ambiguous',
                );
                expect(prompt.content).toContain(
                    'keeping every unchanged chart as its <document-chart id="cN"> tag',
                );
                expect(prompt.content).toContain('<artifact-chart version=');
                expect(prompt.content).toContain('Use H1 for sections');
                expect(prompt.content).toContain(
                    'questions explored, evidence and findings, follow-up questions, and conclusions and limitations',
                );
                expect(prompt.content).toContain(
                    'Explicit user scope and format instructions take precedence',
                );
                expect(prompt.content).toContain(
                    'not private model reasoning or a verbatim transcript',
                );
                expect(prompt.content).toContain(
                    'do not invent findings or research steps',
                );
            } else {
                expect(prompt.content).not.toContain('research journey');
            }
        },
    );
});
