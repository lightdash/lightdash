import {
    FeatureFlags,
    getAppDisplayName,
    isOfficialChartType,
    type DataAppViz,
    type OrganizationDataAppViz,
} from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Box,
    Group,
    Menu,
    Stack,
    Text,
    Tooltip,
} from '@mantine/core';
import {
    IconDots,
    IconFilePencil,
    IconGitFork,
    IconTelescope,
    IconTrash,
} from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { Link, useNavigate } from 'react-router';
import { FloatingActionsPill } from '../../../components/common/FloatingActionsPill';
import MantineIcon from '../../../components/common/MantineIcon';
import { PolymorphicPaperButton } from '../../../components/common/PolymorphicPaperButton';
import { useOptionalProjectRoute } from '../../../hooks/useProjectRoute';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import { useCanCreateDataApp } from '../../apps/hooks/useCanCreateDataApp';
import { useCanEditDataApp } from '../../apps/hooks/useCanEditDataApp';
import { useCanManageOrganizationChartTypes } from '../hooks/useOrganizationLibraryAccess';
import { chartTypeBuilderPath } from '../utils/chartTypeBuilderPath';
import { getChartTypeIcon } from '../utils/chartTypeIcons';
import { getChartTypeOwner } from '../utils/chartTypeOwner';
import ChartTypeForkModal from './ChartTypeForkModal';
import classes from './ChartTypeGalleryCard.module.css';
import ChartTypeSamplePreview from './ChartTypeSamplePreview';
import OfficialChartTypeBadge from './OfficialChartTypeBadge';

type Props = {
    dataAppViz: DataAppViz | OrganizationDataAppViz;
    /** The project the gallery is viewed from */
    projectUuid: string;
    /** A newer registry version of this official chart type exists */
    hasRegistryUpdate: boolean;
    onClick: () => void;
    /** Opens the chart type in the explorer; null hides the action */
    onPreview: (() => void) | null;
    onDelete: () => void;
};

