import { type AiDeepResearchRunDocument } from '@lightdash/common';
import { validate as isValidUuid } from 'uuid';
import { type AiAgentModel } from '../../models/AiAgentModel';

/**
 * Tool call recording the Document a run published its report to. Model
 * providers replay it in thread history, so it uses only [a-zA-Z0-9_-].
 */
export const getAiDeepResearchDocumentToolCallId = (
    aiDeepResearchRunUuid: string,
): string => `deep-research-${aiDeepResearchRunUuid}-document`;

const parseRunDocument = (
    metadata: object | null,
): AiDeepResearchRunDocument | null => {
    if (
        !metadata ||
        !('status' in metadata) ||
        !('uuid' in metadata) ||
        !('name' in metadata) ||
        !('slug' in metadata) ||
        metadata.status !== 'success' ||
        typeof metadata.uuid !== 'string' ||
        !isValidUuid(metadata.uuid) ||
        typeof metadata.name !== 'string' ||
        typeof metadata.slug !== 'string'
    ) {
        return null;
    }
    return {
        documentUuid: metadata.uuid,
        name: metadata.name,
        slug: metadata.slug,
    };
};

/** The Document each run published, by run uuid. */
export const findAiDeepResearchRunDocuments = async (
    aiAgentModel: Pick<AiAgentModel, 'findToolResultsByToolCallIds'>,
    runs: Array<{ ai_deep_research_run_uuid: string; prompt_uuid: string }>,
): Promise<Map<string, AiDeepResearchRunDocument>> => {
    if (runs.length === 0) {
        return new Map();
    }
    const runUuidByToolCallId = new Map(
        runs.map((run) => [
            getAiDeepResearchDocumentToolCallId(run.ai_deep_research_run_uuid),
            run.ai_deep_research_run_uuid,
        ]),
    );
    const results = await aiAgentModel.findToolResultsByToolCallIds(
        [...new Set(runs.map((run) => run.prompt_uuid))],
        [...runUuidByToolCallId.keys()],
    );
    return new Map(
        results.flatMap((result) => {
            const runUuid = runUuidByToolCallId.get(result.toolCallId);
            const document = parseRunDocument(result.metadata);
            return runUuid && document ? [[runUuid, document] as const] : [];
        }),
    );
};
