import {
    getDocumentUrl,
    type AiAgentMessageAssistant,
} from '@lightdash/common';
import { Stack } from '@mantine/core';
import { type FC } from 'react';
import { useOptionalProjectRoute } from '../../../../../hooks/useProjectRoute';
import { useProjects } from '../../../../../hooks/useProjects';
import { type StreamPart } from '../../store/aiAgentThreadStreamSlice';
import {
    AiDocumentCardButton,
    type AiDocumentCard,
} from './AiDocumentCardButton';

type Props = {
    projectUuid: string;
    agentUuid: string;
    message: Pick<
        AiAgentMessageAssistant,
        'uuid' | 'threadUuid' | 'toolResults'
    >;
    streamParts?: StreamPart[];
};

const getDocumentCard = (
    metadata: unknown,
    projectUuid: string,
    projectUrlIdentifier: string,
): AiDocumentCard | null => {
    if (
        !metadata ||
        typeof metadata !== 'object' ||
        !('status' in metadata) ||
        metadata.status !== 'success' ||
        !('uuid' in metadata) ||
        typeof metadata.uuid !== 'string' ||
        !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(metadata.uuid) ||
        !('name' in metadata) ||
        typeof metadata.name !== 'string' ||
        !metadata.name.trim() ||
        !('slug' in metadata) ||
        typeof metadata.slug !== 'string' ||
        !/^[a-zA-Z0-9_-]+$/.test(metadata.slug) ||
        !('href' in metadata) ||
        typeof metadata.href !== 'string' ||
        ![
            getDocumentUrl(projectUuid, metadata.uuid),
            getDocumentUrl(projectUrlIdentifier, metadata.uuid, metadata.slug),
        ].includes(metadata.href)
    ) {
        return null;
    }
    return {
        uuid: metadata.uuid,
        name: metadata.name,
        href: getDocumentUrl(
            projectUrlIdentifier,
            metadata.uuid,
            metadata.slug,
        ),
    };
};

const AiDocumentCards: FC<Props> = ({
    projectUuid,
    agentUuid,
    message,
    streamParts,
}) => {
    const projectRoute = useOptionalProjectRoute();
    const currentProjectRoute =
        projectRoute?.projectUuid === projectUuid ? projectRoute : null;
    const { data: projects } = useProjects({ enabled: !currentProjectRoute });
    const projectUrlIdentifier =
        currentProjectRoute?.projectUrlIdentifier ??
        projects?.find((project) => project.projectUuid === projectUuid)
            ?.slug ??
        projectUuid;
    const results = [
        ...message.toolResults.filter(
            (result) => result.toolType === 'built-in',
        ),
        ...(streamParts ?? []).flatMap((part) => {
            if (
                part.type !== 'toolCall' ||
                part.isPreliminary ||
                (part.toolName !== 'createContent' &&
                    part.toolName !== 'editContent')
            ) {
                return [];
            }
            if (!part.toolResult) {
                return [];
            }
            return [{ toolName: part.toolName, ...part.toolResult }];
        }),
    ];
    const documents = new Map(
        results.flatMap((result) => {
            if (
                result.toolName !== 'createContent' &&
                result.toolName !== 'editContent'
            ) {
                return [];
            }
            const document = getDocumentCard(
                result.metadata,
                projectUuid,
                projectUrlIdentifier,
            );
            return document ? [[document.uuid, document] as const] : [];
        }),
    );

    if (!documents.size) {
        return null;
    }

    return (
        <Stack gap="xs">
            {[...documents.values()].map((document) => (
                <AiDocumentCardButton
                    key={document.uuid}
                    projectUuid={projectUuid}
                    agentUuid={agentUuid}
                    threadUuid={message.threadUuid}
                    messageUuid={message.uuid}
                    document={document}
                />
            ))}
        </Stack>
    );
};

export default AiDocumentCards;
