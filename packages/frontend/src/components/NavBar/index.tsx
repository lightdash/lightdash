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
import { useParams } from 'react-router-dom';
import { lightdashApi } from '../../api';
import { useDefaultProject } from '../../hooks/useProjects';
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
    const params = useParams<{ projectUuid: string | undefined }>();
    const projectUuid = params.projectUuid || defaultProject.data?.projectUuid;
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
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
            />
            <ErrorLogsDrawer />
        </>
    );
};

export default NavBar;
