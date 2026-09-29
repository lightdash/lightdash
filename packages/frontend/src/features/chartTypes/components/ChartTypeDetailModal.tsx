import {
    FeatureFlags,
    getAppDisplayName,
    isOfficialChartType,
    type DataAppViz,
    type OrganizationDataAppViz,
    type RegistryChartTypeListItem,
} from '@lightdash/common';
import { Box, Button, Group, SimpleGrid, Stack, Text } from '@mantine/core';
import { IconFilePencil, IconGitFork, IconTrash } from '@tabler/icons-react';
import { useEffect, useRef, useState, type FC } from 'react';
import { Link, useNavigate } from 'react-router';
import Callout from '../../../components/common/Callout';
import MantineIcon from '../../../components/common/MantineIcon';
import MantineModal from '../../../components/common/MantineModal';
import { useOptionalProjectRoute } from '../../../hooks/useProjectRoute';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import { useTimeAgo } from '../../../hooks/useTimeAgo';
import useTracking from '../../../providers/Tracking/useTracking';
import { EventName } from '../../../types/Events';
import { useAppVersionHistory } from '../../apps/hooks/useAppVersionHistory';
import { useCanCreateDataApp } from '../../apps/hooks/useCanCreateDataApp';
import { useCanEditDataApp } from '../../apps/hooks/useCanEditDataApp';
import { useCanManageOrganizationChartTypes } from '../hooks/useOrganizationLibraryAccess';
import { chartTypeBuilderPath } from '../utils/chartTypeBuilderPath';
import { getChartTypeIcon } from '../utils/chartTypeIcons';
import {
    getChartTypeOwner,
    isOrganizationDataAppViz,
} from '../utils/chartTypeOwner';
import classes from './ChartTypeDetailModal.module.css';
import ChartTypeForkModal from './ChartTypeForkModal';
import ChartTypeReleaseStageBadge from './ChartTypeReleaseStageBadge';
import ChartTypeSamplePreview from './ChartTypeSamplePreview';
import ChartTypeUpgradeModal from './ChartTypeUpgradeModal';
import DataAppVizFieldsList from './DataAppVizFieldsList';
import OfficialChartTypeBadge from './OfficialChartTypeBadge';

type Props = {
    opened: boolean;
    /** The project the gallery is viewed from */
    projectUuid: string;
    dataAppViz: DataAppViz | OrganizationDataAppViz;
    isActive: boolean;
    /** This chart type's registry entry, when it is a registry install */
    registryEntry: RegistryChartTypeListItem | null;
    onClose: () => void;
    /** Opens the chart type in the explorer; null hides the action */
    onPreview: (() => void) | null;
    onDelete: () => void;
};

