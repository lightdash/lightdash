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
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import MantineIcon from '../../../../../components/common/MantineIcon';
import DocumentRenderer from '../../../../../features/documents/DocumentRenderer';
import SaveDocumentToSpaceButton from '../../../../../features/documents/SaveDocumentToSpaceButton';
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
    const { t } = useTranslation('aiCopilotChat');
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
            aria-label={t('actions.close', { ns: 'common' })}
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
                                delayedMessage={t('documentPreview.loading')}
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
                        <SaveDocumentToSpaceButton
                            document={document}
                            size="xs"
                        />
                        <Tooltip label={t('documentPreview.open')}>
                            <ActionIcon
                                component={Link}
                                to={getDocumentUrl(
                                    document.projectUuid,
                                    document.documentUuid,
                                    document.slug,
                                )}
                                size="sm"
                                aria-label={t('documentPreview.open')}
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
