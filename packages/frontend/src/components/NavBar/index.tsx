import { Alignment, Classes, NavbarGroup } from '@blueprintjs/core';
import { ProjectType } from '@lightdash/common';
import { memo } from 'react';
import { useHistory } from 'react-router-dom';
import useToaster from '../../hooks/toaster/useToaster';
import { useActiveProjectUuid } from '../../hooks/useProject';
import { setLastProject, useProjects } from '../../hooks/useProjects';
import { useErrorLogs } from '../../providers/ErrorLogsProvider';
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
import UserMenu from './UserMenu';

const NavBar = memo(() => {
    const { errorLogs, setErrorLogsVisible } = useErrorLogs();
    const { showToastSuccess } = useToaster();
    const { isLoading, data: projects } = useProjects();
    const activeProjectUuid = useActiveProjectUuid();

    const history = useHistory();

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
                    <UserMenu />
                </NavbarGroup>
            </NavBarWrapper>

            <ErrorLogsDrawer />
        </>
    );
});

export default NavBar;
