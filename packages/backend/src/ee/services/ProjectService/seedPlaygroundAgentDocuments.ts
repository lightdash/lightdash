import { AI_AGENT_DOCUMENT_ORG_QUOTA_BYTES } from '@lightdash/common';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import Logger from '../../../logging/logger';
import { type AiAgentDocumentModel } from '../../models/AiAgentDocumentModel';
import { type AiAgentModel } from '../../models/AiAgentModel';
import { loadPlaygroundContent } from './loadPlaygroundContent';
import { type PlaygroundContent } from './playgroundContentTypes';

/**
 * Gives the project's training agent (found by the bundle agent's slug) the
 * bundle's knowledge documents, scoped to that project and granted to that
 * agent only. A document the agent already has, by name, is left alone, a
 * project without the agent gets nothing, and an organization at its
 * document quota gets nothing either (the sample never pushes it over).
 */
export const seedPlaygroundAgentDocuments = async ({
    organizationUuid,
    projectUuid,
    createdByUserUuid,
    content,
    aiAgentModel,
    aiAgentDocumentModel,
}: {
    organizationUuid: string;
    projectUuid: string;
    createdByUserUuid: string | null;
    content: Pick<PlaygroundContent, 'agent'>;
    aiAgentModel: Pick<AiAgentModel, 'findAgentsForCode'>;
    aiAgentDocumentModel: Pick<
        AiAgentDocumentModel,
        'findAllForAgent' | 'create' | 'getOrganizationContentSize'
    >;
}): Promise<void> => {
    const definitions = content.agent?.knowledgeDocuments;
    if (!content.agent || !definitions?.length) return;
    const [agent] = await aiAgentModel.findAgentsForCode({
        organizationUuid,
        projectUuid,
        slugs: [content.agent.slug],
    });
    if (!agent) {
        Logger.warn(
            `Project ${projectUuid} has no "${content.agent.slug}" agent; skipping its sample knowledge documents`,
        );
        return;
    }
    const existing = await aiAgentDocumentModel.findAllForAgent({
        organizationUuid,
        agentUuid: agent.uuid,
        projectUuid,
    });
    await definitions.reduce<Promise<void>>(async (previous, definition) => {
        await previous;
        if (existing.some(({ name }) => name === definition.name)) return;
        const used =
            await aiAgentDocumentModel.getOrganizationContentSize(
                organizationUuid,
            );
        if (
            used + Buffer.byteLength(definition.content, 'utf8') >
            AI_AGENT_DOCUMENT_ORG_QUOTA_BYTES
        ) {
            Logger.warn(
                `Project ${projectUuid}: the organization is at its knowledge document quota; skipping the sample "${definition.name}"`,
            );
            return;
        }
        await aiAgentDocumentModel.create({
            organizationUuid,
            projectUuid,
            name: definition.name,
            originalFilename: definition.originalFilename,
            mimeType: 'text/markdown',
            content: definition.content,
            summary: definition.summary,
            storageKey: `org/${organizationUuid}/doc/${uuidv4()}.md`,
            agentUuids: [agent.uuid],
            createdByUserUuid,
        });
    }, Promise.resolve());
};

/** A training copy's knowledge documents, read from the shipped bundle. */
export const seedTrainingCopyAgentDocuments = async (
    args: Omit<Parameters<typeof seedPlaygroundAgentDocuments>[0], 'content'>,
): Promise<void> => {
    const content = await loadPlaygroundContent(
        path.resolve(
            process.env.PLAYGROUND_DATA_DIR ??
                path.join(__dirname, '../../../../assets/playground'),
        ),
    );
    await seedPlaygroundAgentDocuments({ ...args, content });
};
