import {
    getAiProjectContextObjectKey,
    type AiAgentJudgeProjectContextEntry,
    type AiProjectContextObjectRef,
    type AiProjectContextTypedObjectRef,
    type ProjectContextEntry,
} from '@lightdash/common';
import { createHash } from 'crypto';

const getObjectKey = (object: AiProjectContextObjectRef): string =>
    typeof object === 'string'
        ? `legacy:${object}`
        : getAiProjectContextObjectKey(object);

export const buildMemoryPromotionEntry = ({
    proposal,
    memory,
    currentEntries,
}: {
    proposal: Omit<AiAgentJudgeProjectContextEntry, 'terms' | 'objects'>;
    memory: { terms: string[]; objects: AiProjectContextTypedObjectRef[] };
    currentEntries: ProjectContextEntry[];
}): AiAgentJudgeProjectContextEntry => {
    const currentEntry =
        proposal.op === 'update'
            ? currentEntries.find((entry) => entry.id === proposal.id)
            : undefined;
    const terms = [
        ...new Set([...(currentEntry?.terms ?? []), ...memory.terms]),
    ];
    const objects = new Map(
        [...(currentEntry?.objects ?? []), ...memory.objects].map((object) => [
            getObjectKey(object),
            object,
        ]),
    );

    return { ...proposal, terms, objects: [...objects.values()] };
};

export const getMemoryPromotionFingerprint = ({
    organizationUuid,
    projectUuid,
    memoryUuid,
}: {
    organizationUuid: string;
    projectUuid: string;
    memoryUuid: string;
}): string =>
    `memory:${createHash('sha256')
        .update(JSON.stringify([organizationUuid, projectUuid, memoryUuid]))
        .digest('hex')}`;
