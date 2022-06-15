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
import React, { useState } from 'react';
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
import UserSettingsModal from '../UserSettingsModal';
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
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [showInvitePage, setShowInvitePage] = useState(false);
    const [activeTab, setActiveTab] = useState<string | undefined>();
    const { mutate } = useMutation(logoutQuery, {
        mutationKey: ['logout'],
        onSuccess: () => {
            window.location.href = '/login';
        },
    });

    const homeUrl = selectedProjectUuid
        ? `/projects/${selectedProjectUuid}/home`
        : '/createProject';
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
                    <Button
                        minimal
                        icon="cog"
                        text="Settings"
                        onClick={() => setIsSettingsOpen(true)}
                        data-cy="settings-button"
                    />
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
                                    <MenuItem
                                        icon="new-person"
                                        text="Invite user"
                                        onClick={() => {
                                            setActiveTab('userManagement');
                                            setShowInvitePage(true);
                                            setIsSettingsOpen(true);
                                        }}
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
            <UserSettingsModal
                isOpen={isSettingsOpen}
                onClose={() => setIsSettingsOpen(false)}
                activeTab={activeTab}
                onChangeTab={(tab) => {
                    setActiveTab(tab);
                    setShowInvitePage(false);
                }}
                panelProps={{
                    userManagementProps: {
                        showInvitePage,
                        setShowInvitePage,
                    },
                }}
            />
            <ErrorLogsDrawer />
        </>
    );
};

export default NavBar;
