import {
    Alignment,
    Button,
    Classes,
    HTMLSelect,
    Menu,
    MenuItem,
    NavbarGroup,
    PopoverInteractionKind,
    Position,
} from '@blueprintjs/core';
import { Popover2 } from '@blueprintjs/popover2';
import React, { useState } from 'react';
import { useMutation } from 'react-query';
import { generatePath, Route, useHistory, useParams } from 'react-router-dom';
import { lightdashApi } from '../../api';
import { useDefaultProject, useProjects } from '../../hooks/useProjects';
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
    NavHeading,
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
    } = useApp();
    const defaultProject = useDefaultProject();
    const { isLoading, data } = useProjects();
    const params = useParams<{ projectUuid: string | undefined }>();
    const projectUuid = params.projectUuid || defaultProject.data?.projectUuid;
    const history = useHistory();
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<string | undefined>();
    const { mutate } = useMutation(logoutQuery, {
        mutationKey: ['logout'],
        onSuccess: () => {
            window.location.href = '/login';
        },
    });

    return (
        <>
            <NavBarWrapper className={Classes.DARK}>
                <NavbarGroup align={Alignment.LEFT}>
                    <NavLink
                        to="/home"
                        style={{ marginRight: 24, display: 'flex' }}
                    >
                        <LogoContainer title="Home" />
                    </NavLink>
                    <Route
                        children={({ match }) => {
                            if (!match) {
                                return null;
                            }
                            return (
                                <HTMLSelect
                                    disabled={isLoading}
                                    options={data?.map((item) => ({
                                        value: item.projectUuid,
                                        label: `${item.name} ${item.projectUuid}`,
                                    }))}
                                    fill
                                    onChange={(e) =>
                                        history.push({
                                            pathname: generatePath(match.path, {
                                                ...params,
                                                projectUuid:
                                                    e.currentTarget.value,
                                            }),
                                        })
                                    }
                                />
                            );
                        }}
                    />
                    {!!projectUuid && (
                        <>
                            <ExploreMenu projectId={projectUuid} />
                            <BrowseMenu projectId={projectUuid} />
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
                    <NavHeading>{user.data?.organizationName}</NavHeading>

                    <Popover2
                        interactionKind={PopoverInteractionKind.CLICK}
                        content={
                            <Menu>
                                {user.data?.ability?.can(
                                    'manage',
                                    'InviteLink',
                                ) ? (
                                    <MenuItem
                                        icon="new-person"
                                        text="Invite user"
                                        onClick={() => {
                                            setActiveTab('invites');
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
                onChangeTab={setActiveTab}
            />
            <ErrorLogsDrawer />
        </>
    );
};

export default NavBar;