const ChartTypeDetailModal: FC<Props> = ({
    opened,
    projectUuid,
    dataAppViz,
    isActive,
    registryEntry,
    onClose,
    onPreview,
    onDelete,
}) => {
    const navigate = useNavigate();
    // Organization chart types have no fork or explorer preview; only
    // organization chart type managers edit and delete them.
    const owner = getChartTypeOwner(dataAppViz);
    const isOrganizationChartType = isOrganizationDataAppViz(dataAppViz);
    const owningProjectUuid = dataAppViz.projectUuid ?? undefined;
    const canEditInProject = useCanEditDataApp(owningProjectUuid, dataAppViz);
    const canCreateInProject = useCanCreateDataApp(owningProjectUuid);
    const canFork = !isOrganizationChartType && canCreateInProject;
    const canManageOrganizationChartTypes =
        useCanManageOrganizationChartTypes();
    const canEdit = isOrganizationChartType
        ? canManageOrganizationChartTypes
        : canEditInProject;
    const canDelete = canEdit;
    // Forking and editing are authoring: they need data apps, unlike
    // install/upgrade/uninstall which follow the chart type library.
    const dataAppsEnabled =
        useServerFeatureFlag(FeatureFlags.EnableDataApps).data?.enabled ===
        true;
    const isOfficial = isOfficialChartType(dataAppViz);
    const [isForkOpen, setIsForkOpen] = useState(false);
    const projectRoute = useOptionalProjectRoute();
    const projectUrlIdentifier =
        projectRoute?.projectUrlIdentifier ?? projectUuid;
    const [isUpgradeOpen, setIsUpgradeOpen] = useState(false);
    const isDetailActive = opened && isActive && !isForkOpen && !isUpgradeOpen;
    const { track } = useTracking();
    const registryUpdate =
        registryEntry?.state === 'update_available' ? registryEntry : null;
    // The registry's release stage describes its current version only.
    const installedReleaseStage =
        isOfficial &&
        registryEntry &&
        registryEntry.installedRegistryVersion === registryEntry.version
            ? registryEntry.releaseStage
            : null;

    const hasTrackedView = useRef(false);
    const hasUpdate = registryUpdate !== null;
    useEffect(() => {
        if (hasTrackedView.current) return;
        hasTrackedView.current = true;
        track({
            name: EventName.CHART_TYPE_DETAIL_VIEWED,
            properties: {
                projectUuid,
                isOfficial,
                registrySlug: dataAppViz.registrySlug,
                hasUpdate,
            },
        });
    }, [projectUuid, isOfficial, dataAppViz.registrySlug, hasUpdate, track]);
    const { latestReadyVersion, oldest, latest, hasOrigin } =
        useAppVersionHistory(projectUuid, dataAppViz.dataAppVizUuid, owner);

    // Only attribute once v1 is loaded — the oldest loaded version is not the
    // origin author while older pages are unfetched.
    const builtBy =
        hasOrigin && oldest?.createdByUser
            ? `${oldest.createdByUser.firstName} ${oldest.createdByUser.lastName}`.trim()
            : null;
    const lastUpdatedAgo = useTimeAgo(
        latest
            ? (latest.statusUpdatedAt ?? latest.createdAt)
            : dataAppViz.createdAt,
    );

    return (
        <>
            <MantineModal
                opened={opened}
                onClose={onClose}
                modalRootProps={{
                    closeOnEscape: isDetailActive,
                    closeOnClickOutside: isDetailActive,
                    trapFocus: isDetailActive,
                }}
                title={
                    <Group gap="xs" wrap="nowrap">
                        <MantineIcon icon={getChartTypeIcon(dataAppViz.icon)} />
                        <Text fw={700} fz="md" c="ldDark.9">
                            {getAppDisplayName(
                                dataAppViz.name,
                                dataAppViz.dataAppVizUuid,
                            )}
                        </Text>
                        {isOfficial && <OfficialChartTypeBadge />}
                    </Group>
                }
                // The default 80vh cap clips the meta panel.
                bodyScrollAreaMaxHeight="calc(100vh - 200px)"
                cancelLabel={false}
                leftActions={
                    canDelete && (
                        // The theme's subtle variant hardcodes gray text; c overrides it.
                        <Button
                            variant="subtle"
                            size="xs"
                            color="red"
                            c="red.7"
                            leftSection={<MantineIcon icon={IconTrash} />}
                            onClick={onDelete}
                        >
                            {isOfficial ? 'Uninstall' : 'Delete'}
                        </Button>
                    )
                }
                actions={
                    isOfficial
                        ? dataAppsEnabled &&
                          canFork && (
                              <Button
                                  variant="default"
                                  leftSection={
                                      <MantineIcon icon={IconGitFork} />
                                  }
                                  onClick={() => {
                                      track({
                                          name: EventName.CHART_TYPE_FORK_MODAL_OPENED,
                                          properties: {
                                              projectUuid,
                                              registrySlug:
                                                  dataAppViz.registrySlug,
                                          },
                                      });
                                      setIsForkOpen(true);
                                  }}
                              >
                                  Fork to customize
                              </Button>
                          )
                        : dataAppsEnabled &&
                          canEdit && (
                              <Button
                                  component={Link}
                                  to={chartTypeBuilderPath(
                                      projectUrlIdentifier,
                                      dataAppViz.slug,
                                      owner,
                                  )}
                                  variant="default"
                                  leftSection={
                                      <MantineIcon icon={IconFilePencil} />
                                  }
                              >
                                  Edit
                              </Button>
                          )
                }
                onConfirm={onPreview ?? undefined}
                confirmLabel="Preview in explorer"
            >
                <Stack gap="md">
                    <Box className={classes.preview}>
                        <ChartTypeSamplePreview
                            projectUuid={projectUuid}
                            owner={owner}
                            dataAppVizUuid={dataAppViz.dataAppVizUuid}
                            icon={dataAppViz.icon}
                        />
                    </Box>
                    <Text fz="sm" c="ldGray.7" lh={1.55}>
                        {dataAppViz.description || 'No description'}
                    </Text>
                    {registryUpdate && (
                        <Callout
                            variant="info"
                            title={`Update available: v${registryUpdate.version}`}
                        >
                            <Stack gap="sm" align="flex-start">
                                <Text fz="sm">
                                    {registryUpdate.changelog
                                        ? `${registryUpdate.changelog} `
                                        : ''}
                                    Charts pinned to an earlier version keep
                                    rendering it until each chart is upgraded;
                                    charts without a pinned version switch to v
                                    {registryUpdate.version} right away.
                                </Text>
                                {canFork && (
                                    <Button
                                        size="xs"
                                        variant="default"
                                        onClick={() => setIsUpgradeOpen(true)}
                                    >
                                        Upgrade to v{registryUpdate.version}
                                    </Button>
                                )}
                            </Stack>
                        </Callout>
                    )}
                    {dataAppViz.schema !== null && (
                        <DataAppVizFieldsList
                            fields={dataAppViz.schema.fields}
                        />
                    )}
                    <SimpleGrid cols={2} className={classes.metaPanel}>
                        {builtBy !== null && (
                            <Box>
                                <Text fz="xs" fw={600} c="dimmed">
                                    Built by
                                </Text>
                                <Text fz="sm" fw={500} c="ldGray.8">
                                    {builtBy}
                                </Text>
                            </Box>
                        )}
                        <Box>
                            <Text fz="xs" fw={600} c="dimmed">
                                Last updated
                            </Text>
                            <Text fz="sm" fw={500} c="ldGray.8">
                                {lastUpdatedAgo}
                            </Text>
                        </Box>
                        <Box>
                            <Text fz="xs" fw={600} c="dimmed">
                                Version
                            </Text>
                            <Group gap="xs" wrap="nowrap">
                                <Text fz="sm" fw={500} c="ldGray.8">
                                    {/* Officials show the registry semver, matching
                                        the library; the internal app version only
                                        describes locally built types. */}
                                    {isOfficial &&
                                    registryEntry?.installedRegistryVersion
                                        ? `v${registryEntry.installedRegistryVersion}`
                                        : latestReadyVersion !== null
                                          ? `v${latestReadyVersion}`
                                          : '—'}
                                </Text>
                                {installedReleaseStage && (
                                    <ChartTypeReleaseStageBadge
                                        stage={installedReleaseStage}
                                    />
                                )}
                            </Group>
                        </Box>
                    </SimpleGrid>
                    {dataAppViz.schema === null && (
                        <Text fz="sm" c="dimmed">
                            No finished version yet. Open the builder to
                            generate one.
                        </Text>
                    )}
                </Stack>
            </MantineModal>
            {isForkOpen && (
                <ChartTypeForkModal
                    opened
                    onClose={() => setIsForkOpen(false)}
                    projectUuid={projectUuid}
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
            {isUpgradeOpen && registryUpdate && !isOrganizationChartType && (
                <ChartTypeUpgradeModal
                    projectUuid={projectUuid}
                    dataAppViz={dataAppViz}
                    registryUpdate={registryUpdate}
                    onClose={() => setIsUpgradeOpen(false)}
                />
            )}
        </>
    );
};

export default ChartTypeDetailModal;
