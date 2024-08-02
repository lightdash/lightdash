import { subject } from '@casl/ability';
import { FeatureFlags } from '@lightdash/common';
import { Button, Menu } from '@mantine/core';
import {
    IconFolder,
    IconFolderPlus,
    IconLayersIntersect,
    IconLayoutDashboard,
    IconSquareRoundedPlus,
    IconTable,
    IconTerminal2,
} from '@tabler/icons-react';
import { memo, useState, type FC } from 'react';
import { Link, useHistory } from 'react-router-dom';
import { useFeatureFlagEnabled } from '../../hooks/useFeatureFlagEnabled';
import { useApp } from '../../providers/AppProvider';
import { Can } from '../common/Authorization';
import LargeMenuItem from '../common/LargeMenuItem';
import MantineIcon from '../common/MantineIcon';
import DashboardCreateModal from '../common/modal/DashboardCreateModal';
import SpaceActionModal, { ActionType } from '../common/SpaceActionModal';

type Props = {
    projectUuid: string;
};

const ExploreMenu: FC<Props> = memo(({ projectUuid }) => {
    const { user, health } = useApp();
    const history = useHistory();
    const [isOpen, setIsOpen] = useState<boolean>(false);

    const [isCreateSpaceOpen, setIsCreateSpaceOpen] = useState<boolean>(false);
    const [isCreateDashboardOpen, setIsCreateDashboardOpen] =
        useState<boolean>(false);

    const canSaveSqlChart = useFeatureFlagEnabled(FeatureFlags.SaveSqlChart);

    return (
        <>
            <Can
                I="manage"
                this={subject('Explore', {
                    organizationUuid: user.data?.organizationUuid,
                    projectUuid,
                })}
            >
                <Menu
                    withArrow
                    shadow="lg"
                    position="bottom-start"
                    arrowOffset={16}
                    offset={-2}
                    withinPortal
                >
                    <Menu.Target>
                        <Button
                            variant="default"
                            size="xs"
                            fz="sm"
                            leftIcon={
                                <MantineIcon icon={IconSquareRoundedPlus} />
                            }
                            onClick={() => setIsOpen(!isOpen)}
                            data-testid="ExploreMenu/NewButton"
                        >
                            New
                        </Button>
                    </Menu.Target>

                    <Menu.Dropdown>
                        <LargeMenuItem
                            component={Link}
                            title="Query from tables"
                            description="Build queries and save them as charts."
                            to={`/projects/${projectUuid}/tables`}
                            icon={IconTable}
                        />
                        {health.data?.hasDbtSemanticLayer && (
                            <LargeMenuItem
                                component={Link}
                                title="Query using dbt Semantic Layer"
                                description="Build queries with dbt Semantic Layer"
                                to={`/projects/${projectUuid}/dbtsemanticlayer`}
                                icon={IconLayersIntersect}
                            />
                        )}
                        <Can
                            I="manage"
                            this={subject('SqlRunner', {
                                organizationUuid: user.data?.organizationUuid,
                                projectUuid,
                            })}
                        >
                            <LargeMenuItem
                                component={Link}
                                title="Query using SQL runner"
                                description="Access your database to run ad-hoc queries."
                                to={`/projects/${projectUuid}/${
                                    canSaveSqlChart ? 'sql-runner' : 'sqlRunner'
                                }`}
                                icon={IconTerminal2}
                            />
                        </Can>

                        <Can
                            I="create"
                            this={subject('Dashboard', {
                                organizationUuid: user.data?.organizationUuid,
                                projectUuid,
                            })}
                        >
                            <LargeMenuItem
                                title="Dashboard"
                                description="Arrange multiple charts into a single view."
                                onClick={() => setIsCreateDashboardOpen(true)}
                                icon={IconLayoutDashboard}
                                data-testid="ExploreMenu/NewDashboardButton"
                            />
                        </Can>

                        <Can
                            I="create"
                            this={subject('Space', {
                                organizationUuid: user.data?.organizationUuid,
                                projectUuid,
                            })}
                        >
                            <LargeMenuItem
                                title="Space"
                                description="Organize your saved charts and dashboards."
                                onClick={() => setIsCreateSpaceOpen(true)}
                                icon={IconFolder}
                            />
                        </Can>
                    </Menu.Dropdown>
                </Menu>
            </Can>

            {isCreateSpaceOpen && (
                <SpaceActionModal
                    projectUuid={projectUuid}
                    actionType={ActionType.CREATE}
                    title="Create new space"
                    confirmButtonLabel="Create"
                    icon={IconFolderPlus}
                    onClose={() => setIsCreateSpaceOpen(false)}
                    onSubmitForm={(space) => {
                        if (space)
                            history.push(
                                `/projects/${projectUuid}/spaces/${space.uuid}`,
                            );
                    }}
                />
            )}

            <DashboardCreateModal
                projectUuid={projectUuid}
                opened={isCreateDashboardOpen}
                onClose={() => setIsCreateDashboardOpen(false)}
                onConfirm={(dashboard) => {
                    history.push(
                        `/projects/${projectUuid}/dashboards/${dashboard.uuid}/edit`,
                    );

                    setIsCreateDashboardOpen(false);
                }}
            />
        </>
    );
});
export default ExploreMenu;
