import {
    Alignment,
    Button,
    Classes,
    Colors,
    IconName,
    InputGroup,
    Menu,
    MenuItem,
    NavbarGroup,
    PopoverInteractionKind,
    Position,
} from '@blueprintjs/core';
import { HotkeysTarget2 } from '@blueprintjs/core/lib/esm/components';
import { Popover2 } from '@blueprintjs/popover2';
import { ItemRenderer, Omnibar } from '@blueprintjs/select';
import { ProjectType } from '@lightdash/common';
import React from 'react';
import { useMutation } from 'react-query';
import { useHistory, useParams } from 'react-router-dom';
import { useToggle } from 'react-use';
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

interface SearchResultBase {
    type:
        | 'space'
        | 'dashboard'
        | 'saved_chart'
        | 'explore'
        | 'group_label'
        | 'dimension'
        | 'metric';
    projectUuid: string;
    label: string;
    description: string;
}

interface SearchResult extends SearchResultBase {
    type: 'space' | 'dashboard' | 'saved_chart' | 'explore';
    resultUuid: string;
}

interface SearchResultWithTableInheritance extends SearchResultBase {
    type: 'group_label' | 'dimension' | 'metric';
    table: {
        uuid: string;
        label: string;
    };
}

const FilmOmnibar = Omnibar.ofType<{
    icon: IconName;
    name: string;
    prefix?: string;
    description: string;
}>();

const logoutQuery = async () =>
    lightdashApi({
        url: `/logout`,
        method: 'GET',
        body: undefined,
    });

const renderItem: ItemRenderer<{
    icon: IconName;
    name: string;
    prefix?: string;
    description: string;
}> = (field, { modifiers, handleClick }) => {
    if (!modifiers.matchesPredicate) {
        return null;
    }
    return (
        <MenuItem
            active={modifiers.active}
            key={field.name}
            icon={field.icon}
            text={
                <>
                    <span>
                        {field.prefix && <span>{field.prefix} - </span>}
                        <b>{field.name}</b>
                    </span>
                    <span style={{ marginLeft: 10, color: Colors.GRAY1 }}>
                        {field.description}
                    </span>
                </>
            }
            onClick={handleClick}
            shouldDismissPopover={false}
        />
    );
};

const NavBar = () => {
    const [isSearchOpen, toggleSearchOpen] = useToggle(false);
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

                    <NavLink to={`/generalSettings`}>
                        <Button
                            minimal
                            icon="cog"
                            text="Settings"
                            data-cy="settings-button"
                        />
                    </NavLink>
                </NavbarGroup>
                <NavbarGroup align={Alignment.RIGHT}>
                    <HotkeysTarget2
                        hotkeys={[
                            {
                                combo: 'cmd + f',
                                global: true,
                                label: 'Show search',
                                onKeyDown: () => toggleSearchOpen(true),
                                preventDefault: true,
                            },
                        ]}
                    >
                        <div>
                            <span>
                                <InputGroup
                                    leftIcon="search"
                                    onClick={() => toggleSearchOpen(true)}
                                    placeholder="Search"
                                />
                            </span>

                            <FilmOmnibar
                                isOpen={isSearchOpen}
                                itemRenderer={renderItem}
                                items={[
                                    {
                                        icon: 'folder-open',
                                        name: 'Sales',
                                        description: 'My sales description',
                                    },
                                    {
                                        icon: 'control',
                                        name: 'Sales in Q1',
                                        description:
                                            'Lorem ipsum dolor sit amet',
                                    },
                                    {
                                        icon: 'chart',
                                        name: 'How many products we sold over time ?',
                                        description:
                                            'Lorem ipsum dolor sit amet',
                                    },
                                    {
                                        icon: 'th',
                                        name: 'Products',
                                        description:
                                            'Lorem ipsum dolor sit amet',
                                    },
                                    {
                                        icon: 'citation',
                                        name: 'Product Id',
                                        prefix: 'Products',
                                        description:
                                            'Lorem ipsum dolor sit amet',
                                    },
                                    {
                                        icon: 'numerical',
                                        name: 'Total products',
                                        prefix: 'Products',
                                        description:
                                            'Lorem ipsum dolor sit amet, consectetur adipiscing elit',
                                    },
                                ]}
                                itemsEqual={(value, other) =>
                                    value.name.toLowerCase() ===
                                    other.name.toLowerCase()
                                }
                                noResults={
                                    <MenuItem
                                        disabled={true}
                                        text="No results."
                                    />
                                }
                                onItemSelect={() => toggleSearchOpen(false)}
                                onClose={() => toggleSearchOpen(false)}
                                resetOnSelect={true}
                            />
                        </div>
                    </HotkeysTarget2>
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
