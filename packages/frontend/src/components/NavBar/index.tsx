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
import { ProjectType } from '@lightdash/common';
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
import GlobalSearch from './GlobalSearch';
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
                        style={{ marginRight: 10, display: 'flex' }}
                    >
                        <LogoContainer title="Home" />
                    </NavLink>
                    {!!selectedProjectUuid && (
                        <>
                            <ExploreMenu projectUuid={selectedProjectUuid} />
                            <BrowseMenu projectUuid={selectedProjectUuid} />
                            <GlobalSearch projectUuid={selectedProjectUuid} />
                        </>
                    )}
                </NavbarGroup>
                <NavbarGroup align={Alignment.RIGHT}>
                    <ShowErrorsButton
                        errorLogs={errorLogs}
                        setErrorLogsVisible={setErrorLogsVisible}
                    />
                    <Button
                        minimal
                        icon="cog"
                        data-cy="settings-button"
                        onClick={() => {
                            history.push(`/generalSettings`);
                        }}
                    />
                    <HelpMenu />
                    <Divider />
                    {selectedProjectUuid && (
                        <ProjectDropdown
                            disabled={isLoading || (data || []).length <= 0}
                            options={data?.map((item) => ({
                                value: item.projectUuid,
                                label: `${
                                    item.type === ProjectType.PREVIEW
                                        ? '[Preview] '
                                        : ''
                                }${item.name}`,
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
                                    <MenuItem
                                        href={`/generalSettings/userManagement?to=invite`}
                                        icon="new-person"
                                        text="Invite user"
                                    />
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
