import { subject } from '@casl/ability';
import { Button, Menu } from '@mantine/core';
import {
    IconFolder,
    IconFolderPlus,
    IconLayoutDashboard,
    IconSquareRoundedPlus,
    IconTable,
    IconTerminal2,
} from '@tabler/icons-react';
import { memo, useState, type FC } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import useCreateInAnySpaceAccess from '../../hooks/user/useCreateInAnySpaceAccess';
import { Can } from '../../providers/Ability';
import useApp from '../../providers/App/useApp';
import LargeMenuItem from '../common/LargeMenuItem';
import MantineIcon from '../common/MantineIcon';
import SpaceActionModal from '../common/SpaceActionModal';
import { ActionType } from '../common/SpaceActionModal/types';
import DashboardCreateModal from '../common/modal/DashboardCreateModal';

type Props = {
    projectUuid: string;
};

const ExploreMenu: FC<Props> = memo(({ projectUuid }) => {
    const navigate = useNavigate();
    const location = useLocation();

    const { user } = useApp();

    const userCanCreateDashboards = useCreateInAnySpaceAccess(
        projectUuid,
        'Dashboard',
    );

    const [isOpen, setIsOpen] = useState(false);
    const [isCreateSpaceOpen, setIsCreateSpaceOpen] = useState(false);
    const [isCreateDashboardOpen, setIsCreateDashboardOpen] = useState(false);

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
                                <MantineIcon
                                    color="#adb5bd"
                                    icon={IconSquareRoundedPlus}
                                />
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
                                to={`/projects/${projectUuid}/sql-runner`}
                                onClick={(
                                    event: React.MouseEvent<HTMLAnchorElement>,
                                ) => {
                                    if (
                                        location.pathname.startsWith(
                                            `/projects/${projectUuid}/sql-runner`,
                                        )
                                    ) {
                                        event.preventDefault();
                                        window.open(
                                            `/projects/${projectUuid}/sql-runner`,
                                            '_blank',
                                        );
                                    }
                                }}
                                icon={IconTerminal2}
                            />
                        </Can>

                        {userCanCreateDashboards && (
                            <LargeMenuItem
                                title="Dashboard"
                                description="Arrange multiple charts into a single view."
                                onClick={() => setIsCreateDashboardOpen(true)}
                                icon={IconLayoutDashboard}
                                data-testid="ExploreMenu/NewDashboardButton"
                            />
                        )}

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
                            void navigate(
                                `/projects/${projectUuid}/spaces/${space.uuid}`,
                            );
                    }}
                    parentSpaceUuid={null}
                />
            )}

            <DashboardCreateModal
                projectUuid={projectUuid}
                opened={isCreateDashboardOpen}
                onClose={() => setIsCreateDashboardOpen(false)}
                onConfirm={(dashboard) => {
                    void navigate(
                        `/projects/${projectUuid}/dashboards/${dashboard.uuid}/edit`,
                    );

                    setIsCreateDashboardOpen(false);
                }}
            />
        </>
    );
});
export default ExploreMenu;
