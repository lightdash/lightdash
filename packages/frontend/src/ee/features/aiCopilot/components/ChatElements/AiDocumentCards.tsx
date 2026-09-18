import {
    getDocumentUrl,
    type AiAgentMessageAssistant,
} from '@lightdash/common';
import { Box, Stack, Text, UnstyledButton } from '@mantine/core';
import { IconChevronRight, IconFileText } from '@tabler/icons-react';
import { type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { useOptionalProjectRoute } from '../../../../../hooks/useProjectRoute';
import { useProjects } from '../../../../../hooks/useProjects';
import { type StreamPart } from '../../store/aiAgentThreadStreamSlice';
import styles from './ArtifactButton/AiArtifactButton.module.css';

type Props = {
    projectUuid: string;
    toolResults: AiAgentMessageAssistant['toolResults'];
    streamParts?: StreamPart[];
};

type DocumentCard = { uuid: string; name: string; href: string };

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
    toolResults,
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
        ...toolResults.filter((result) => result.toolType === 'built-in'),
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
                <UnstyledButton
                    key={document.uuid}
                    component={Link}
                    to={document.href}
                    className={styles.artifactButton}
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
                            <Text size="xs" c="dimmed">
                                Document
                            </Text>
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
