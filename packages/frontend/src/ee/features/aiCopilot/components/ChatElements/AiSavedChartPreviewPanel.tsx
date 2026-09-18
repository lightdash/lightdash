import { type ContentVerificationInfo } from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Center,
    Group,
    Loader,
    Menu,
    Stack,
    Text,
    Tooltip,
} from '@mantine/core';
import {
    IconCircleCheckFilled,
    IconDots,
    IconExternalLink,
    IconX,
} from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import TruncatedText from '../../../../../components/common/TruncatedText';
import { useContentAuthoringEnabled } from '../../../../../hooks/useContentAuthoringEnabled';
import { useSavedQuery } from '../../../../../hooks/useSavedQuery';
import useEmbed from '../../../../providers/Embed/useEmbed';
import { useUiStrings } from '../../../../providers/Embed/useUiStrings';
import { useEmbedSavedContentLink } from '../../hooks/useEmbedSavedContentLink';
import {
    clearPreview,
    type SavedChartPreviewData,
} from '../../store/aiArtifactSlice';
import { useAiAgentStoreDispatch } from '../../store/hooks';
import artifactStyles from './AiArtifactPanel.module.css';
import { AiSavedChartVisualization } from './AiSavedChartVisualization';

type Props = {
    savedChartPreview: SavedChartPreviewData;
};

const VerifiedBadge: FC<{ verification: ContentVerificationInfo }> = ({
    verification,
}) => {
    const verifiedDate = new Date(verification.verifiedAt).toLocaleDateString();

    return (
        <Tooltip
            maw={300}
            position="bottom"
            label={`Verified by ${verification.verifiedBy.firstName} ${verification.verifiedBy.lastName} on ${verifiedDate}`}
        >
            <Box component="span" lh={0} c="green.6">
                <MantineIcon icon={IconCircleCheckFilled} size={16} />
            </Box>
        </Tooltip>
    );
};

const SavedChartPreviewPanel: FC<Props> = ({ savedChartPreview }) => {
    const authoringEnabled = useContentAuthoringEnabled();
    const dispatch = useAiAgentStoreDispatch();

    const {
        data: savedChart,
        isInitialLoading,
        isError,
    } = useSavedQuery({
        uuidOrSlug: savedChartPreview.savedChartUuid,
        projectUuid: savedChartPreview.projectUuid,
    });

    const chartUrl = `/projects/${savedChartPreview.projectUuid}/saved/${savedChartPreview.savedChartUuid}/view`;

    const closeButton = (
        <ActionIcon
            size="sm"
            onClick={() => dispatch(clearPreview())}
            aria-label="Close"
        >
            <MantineIcon icon={IconX} />
        </ActionIcon>
    );

    if (isError) {
        return (
            <div className={artifactStyles.floatingPanel}>
                <Center className={artifactStyles.loading}>
                    <Stack gap="xs" align="center">
                        <Text size="xs" c="dimmed" ta="center">
                            Failed to load chart. Please try again.
                        </Text>
                        {closeButton}
                    </Stack>
                </Center>
            </div>
        );
    }

    if (isInitialLoading || !savedChart) {
        return (
            <div className={artifactStyles.floatingPanel}>
                <Center className={artifactStyles.loading}>
                    <Stack gap="xs" align="center">
                        <Loader
                            type="dots"
                            color="gray"
                            delayedMessage="Loading chart..."
                        />
                        {closeButton}
                    </Stack>
                </Center>
            </div>
        );
    }

    return (
        <div className={artifactStyles.floatingPanel}>
            <div className={artifactStyles.floatingContent}>
                <div className={artifactStyles.head}>
                    <Stack gap={0} flex={1} miw={0}>
                        <TruncatedText fz="sm" fw={600} maxWidth="100%">
                            {savedChart.name}
                        </TruncatedText>
                        {savedChart.description && (
                            <TruncatedText fz="xs" c="dimmed" maxWidth="100%">
                                {savedChart.description}
                            </TruncatedText>
                        )}
                    </Stack>

                    <Group gap={2} className={artifactStyles.headRight}>
                        {savedChart.verification && (
                            <VerifiedBadge
                                verification={savedChart.verification}
                            />
                        )}
                        <Menu position="bottom-end">
                            <Menu.Target>
                                <Tooltip label="More options">
                                    <ActionIcon
                                        size="sm"
                                        aria-label="More options"
                                    >
                                        <MantineIcon icon={IconDots} />
                                    </ActionIcon>
                                </Tooltip>
                            </Menu.Target>
                            <Menu.Dropdown>
                                <Menu.Item
                                    display={
                                        authoringEnabled ? undefined : 'none'
                                    }
                                    component="a"
                                    href={chartUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    leftSection={
                                        <MantineIcon
                                            icon={IconExternalLink}
                                            size="sm"
                                        />
                                    }
                                >
                                    Explore from here
                                </Menu.Item>
                            </Menu.Dropdown>
                        </Menu>
                        {closeButton}
                    </Group>
                </div>

                <Box flex={1} mih={0}>
                    <AiSavedChartVisualization
                        projectUuid={savedChartPreview.projectUuid}
                        savedChart={savedChart}
                    />
                </Box>
            </div>
        </div>
    );
};

export const AiSavedChartPreviewPanel: FC<Props> = ({ savedChartPreview }) => {
    const href = useEmbedSavedContentLink(
        `/projects/${savedChartPreview.projectUuid}/saved/${savedChartPreview.savedChartUuid}`,
    );
    const { content } = useEmbed();
    const dispatch = useAiAgentStoreDispatch();
    const getUiString = useUiStrings();
    if (content?.type !== 'aiAgent')
        return <SavedChartPreviewPanel savedChartPreview={savedChartPreview} />;
    return (
        <Box className={artifactStyles.floatingPanel}>
            <Stack h="100%" gap={0}>
                <Group justify="flex-end" p="xs">
                    <ActionIcon
                        size="sm"
                        onClick={() => dispatch(clearPreview())}
                        aria-label={getUiString('page.closeDetails')}
                    >
                        <MantineIcon icon={IconX} />
                    </ActionIcon>
                </Group>
                {href ? (
                    <Box
                        component="iframe"
                        src={href}
                        title={getUiString('aiAgent.savedContent.previewTitle')}
                        referrerPolicy="no-referrer"
                        className={artifactStyles.embeddedContent}
                    />
                ) : (
                    <Loader />
                )}
            </Stack>
        </Box>
    );
};
