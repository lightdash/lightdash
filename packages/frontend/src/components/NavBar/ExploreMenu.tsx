import { subject } from '@casl/ability';
import { FeatureFlags } from '@lightdash/common';
import { Button, getDefaultZIndex, Menu } from '@mantine/core';
import {
    IconAppWindow,
    IconFolder,
    IconFolderPlus,
    IconLayoutDashboard,
    IconSquareRoundedPlus,
    IconTable,
    IconTerminal2,
} from '@tabler/icons-react';
import { memo, useState, type FC } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { useOptionalProjectRoute } from '../../hooks/useProjectRoute';
import useCreateInAnySpaceAccess from '../../hooks/user/useCreateInAnySpaceAccess';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import { Can } from '../../providers/Ability';
import useApp from '../../providers/App/useApp';
import LargeMenuItem from '../common/LargeMenuItem';
import MantineIcon from '../common/MantineIcon';
import DashboardCreateModal from '../common/modal/DashboardCreateModal';
import SpaceActionModal from '../common/SpaceActionModal';
import { ActionType } from '../common/SpaceActionModal/types';
import AppColorSchemeScope from './AppColorSchemeScope';

type Props = {
    projectUuid: string;
    projectUrlIdentifier?: string;
};

const ExploreMenu: FC<Props> = memo((props) => {
    const { projectUuid, projectUrlIdentifier: projectUrlIdentifierProp } =
        props;
    const projectRoute = useOptionalProjectRoute();
    const projectUrlIdentifier =
        projectRoute?.projectUrlIdentifier ??
        projectUrlIdentifierProp ??
        projectUuid;
    const navigate = useNavigate();
    const location = useLocation();

    const { user } = useApp();
    const dataAppsFlag = useServerFeatureFlag(FeatureFlags.EnableDataApps);

    const [isOpen, setIsOpen] = useState(false);
    const [isCreateSpaceOpen, setIsCreateSpaceOpen] = useState(false);
    const [isCreateDashboardOpen, setIsCreateDashboardOpen] = useState(false);
    const userCanCreateDashboards = useCreateInAnySpaceAccess(
        projectUuid,
        'Dashboard',
        { enabled: isOpen },
    );

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
                    position="bottom-start"
                    arrowOffset={16}
                    offset={-2}
                    opened={isOpen}
                    onChange={setIsOpen}
                    zIndex={getDefaultZIndex('max')}
                    portalProps={{ target: '#navbar-header' }}
                >
                    <Menu.Target>
                        <Button
                            variant="default"
                            size="xs"
                            fz="sm"
                            leftSection={
                                <MantineIcon
                                    color="dimmed"
                                    icon={IconSquareRoundedPlus}
                                />
                            }
                            data-testid="ExploreMenu/NewButton"
                        >
                            New
                        </Button>
                    </Menu.Target>

                    <Menu.Dropdown>
                        <LargeMenuItem
                            component={Link}
                            title="Chart"
                            description="Build queries and save them as charts."
                            to={`/projects/${projectUrlIdentifier}/tables`}
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
                                to={`/projects/${projectUrlIdentifier}/sql-runner`}
                                onClick={(
                                    event: React.MouseEvent<HTMLAnchorElement>,
                                ) => {
                                    if (
                                        location.pathname.startsWith(
                                            `/projects/${projectUrlIdentifier}/sql-runner`,
                                        )
                                    ) {
                                        event.preventDefault();
                                        window.open(
                                            `/projects/${projectUrlIdentifier}/sql-runner`,
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

                        {dataAppsFlag.data?.enabled && (
                            <Can
                                I="create"
                                this={subject('DataApp', {
                                    organizationUuid:
                                        user.data?.organizationUuid,
                                    projectUuid,
                                })}
                            >
                                <LargeMenuItem
                                    component={Link}
                                    title="Data App"
                                    description="Build an interactive app powered by your data."
                                    to={`/projects/${projectUuid}/apps/generate`}
                                    icon={IconAppWindow}
                                    isBeta
                                />
                            </Can>
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
                <AppColorSchemeScope>
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
                                    `/projects/${projectUrlIdentifier}/spaces/${space.uuid}`,
                                );
                        }}
                        parentSpaceUuid={null}
                    />
                </AppColorSchemeScope>
            )}
            {isCreateDashboardOpen && (
                <AppColorSchemeScope>
                    <DashboardCreateModal
                        projectUuid={projectUuid}
                        opened={isCreateDashboardOpen}
                        onClose={() => setIsCreateDashboardOpen(false)}
                        onConfirm={(dashboard) => {
                            void navigate(
                                `/projects/${projectUrlIdentifier}/dashboards/${dashboard.slug}/edit`,
                            );

                            setIsCreateDashboardOpen(false);
                        }}
                    />
                </AppColorSchemeScope>
            )}
        </>
    );
});
export default ExploreMenu;
