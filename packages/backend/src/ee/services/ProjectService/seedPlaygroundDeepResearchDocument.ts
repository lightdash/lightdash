import {
    DOCUMENT_SCHEMA_VERSION,
    parseDocumentContent,
} from '@lightdash/common';
import path from 'path';
import { type DocumentModel } from '../../../models/DocumentModel';
import { type AiAgentModel } from '../../models/AiAgentModel';
import { type AiDeepResearchRunModel } from '../../models/AiDeepResearchRunModel';
import {
    findAiDeepResearchRunDocuments,
    recordAiDeepResearchRunDocument,
} from '../AiDeepResearchService/runDocument';
import { toDeepResearchDocument } from '../AiDeepResearchService/toDeepResearchDocument';
import { loadPlaygroundContent } from './loadPlaygroundContent';
import { type PlaygroundContent } from './playgroundContentTypes';

/**
 * Publishes the bundle's deep research report as a Document for each of the
 * project's finished sample runs, the way a real run publishes one, so the
 * run card opens it. A run that already has its Document is left alone, so
 * seeding the same project twice adds nothing.
 */
export const seedPlaygroundDeepResearchDocument = async ({
    projectUuid,
    spaceUuid,
    createdByUserUuid,
    content,
    documentModel,
    aiDeepResearchRunModel,
    aiAgentModel,
}: {
    projectUuid: string;
    spaceUuid: string;
    createdByUserUuid: string | null;
    content: Pick<PlaygroundContent, 'deepResearch'>;
    documentModel: Pick<DocumentModel, 'create'>;
    aiDeepResearchRunModel: Pick<
        AiDeepResearchRunModel,
        'findCompletedByProjectAndPrompt'
    >;
    aiAgentModel: Pick<
        AiAgentModel,
        'findToolResultsByToolCallIds' | 'createToolCall' | 'createToolResults'
    >;
}): Promise<void> => {
    const research = content.deepResearch;
    if (!research) return;
    const runs = await aiDeepResearchRunModel.findCompletedByProjectAndPrompt({
        projectUuid,
        prompt: research.prompt,
    });
    const published = await findAiDeepResearchRunDocuments(aiAgentModel, runs);
    const { name, content: documentContent } = toDeepResearchDocument({
        markdown: research.resultMarkdown,
        charts: new Map(),
        fallbackName: research.threadTitle,
    });
    await runs
        .filter((run) => !published.has(run.ai_deep_research_run_uuid))
        .reduce<Promise<void>>(async (previous, run) => {
            await previous;
            const document = await documentModel.create({
                projectUuid,
                spaceUuid,
                name,
                uniqueSlug: true,
                description: research.prompt,
                content: parseDocumentContent(
                    DOCUMENT_SCHEMA_VERSION,
                    documentContent,
                ),
                createdByUserUuid,
            });
            await recordAiDeepResearchRunDocument(
                aiAgentModel,
                { ...run, project_uuid: projectUuid },
                {
                    documentUuid: document.documentUuid,
                    name: document.name,
                    slug: document.slug,
                },
            );
        }, Promise.resolve());
};

/** A training copy's deep research Document, read from the shipped bundle. */
export const seedTrainingCopyDeepResearchDocument = async (
    args: Omit<
        Parameters<typeof seedPlaygroundDeepResearchDocument>[0],
        'content'
    >,
): Promise<void> => {
    const content = await loadPlaygroundContent(
        path.resolve(
            process.env.PLAYGROUND_DATA_DIR ??
                path.join(__dirname, '../../../../assets/playground'),
        ),
    );
    await seedPlaygroundDeepResearchDocument({ ...args, content });
};
