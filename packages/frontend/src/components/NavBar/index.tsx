import {
    Alignment,
    Button,
    Classes,
    Menu,
    MenuItem,
    NavbarGroup,
    PopoverInteractionKind,
    Position,
} from '@blueprintjs/core';
import { Popover2 } from '@blueprintjs/popover2';
import React from 'react';
import { useMutation } from 'react-query';
import { useHistory, useParams } from 'react-router-dom';
import { lightdashApi } from '../../api';
import {
    getLastProject,
    setLastProject,
    useDefaultProject,
    useProjects,
} from '../../hooks/useProjects';
import { useApp } from '../../providers/AppProvider';
import { UserAvatar } from '../Avatar';
import { ErrorLogsDrawer } from '../ErrorLogsDrawer';
import NavLink from '../NavLink';
import { ShowErrorsButton } from '../ShowErrorsButton';
import BrowseMenu from './BrowseMenu';
import ExploreMenu from './ExploreMenu';
import HelpMenu from './HelpMenu';
import {
    Divider,
    LogoContainer,
    NavBarWrapper,
    ProjectDropdown,
} from './NavBar.styles';

const logoutQuery = async () =>
    lightdashApi({
        url: `/logout`,
        method: 'GET',
        body: undefined,
    });

const NavBar = () => {
    const {
        user,
        errorLogs: { errorLogs, setErrorLogsVisible },
        showToastSuccess,
    } = useApp();
    const defaultProject = useDefaultProject();
    const { isLoading, data } = useProjects();
    const params = useParams<{ projectUuid: string | undefined }>();
    const lastProject = getLastProject();
    const selectedProjectUuid =
        params.projectUuid || lastProject || defaultProject.data?.projectUuid;

    const history = useHistory();
    const { mutate } = useMutation(logoutQuery, {
        mutationKey: ['logout'],
        onSuccess: () => {
            window.location.href = '/login';
        },
    });

    const homeUrl = selectedProjectUuid
        ? `/projects/${selectedProjectUuid}/home`
        : '/';

    return (
        <>
            <NavBarWrapper className={Classes.DARK}>
                <NavbarGroup align={Alignment.LEFT}>
                    <NavLink
                        to={homeUrl}
                        style={{ marginRight: 24, display: 'flex' }}
                    >
                        <LogoContainer title="Home" />
                    </NavLink>
                    {!!selectedProjectUuid && (
                        <>
                            <ExploreMenu projectId={selectedProjectUuid} />
                            <BrowseMenu projectId={selectedProjectUuid} />
                        </>
                    )}

                    <NavLink
                        to={`/projects/${selectedProjectUuid}/generalSettings`}
                    >
                        <Button
                            minimal
                            icon="cog"
                            text="Settings"
                            data-cy="settings-button"
                        />
                    </NavLink>
                </NavbarGroup>
                <NavbarGroup align={Alignment.RIGHT}>
                    <HelpMenu />
                    <Divider />
                    <ShowErrorsButton
                        errorLogs={errorLogs}
                        setErrorLogsVisible={setErrorLogsVisible}
                    />
                    {selectedProjectUuid && (
                        <ProjectDropdown
                            disabled={isLoading || (data || []).length <= 0}
                            options={data?.map((item) => ({
                                value: item.projectUuid,
                                label: item.name,
                            }))}
                            fill
                            value={selectedProjectUuid}
                            onChange={(e) => {
                                setLastProject(e.target.value);
                                showToastSuccess({
                                    icon: 'tick',
                                    title: `You are now viewing ${
                                        data?.find(
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
                                    <NavLink
                                        to={`/projects/${selectedProjectUuid}/generalSettings/userManagement?to=invite`}
                                    >
                                        <MenuItem
                                            icon="new-person"
                                            text="Invite user"
                                        />
                                    </NavLink>
                                ) : null}
                                <MenuItem
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
};

export default NavBar;
