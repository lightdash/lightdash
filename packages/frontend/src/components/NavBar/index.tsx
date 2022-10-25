import {
    Alignment,
    Classes,
    Menu,
    NavbarGroup,
    PopoverInteractionKind,
    Position,
} from '@blueprintjs/core';
import { MenuItem2, Popover2 } from '@blueprintjs/popover2';
import { ProjectType } from '@lightdash/common';
import { memo } from 'react';
import { useMutation } from 'react-query';
import { useHistory } from 'react-router-dom';
import { lightdashApi } from '../../api';
import useToaster from '../../hooks/toaster/useToaster';
import { useActiveProjectUuid } from '../../hooks/useProject';
import { setLastProject, useProjects } from '../../hooks/useProjects';
import { useApp } from '../../providers/AppProvider';
import { useErrorLogs } from '../../providers/ErrorLogsProvider';
import { UserAvatar } from '../Avatar';
import { ErrorLogsDrawer } from '../ErrorLogsDrawer';
import NavLink from '../NavLink';
import { ShowErrorsButton } from '../ShowErrorsButton';
import BrowseMenu from './BrowseMenu';
import ExploreMenu from './ExploreMenu';
import GlobalSearch from './GlobalSearch';
import HelpMenu from './HelpMenu';
import {
    Divider,
    LogoContainer,
    NavBarWrapper,
    ProjectDropdown,
} from './NavBar.styles';
import SettingsMenu from './SettingsMenu';

const logoutQuery = async () =>
    lightdashApi({
        url: `/logout`,
        method: 'GET',
        body: undefined,
    });

const NavBar = memo(() => {
    const { user } = useApp();
    const { errorLogs, setErrorLogsVisible } = useErrorLogs();
    const { showToastSuccess } = useToaster();
    const { isLoading, data: projects } = useProjects();
    const activeProjectUuid = useActiveProjectUuid();

    const history = useHistory();
    const { mutate } = useMutation(logoutQuery, {
        mutationKey: ['logout'],
        onSuccess: () => {
            window.location.href = '/login';
        },
    });

    const homeUrl = activeProjectUuid
        ? `/projects/${activeProjectUuid}/home`
        : '/';

    return (
        <>
            <NavBarWrapper className={Classes.DARK}>
                <NavbarGroup align={Alignment.LEFT}>
                    <NavLink
                        to={homeUrl}
                        style={{ marginRight: 10, display: 'flex' }}
                    >
                        <LogoContainer title="Home" />
                    </NavLink>
                    {!!activeProjectUuid && (
                        <>
                            <ExploreMenu projectUuid={activeProjectUuid} />
                            <BrowseMenu projectUuid={activeProjectUuid} />
                            <GlobalSearch projectUuid={activeProjectUuid} />
                        </>
                    )}
                </NavbarGroup>
                <NavbarGroup align={Alignment.RIGHT}>
                    <ShowErrorsButton
                        errorLogs={errorLogs}
                        setErrorLogsVisible={setErrorLogsVisible}
                    />
                    <SettingsMenu />
                    <HelpMenu />
                    <Divider />
                    {activeProjectUuid && (
                        <ProjectDropdown
                            disabled={isLoading || (projects || []).length <= 0}
                            options={projects?.map((item) => ({
                                value: item.projectUuid,
                                label: `${
                                    item.type === ProjectType.PREVIEW
                                        ? '[Preview] '
                                        : ''
                                }${item.name}`,
                            }))}
                            fill
                            value={activeProjectUuid}
                            onChange={(e) => {
                                setLastProject(e.target.value);
                                showToastSuccess({
                                    icon: 'tick',
                                    title: `You are now viewing ${
                                        projects?.find(
                                            ({ projectUuid }) =>
                                                projectUuid === e.target.value,
                                        )?.name
                                    }`,
                                });
                                history.push(
                                    `/projects/${e.target.value}/home`,
                                );
                            }}
                        />
                    )}
                    <Popover2
                        interactionKind={PopoverInteractionKind.CLICK}
                        content={
                            <Menu>
                                {user.data?.ability?.can(
                                    'create',
                                    'InviteLink',
                                ) ? (
                                    <MenuItem2
                                        href={`/generalSettings/userManagement?to=invite`}
                                        icon="new-person"
                                        text="Invite user"
                                    />
                                ) : null}
                                <MenuItem2
                                    icon="log-out"
                                    text="Logout"
                                    onClick={() => mutate()}
                                />
                            </Menu>
                        }
                        position={Position.BOTTOM_LEFT}
                    >
                        <UserAvatar />
                    </Popover2>
                </NavbarGroup>
            </NavBarWrapper>

            <ErrorLogsDrawer />
        </>
    );
});

export default NavBar;
