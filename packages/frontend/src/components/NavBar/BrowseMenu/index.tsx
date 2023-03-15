import {
    Button,
    Colors,
    Menu,
    MenuDivider,
    PopoverInteractionKind,
    Position,
    Spinner,
} from '@blueprintjs/core';
import { Popover2 } from '@blueprintjs/popover2';
import {
    IconCategory,
    IconChartAreaLine,
    IconFolder,
    IconFolders,
    IconLayoutDashboard,
} from '@tabler/icons-react';
import { FC } from 'react';
import { useSpaces } from '../../../hooks/useSpaces';
import NavLink from '../../NavLink';
import { NavbarMenuItem, SpinnerWrapper } from '../NavBar.styles';

interface Props {
    projectUuid: string;
}

const BrowseMenu: FC<Props> = ({ projectUuid }) => {
    const { data: spaces, isLoading } = useSpaces(projectUuid);
    return (
        <Popover2
            interactionKind={PopoverInteractionKind.CLICK}
            content={
                !projectUuid || isLoading ? (
                    <SpinnerWrapper>
                        <Spinner size={17} />
                    </SpinnerWrapper>
                ) : (
                    <Menu>
                        <NavLink to={`/projects/${projectUuid}/spaces`}>
                            <NavbarMenuItem
                                role="menuitem"
                                text="All spaces"
                                icon={<IconFolders size={17} />}
                            />
                        </NavLink>

                        <NavLink to={`/projects/${projectUuid}/dashboards`}>
                            <NavbarMenuItem
                                role="menuitem"
                                text="All dashboards"
                                icon={<IconLayoutDashboard size={17} />}
                            />
                        </NavLink>

                        <NavLink to={`/projects/${projectUuid}/saved`}>
                            <NavbarMenuItem
                                roleStructure="menuitem"
                                icon={<IconChartAreaLine size={17} />}
                                text="All saved charts"
                            />
                        </NavLink>

                        {spaces && spaces.length > 0 && (
                            <>
                                <MenuDivider />

                                {spaces
                                    .sort((a, b) =>
                                        a.name.toLowerCase() >
                                        b.name.toLowerCase()
                                            ? 1
                                            : -1,
                                    )
                                    .map((space) => (
                                        <NavLink
                                            key={space.uuid}
                                            to={`/projects/${projectUuid}/spaces/${space.uuid}`}
                                        >
                                            <NavbarMenuItem
                                                roleStructure="menuitem"
                                                icon={<IconFolder size={17} />}
                                                text={space.name}
                                            />
                                        </NavLink>
                                    ))}
                            </>
                        )}
                    </Menu>
                )
            }
            position={Position.BOTTOM_LEFT}
        >
            <Button
                minimal
                icon={
                    <IconCategory
                        size={20}
                        color={Colors.GRAY4}
                        style={{ marginRight: '6px' }}
                    />
                }
                text="Browse"
            />
        </Popover2>
    );
};
export default BrowseMenu;
