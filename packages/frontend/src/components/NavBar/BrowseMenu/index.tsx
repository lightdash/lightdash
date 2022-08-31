import {
    Button,
    Menu,
    MenuDivider,
    PopoverInteractionKind,
    Position,
    Spinner,
} from '@blueprintjs/core';
import { Popover2 } from '@blueprintjs/popover2';
import { FC } from 'react';
import { useSpaces } from '../../../hooks/useSpaces';
import NavLink from '../../NavLink';
import { FirstItem, NavbarMenuItem, SpinnerWrapper } from '../NavBar.styles';

interface Props {
    projectUuid: string;
}

const BrowseMenu: FC<Props> = ({ projectUuid }) => {
    const { data: spaces, isLoading } = useSpaces(projectUuid);
    return (
        <>
            <Popover2
                interactionKind={PopoverInteractionKind.CLICK}
                content={
                    !projectUuid || isLoading ? (
                        <SpinnerWrapper>
                            <Spinner size={20} />
                        </SpinnerWrapper>
                    ) : (
                        <Menu>
                            <NavLink to={`/projects/${projectUuid}/dashboards`}>
                                <FirstItem
                                    role="menuitem"
                                    text="All dashboards"
                                    icon="control"
                                />
                            </NavLink>
                            <NavLink to={`/projects/${projectUuid}/saved`}>
                                <NavbarMenuItem
                                    roleStructure="menuitem"
                                    icon="chart"
                                    text="All saved charts"
                                />
                            </NavLink>

                            <MenuDivider />

                            {spaces?.map((space) => (
                                <NavLink
                                    key={space.uuid}
                                    to={`/projects/${projectUuid}/spaces/${space.uuid}`}
                                >
                                    <NavbarMenuItem
                                        roleStructure="menuitem"
                                        icon="folder-close"
                                        text={space.name}
                                    />
                                </NavLink>
                            ))}
                        </Menu>
                    )
                }
                position={Position.BOTTOM_LEFT}
            >
                <Button minimal icon="timeline-bar-chart" text="Browse" />
            </Popover2>
        </>
    );
};
export default BrowseMenu;
