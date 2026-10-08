import {
    getDocumentUrl,
    type AiAgentMessageAssistant,
} from '@lightdash/common';
import { Box, Stack, Text, UnstyledButton } from '@mantine/core';
import { IconChevronRight, IconFileText } from '@tabler/icons-react';
import { type FC, type MouseEvent } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { useDocument } from '../../../../../features/documents/useDocument';
import { useOptionalProjectRoute } from '../../../../../hooks/useProjectRoute';
import { useProjects } from '../../../../../hooks/useProjects';
import useIsEmbedded from '../../../../providers/Embed/useIsEmbedded';
import { type StreamPart } from '../../store/aiAgentThreadStreamSlice';
import { selectPreview, setPreview } from '../../store/aiArtifactSlice';
import {
    useAiAgentStoreDispatch,
    useAiAgentStoreSelector,
} from '../../store/hooks';
import styles from './ArtifactButton/AiArtifactButton.module.css';
import { isPlainLeftClick } from './useDataAppPreviewLink';

type Props = {
    projectUuid: string;
    agentUuid: string;
    message: Pick<
        AiAgentMessageAssistant,
        'uuid' | 'threadUuid' | 'toolResults'
    >;
    streamParts?: StreamPart[];
};

type DocumentCard = { uuid: string; name: string; href: string };

const DocumentCardLabel: FC<{
    projectUuid: string;
    documentUuid: string;
    isEmbed: boolean;
}> = ({ projectUuid, documentUuid, isEmbed }) => {
    // Embeds can't read Documents directly, so they keep the plain label
    const { data: document } = useDocument(projectUuid, documentUuid, {
        enabled: !isEmbed,
    });
    return (
        <Text size="xs" c="dimmed">
            {document?.spaceUuid === null ? 'Personal document' : 'Document'}
        </Text>
    );
};

const getDocumentCard = (
    metadata: unknown,
    projectUuid: string,
    projectUrlIdentifier: string,
): DocumentCard | null => {
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
    const dispatch = useAiAgentStoreDispatch();
    const currentPreview = useAiAgentStoreSelector(selectPreview);
    const isEmbed = useIsEmbedded();
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

    // Opens in the side panel like chart artifacts; modified clicks keep the link
    const openPreview = (
        event: MouseEvent<HTMLAnchorElement>,
        document: DocumentCard,
    ) => {
        if (isEmbed || !isPlainLeftClick(event)) {
            return;
        }
        event.preventDefault();
        dispatch(
            setPreview({
                type: 'document',
                documentUuidOrSlug: document.uuid,
                messageUuid: message.uuid,
                threadUuid: message.threadUuid,
                projectUuid,
                agentUuid,
            }),
        );
    };

    return (
        <Stack gap="xs">
            {[...documents.values()].map((document) => (
                <UnstyledButton
                    key={document.uuid}
                    component={Link}
                    to={document.href}
                    onClick={(event: MouseEvent<HTMLAnchorElement>) =>
                        openPreview(event, document)
                    }
                    className={styles.artifactButton}
                    data-artifact-open={
                        currentPreview?.type === 'document' &&
                        currentPreview.documentUuidOrSlug === document.uuid
                    }
                >
                    <Box className={styles.container}>
                        <Box className={styles.iconChip}>
                            <MantineIcon
                                icon={IconFileText}
                                size={14}
                                className={styles.icon}
                            />
                        </Box>
                        <Box className={styles.content}>
                            <DocumentCardLabel
                                projectUuid={projectUuid}
                                documentUuid={document.uuid}
                                isEmbed={isEmbed}
                            />
                            <Text className={styles.title}>
                                {document.name}
                            </Text>
                        </Box>
                        <MantineIcon
                            icon={IconChevronRight}
                            size={14}
                            className={styles.chevron}
                        />
                    </Box>
                </UnstyledButton>
            ))}
        </Stack>
    );
};

export default AiDocumentCards;
