import { subject } from '@casl/ability';
import {
    DashboardTileTypes,
    type SavedSemanticViewerChart,
} from '@lightdash/common';
import {
    ActionIcon,
    Button,
    Group,
    Menu,
    Paper,
    Stack,
    Title,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconDots, IconLayoutGridAdd, IconTrash } from '@tabler/icons-react';
import { type FC } from 'react';
import { useHistory } from 'react-router-dom';
import MantineIcon from '../../../../components/common/MantineIcon';
import { UpdatedInfo } from '../../../../components/common/PageHeader/UpdatedInfo';
import { ResourceInfoPopup } from '../../../../components/common/ResourceInfoPopup/ResourceInfoPopup';
import { TitleBreadCrumbs } from '../../../../components/Explorer/SavedChartsHeader/TitleBreadcrumbs';
import AddTilesToDashboardModal from '../../../../components/SavedDashboards/AddTilesToDashboardModal';
import { useApp } from '../../../../providers/AppProvider';
import * as Models from './../Modals';

type Props = {
    projectUuid: string;
    savedSemanticViewerChart: SavedSemanticViewerChart;
};

export const HeaderView: FC<Props> = ({
    projectUuid,
    savedSemanticViewerChart: chart,
}) => {
    const history = useHistory();
    const { user } = useApp();

    const [
        isDeleteModalOpen,
        { open: openDeleteModal, close: closeDeleteModal },
    ] = useDisclosure(false);
    const [
        isAddToDashboardOpen,
        { open: openAddToDashboardModal, close: closeAddToDashboardModal },
    ] = useDisclosure(false);

    const canManageSemanticViewerChart = user.data?.ability?.can(
        'manage',
        // TODO: change to permissions for semantic viewer
        subject('SqlRunner', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid,
        }),
    );

    const canManageChart = user.data?.ability?.can(
        'manage',
        subject('SavedChart', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid,
            isPrivate: chart.space.isPrivate,
            access: chart.space.userAccess,
        }),
    );

    return (
        <>
            <Paper shadow="none" radius={0} px="md" py="xs" withBorder>
                <Group position="apart">
                    <Stack spacing="none">
                        <Group spacing="two">
                            <TitleBreadCrumbs
                                projectUuid={projectUuid}
                                spaceUuid={chart.space.uuid}
                                spaceName={chart.space.name}
                            />
                            <Title c="dark.6" order={5} fw={600}>
                                {chart.name}
                            </Title>
                        </Group>
                        <Group spacing="xs">
                            <UpdatedInfo
                                updatedAt={chart.lastUpdatedAt}
                                user={chart.lastUpdatedBy}
                                partiallyBold={false}
                            />
                            <ResourceInfoPopup
                                resourceUuid={
                                    chart.savedSemanticViewerChartUuid
                                }
                                projectUuid={projectUuid}
                                description={chart.description ?? undefined}
                                viewStats={chart.views}
                                firstViewedAt={chart.firstViewedAt}
                                withChartData={false}
                            />
                        </Group>
                    </Stack>

                    <Group spacing="md">
                        {canManageSemanticViewerChart && canManageChart && (
                            <Button
                                size="xs"
                                variant="default"
                                onClick={() =>
                                    history.push(
                                        `/projects/${projectUuid}/semantic-viewer/${chart.savedSemanticViewerChartUuid}/edit`,
                                    )
                                }
                            >
                                Edit chart
                            </Button>
                        )}

                        <Menu
                            position="bottom"
                            withArrow
                            withinPortal
                            shadow="md"
                            width={200}
                        >
                            <Menu.Target>
                                <ActionIcon variant="default">
                                    <MantineIcon icon={IconDots} />
                                </ActionIcon>
                            </Menu.Target>
                            <Menu.Dropdown>
                                <Menu.Label>Manage</Menu.Label>
                                <Menu.Item
                                    icon={
                                        <MantineIcon icon={IconLayoutGridAdd} />
                                    }
                                    onClick={openAddToDashboardModal}
                                >
                                    Add to dashboard
                                </Menu.Item>
                                <Menu.Item
                                    icon={
                                        <MantineIcon
                                            icon={IconTrash}
                                            color="red"
                                        />
                                    }
                                    color="red"
                                    disabled={
                                        !(
                                            canManageSemanticViewerChart &&
                                            canManageChart
                                        )
                                    }
                                    onClick={openDeleteModal}
                                >
                                    Delete
                                </Menu.Item>
                            </Menu.Dropdown>
                        </Menu>
                    </Group>
                </Group>
            </Paper>

            <Models.DeleteSavedSemanticChart
                projectUuid={projectUuid}
                uuid={chart.savedSemanticViewerChartUuid}
                name={chart.name}
                opened={isDeleteModalOpen}
                onClose={closeDeleteModal}
                onSuccess={() => history.push(`/projects/${projectUuid}/home`)}
            />

            <AddTilesToDashboardModal
                isOpen={isAddToDashboardOpen}
                projectUuid={projectUuid}
                uuid={chart.savedSemanticViewerChartUuid}
                dashboardTileType={DashboardTileTypes.SEMANTIC_VIEWER_CHART}
                onClose={closeAddToDashboardModal}
            />
        </>
    );
};