const ChartTypeGalleryCard: FC<Props> = ({
    dataAppViz,
    projectUuid,
    hasRegistryUpdate,
    onClick,
    onPreview,
    onDelete,
}) => {
    const navigate = useNavigate();
    // Organization chart types have no project; organization chart type
    // managers edit and delete them.
    const owner = getChartTypeOwner(dataAppViz);
    const isOrganizationChartType = owner === 'organization';
    const owningProjectUuid = dataAppViz.projectUuid ?? undefined;
    const canEditInProject = useCanEditDataApp(owningProjectUuid, dataAppViz);
    const canManageOrganizationChartTypes =
        useCanManageOrganizationChartTypes();
    const canEdit = isOrganizationChartType
        ? canManageOrganizationChartTypes
        : canEditInProject;
    const canDelete = canEdit;
    const canPreviewInExplorer = onPreview !== null;
    const projectRoute = useOptionalProjectRoute();
    const projectUrlIdentifier =
        projectRoute?.projectUrlIdentifier ?? projectUuid;
    const canFork = useCanCreateDataApp(owningProjectUuid);
    // Forking and editing are authoring, so they need data apps on.
    const dataAppsEnabled =
        useServerFeatureFlag(FeatureFlags.EnableDataApps).data?.enabled ===
        true;
    const isOfficial = isOfficialChartType(dataAppViz);
    const [isForkOpen, setIsForkOpen] = useState(false);
    const displayName = getAppDisplayName(
        dataAppViz.name,
        dataAppViz.dataAppVizUuid,
    );

    return (
        <>
            <PolymorphicPaperButton
                component="div"
                withBorder
                radius="md"
                shadow="subtle"
                className={classes.card}
                onClick={onClick}
            >
                <Box className={classes.preview}>
                    <ChartTypeSamplePreview
                        projectUuid={projectUuid}
                        owner={owner}
                        dataAppVizUuid={dataAppViz.dataAppVizUuid}
                        icon={dataAppViz.icon}
                    />
                </Box>
                <Stack gap="xs" p="sm">
                    <Group gap="xs" wrap="nowrap" justify="space-between">
                        <Group gap="xs" wrap="nowrap" miw={0}>
                            <MantineIcon
                                icon={getChartTypeIcon(dataAppViz.icon)}
                                color="dimmed"
                            />
                            <Text fz="sm" fw={600} truncate="end">
                                {displayName}
                            </Text>
                        </Group>
                        {isOfficial && <OfficialChartTypeBadge />}
                    </Group>
                    <Text fz="xs" c="dimmed" lh={1.35} lineClamp={2}>
                        {dataAppViz.description || 'No description'}
                    </Text>
                    {hasRegistryUpdate && (
                        <Badge size="xs" variant="light" color="orange">
                            Update available
                        </Badge>
                    )}
                </Stack>
                <FloatingActionsPill className={classes.menuHost}>
                    {isOfficial
                        ? dataAppsEnabled &&
                          canFork && (
                              <Tooltip label="Fork to customize">
                                  <ActionIcon
                                      size="sm"
                                      aria-label={`Fork ${displayName}`}
                                      onClick={(e) => {
                                          e.stopPropagation();
                                          setIsForkOpen(true);
                                      }}
                                  >
                                      <MantineIcon icon={IconGitFork} />
                                  </ActionIcon>
                              </Tooltip>
                          )
                        : dataAppsEnabled &&
                          canEdit && (
                              <Tooltip label="Edit">
                                  <ActionIcon
                                      size="sm"
                                      component={Link}
                                      to={chartTypeBuilderPath(
                                          projectUrlIdentifier,
                                          dataAppViz.slug,
                                          owner,
                                      )}
                                      aria-label={`Edit ${displayName}`}
                                      onClick={(e) => e.stopPropagation()}
                                  >
                                      <MantineIcon icon={IconFilePencil} />
                                  </ActionIcon>
                              </Tooltip>
                          )}
                    {(canPreviewInExplorer || canDelete) && (
                        <Menu
                            withArrow
                            position="bottom-end"
                            offset={4}
                            arrowOffset={10}
                        >
                            <Menu.Target>
                                <ActionIcon
                                    size="sm"
                                    aria-label={`Actions for ${displayName}`}
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <MantineIcon icon={IconDots} />
                                </ActionIcon>
                            </Menu.Target>
                            <Menu.Dropdown>
                                {onPreview && (
                                    <Menu.Item
                                        leftSection={
                                            <MantineIcon icon={IconTelescope} />
                                        }
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onPreview();
                                        }}
                                    >
                                        Preview in explorer
                                    </Menu.Item>
                                )}
                                {canDelete && (
                                    <>
                                        {canPreviewInExplorer && (
                                            <Menu.Divider />
                                        )}
                                        <Menu.Item
                                            color="red"
                                            leftSection={
                                                <MantineIcon icon={IconTrash} />
                                            }
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onDelete();
                                            }}
                                        >
                                            {isOfficial
                                                ? 'Uninstall'
                                                : 'Delete'}
                                        </Menu.Item>
                                    </>
                                )}
                            </Menu.Dropdown>
                        </Menu>
                    )}
                </FloatingActionsPill>
            </PolymorphicPaperButton>
            {isForkOpen && owningProjectUuid && (
                <ChartTypeForkModal
                    opened
                    onClose={() => setIsForkOpen(false)}
                    projectUuid={owningProjectUuid}
                    appUuid={dataAppViz.dataAppVizUuid}
                    defaultName={`${dataAppViz.name} (custom)`}
                    onForked={(result) =>
                        void navigate(
                            chartTypeBuilderPath(
                                projectUrlIdentifier,
                                result.slug,
                                'project',
                            ),
                        )
                    }
                />
            )}
        </>
    );
};

export default ChartTypeGalleryCard;
