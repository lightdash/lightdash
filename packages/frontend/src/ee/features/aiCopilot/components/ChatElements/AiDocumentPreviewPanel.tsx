import { getDocumentUrl } from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Center,
    Group,
    Loader,
    Stack,
    Text,
    Tooltip,
} from '@mantine/core';
import { IconExternalLink, IconX } from '@tabler/icons-react';
import { type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../../../components/common/MantineIcon';
import DocumentRenderer from '../../../../../features/documents/DocumentRenderer';
import { useDocument } from '../../../../../features/documents/useDocument';
import {
    clearPreview,
    type DocumentPreviewData,
} from '../../store/aiArtifactSlice';
import { useAiAgentStoreDispatch } from '../../store/hooks';
import artifactStyles from './AiArtifactPanel.module.css';

type Props = {
    documentPreview: DocumentPreviewData;
};

export const AiDocumentPreviewPanel: FC<Props> = ({ documentPreview }) => {
    const dispatch = useAiAgentStoreDispatch();
    const {
        data: document,
        isInitialLoading,
        isError,
    } = useDocument(
        documentPreview.projectUuid,
        documentPreview.documentUuidOrSlug,
    );

    const closeButton = (
        <ActionIcon
            size="sm"
            onClick={() => dispatch(clearPreview())}
            aria-label="Close"
        >
            <MantineIcon icon={IconX} />
        </ActionIcon>
    );

    if (isError || isInitialLoading || !document) {
        return (
            <Box className={artifactStyles.floatingPanel}>
                <Center className={artifactStyles.loading}>
                    <Stack gap="xs" align="center">
                        {isError ? (
                            <Text size="xs" c="dimmed" ta="center">
                                Failed to load document. Please try again.
                            </Text>
                        ) : (
                            <Loader
                                type="dots"
                                color="gray"
                                delayedMessage="Loading document..."
                            />
                        )}
                        {closeButton}
                    </Stack>
                </Center>
            </Box>
        );
    }

    return (
        <Box className={artifactStyles.floatingPanel}>
            <DocumentRenderer
                document={document}
                showContents={false}
                actions={
                    <Group gap={2} wrap="nowrap">
                        <Tooltip label="Open Document">
                            <ActionIcon
                                component={Link}
                                to={getDocumentUrl(
                                    document.projectUuid,
                                    document.documentUuid,
                                    document.slug,
                                )}
                                size="sm"
                                aria-label="Open Document"
                            >
                                <MantineIcon icon={IconExternalLink} />
                            </ActionIcon>
                        </Tooltip>
                        {closeButton}
                    </Group>
                }
            />
        </Box>
    );
};
