import { Box, Text, UnstyledButton } from '@mantine/core';
import { IconChevronRight, IconFileText } from '@tabler/icons-react';
import { type FC, type MouseEvent } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { useDocument } from '../../../../../features/documents/useDocument';
import useIsEmbedded from '../../../../providers/Embed/useIsEmbedded';
import { selectPreview, setPreview } from '../../store/aiArtifactSlice';
import {
    useAiAgentStoreDispatch,
    useAiAgentStoreSelector,
} from '../../store/hooks';
import styles from './ArtifactButton/AiArtifactButton.module.css';
import { isPlainLeftClick } from './useDataAppPreviewLink';

export type AiDocumentCard = { uuid: string; name: string; href: string };

type Props = {
    projectUuid: string;
    agentUuid: string;
    threadUuid: string;
    messageUuid: string;
    document: AiDocumentCard;
    onOpen?: () => void;
};

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

export const AiDocumentCardButton: FC<Props> = ({
    projectUuid,
    agentUuid,
    threadUuid,
    messageUuid,
    document,
    onOpen,
}) => {
    const dispatch = useAiAgentStoreDispatch();
    const currentPreview = useAiAgentStoreSelector(selectPreview);
    const isEmbed = useIsEmbedded();

    // Opens in the side panel like chart artifacts; modified clicks keep the link
    const openPreview = (event: MouseEvent<HTMLAnchorElement>) => {
        onOpen?.();
        if (isEmbed || !isPlainLeftClick(event)) {
            return;
        }
        event.preventDefault();
        dispatch(
            setPreview({
                type: 'document',
                documentUuidOrSlug: document.uuid,
                messageUuid,
                threadUuid,
                projectUuid,
                agentUuid,
            }),
        );
    };

    return (
        <UnstyledButton
            component={Link}
            to={document.href}
            onClick={openPreview}
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
                    <Text className={styles.title}>{document.name}</Text>
                </Box>
                <MantineIcon
                    icon={IconChevronRight}
                    size={14}
                    className={styles.chevron}
                />
            </Box>
        </UnstyledButton>
    );
};
