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
} from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { useContentAuthoringEnabled } from '../../../../../hooks/useContentAuthoringEnabled';
import { useSavedQuery } from '../../../../../hooks/useSavedQuery';
import { useAbilityContext } from '../../../../../providers/Ability/useAbilityContext';
import useEmbed from '../../../../providers/Embed/useEmbed';
import useIsEmbedded from '../../../../providers/Embed/useIsEmbedded';
import {
    clearPreview,
    type SavedChartPreviewData,
} from '../../store/aiArtifactSlice';
import { useAiAgentStoreDispatch } from '../../store/hooks';
import artifactStyles from './AiArtifactPanel.module.css';
import { AiSavedChartVisualization } from './AiSavedChartVisualization';
import { ArtifactWindowControls } from './ArtifactFocusToggle';
import { ArtifactPanelHeading } from './ArtifactPanelHeading';

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

export const AiSavedChartPreviewPanel: FC<Props> = ({ savedChartPreview }) => {
    const authoringEnabled = useContentAuthoringEnabled();
    const dispatch = useAiAgentStoreDispatch();
    const ability = useAbilityContext();
    const { content, onExplore, aiAgentNavigationDisabled } = useEmbed();
    const isEmbed = useIsEmbedded();

    const {
        data: savedChart,
        isInitialLoading,
        isError,
    } = useSavedQuery({
        uuidOrSlug: savedChartPreview.savedChartUuid,
        projectUuid: savedChartPreview.projectUuid,
    });

    const chartUrl = `/projects/${savedChartPreview.projectUuid}/saved/${savedChartPreview.savedChartUuid}/view`;
    // Inside an embed the full app is unreachable, so Explore stays in the
    // iframe and only when the token grants it, like AiChartQuickOptions.
    const canExploreFromEmbed =
        content?.type === 'aiAgent' &&
        (content.canExplore === true || ability.can('view', 'EmbedExplore'));
    const hasExploreAction = isEmbed
        ? canExploreFromEmbed && !!onExplore && !aiAgentNavigationDisabled
        : authoringEnabled;

    const windowControls = (separated: boolean) => (
        <ArtifactWindowControls
            onClose={() => dispatch(clearPreview())}
            separated={separated}
        />
    );

    if (isError) {
        return (
            <div className={artifactStyles.floatingPanel}>
                <Center className={artifactStyles.loading}>
                    <Stack gap="xs" align="center">
                        <Text size="xs" c="dimmed" ta="center">
                            Failed to load chart. Please try again.
                        </Text>
                        {windowControls(false)}
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
                        {windowControls(false)}
                    </Stack>
                </Center>
            </div>
        );
    }

    return (
        <div className={artifactStyles.floatingPanel}>
            <div className={artifactStyles.floatingContent}>
                <div className={artifactStyles.head}>
                    <ArtifactPanelHeading
                        title={savedChart.name}
                        description={savedChart.description ?? null}
                        marker={null}
                        descriptionDisplay="expandable"
                    />

                    <Group gap={2} className={artifactStyles.headRight}>
                        {savedChart.verification && (
                            <VerifiedBadge
                                verification={savedChart.verification}
                            />
                        )}
                        {hasExploreAction && (
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
                                    {isEmbed ? (
                                        <Menu.Item
                                            onClick={() =>
                                                onExplore?.({
                                                    chart: savedChart,
                                                })
                                            }
                                            leftSection={
                                                <MantineIcon
                                                    icon={IconExternalLink}
                                                    size="sm"
                                                />
                                            }
                                        >
                                            Explore from here
                                        </Menu.Item>
                                    ) : (
                                        <Menu.Item
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
                                    )}
                                </Menu.Dropdown>
                            </Menu>
                        )}
                        {windowControls(
                            !!savedChart.verification || hasExploreAction,
                        )}
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
