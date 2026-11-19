import path from 'path';
import { getAiDeepResearchDocumentToolCallId } from '../AiDeepResearchService/runDocument';
import { loadPlaygroundContent } from './loadPlaygroundContent';
import { seedPlaygroundDeepResearchDocument } from './seedPlaygroundDeepResearchDocument';

const PLAYGROUND_DIR = path.resolve(__dirname, '../../../../assets/playground');

const RUN = {
    ai_deep_research_run_uuid: 'run-uuid',
    prompt_uuid: 'prompt-uuid',
    ai_thread_uuid: 'thread-uuid',
};

const setup = ({
    runs = [RUN],
    published = [] as Array<{ toolCallId: string; metadata: object }>,
} = {}) => ({
    documentModel: {
        create: vi.fn().mockResolvedValue({
            documentUuid: '3f1d9a52-1d1c-4b7e-9a51-0d8c2f6e7a10',
            name: 'Why returns rose in the spring',
            slug: 'why-returns-rose-in-the-spring',
        }),
    },
    aiDeepResearchRunModel: {
        findCompletedByProjectAndPrompt: vi.fn().mockResolvedValue(runs),
    },
    aiAgentModel: {
        findToolResultsByToolCallIds: vi.fn().mockResolvedValue(published),
        createToolCall: vi.fn().mockResolvedValue(undefined),
        createToolResults: vi.fn().mockResolvedValue(undefined),
    },
});

describe('seedPlaygroundDeepResearchDocument', () => {
    it('publishes the shipped report as a Document the run card opens', async () => {
        const content = await loadPlaygroundContent(PLAYGROUND_DIR);
        const models = setup();
        await seedPlaygroundDeepResearchDocument({
            projectUuid: 'copy',
            spaceUuid: 'training-space',
            createdByUserUuid: 'creator',
            content,
            ...models,
        });

        expect(
            models.aiDeepResearchRunModel.findCompletedByProjectAndPrompt,
        ).toHaveBeenCalledWith({
            projectUuid: 'copy',
            prompt: content.deepResearch?.prompt,
        });
        const [document] = models.documentModel.create.mock.calls[0];
        expect(document).toEqual(
            expect.objectContaining({
                projectUuid: 'copy',
                spaceUuid: 'training-space',
                name: 'Why returns rose in the spring',
                uniqueSlug: true,
                description: content.deepResearch?.prompt,
                createdByUserUuid: 'creator',
            }),
        );
        // The report's title becomes the name; its findings become sections
        expect(document.content.markdown).not.toMatch(/^# Why returns rose/m);
        expect(document.content.markdown).toMatch(
            /^# Returns grew faster than orders$/m,
        );
        const toolCallId = getAiDeepResearchDocumentToolCallId('run-uuid');
        expect(models.aiAgentModel.createToolCall).toHaveBeenCalledWith({
            promptUuid: 'prompt-uuid',
            toolCallId,
            toolName: 'createContent',
            toolArgs: {
                type: 'document',
                uuid: '3f1d9a52-1d1c-4b7e-9a51-0d8c2f6e7a10',
            },
            parentToolCallId: null,
        });
        expect(models.aiAgentModel.createToolResults).toHaveBeenCalledWith([
            expect.objectContaining({
                promptUuid: 'prompt-uuid',
                toolCallId,
                metadata: expect.objectContaining({
                    status: 'success',
                    uuid: '3f1d9a52-1d1c-4b7e-9a51-0d8c2f6e7a10',
                    slug: 'why-returns-rose-in-the-spring',
                }),
            }),
        ]);
    });

    it('leaves a run that already has its Document alone', async () => {
        const content = await loadPlaygroundContent(PLAYGROUND_DIR);
        const models = setup({
            published: [
                {
                    toolCallId: getAiDeepResearchDocumentToolCallId('run-uuid'),
                    metadata: {
                        status: 'success',
                        uuid: '3f1d9a52-1d1c-4b7e-9a51-0d8c2f6e7a10',
                        name: 'Why returns rose in the spring',
                        slug: 'why-returns-rose-in-the-spring',
                    },
                },
            ],
        });
        await seedPlaygroundDeepResearchDocument({
            projectUuid: 'copy',
            spaceUuid: 'training-space',
            createdByUserUuid: 'creator',
            content,
            ...models,
        });
        expect(models.documentModel.create).not.toHaveBeenCalled();
        expect(models.aiAgentModel.createToolCall).not.toHaveBeenCalled();
    });

    it('does nothing for a bundle without deep research', async () => {
        const models = setup();
        await seedPlaygroundDeepResearchDocument({
            projectUuid: 'copy',
            spaceUuid: 'training-space',
            createdByUserUuid: 'creator',
            content: {},
            ...models,
        });
        expect(
            models.aiDeepResearchRunModel.findCompletedByProjectAndPrompt,
        ).not.toHaveBeenCalled();
        expect(models.documentModel.create).not.toHaveBeenCalled();
    });
});
