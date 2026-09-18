import {
    ConflictError,
    toolCreateContentOutputSchema,
} from '@lightdash/common';
import { asSchema, type FlexibleSchema, type ToolExecutionOptions } from 'ai';
import { getSystemPromptV2 } from '../prompts/systemV2';
import type { DocumentContentResult } from '../types/aiAgentDependencies';
import { getCreateContent } from './createContent';
import { getEditContent } from './editContent';
import { getReadContent } from './readContent';

const versionUuid = '83b3faf3-a320-49ae-8119-0117e813723e';
const documentUuid = 'ccf2dbb5-26f0-4ea3-94e7-758de087326f';
const document: DocumentContentResult = {
    type: 'document',
    uuid: documentUuid,
    href: `/projects/project/documents/${documentUuid}`,
    versionUuid,
    content: {
        schemaVersion: 1,
        name: 'Findings',
        slug: 'findings',
        description: 'Order analysis',
        spaceSlug: 'reports',
        content: {
            cells: [
                {
                    type: 'markdown',
                    content: {
                        markdown: '# Findings\n\n## Detail\n\nEvidence.',
                    },
                },
            ],
        },
    },
};
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
            { type: 'document', content: document.content },
            options,
        );
        if (Symbol.asyncIterator in result) {
            throw new Error('Unexpected streamed output');
        }
        expect(createContent).toHaveBeenCalledWith({
            type: 'document',
            content: document.content,
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
            { type: 'document', content: document.content },
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
                    content: document.content.content,
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
                content: document.content.content,
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
                    'Include every cell to retain',
                );
                expect(prompt.content).toContain('Use H1 for sections');
            }
        },
    );
});
