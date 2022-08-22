import {
    Button,
    MenuDivider,
    MenuItem,
    PopoverInteractionKind,
    Position,
    Spinner,
} from '@blueprintjs/core';
import { Popover2 } from '@blueprintjs/popover2';
import { FC } from 'react';
import { useSpaces } from '../../../hooks/useSpaces';
import NavLink from '../../NavLink';
import { FirstItem, MenuWrapper, SpinnerWrapper } from '../NavBar.styles';

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
                        <MenuWrapper>
                            <NavLink to={`/projects/${projectUuid}/dashboards`}>
                                <FirstItem
                                    role="button"
                                    text="All dashboards"
                                    icon="control"
                                />
                            </NavLink>
                            <NavLink to={`/projects/${projectUuid}/saved`}>
                                <MenuItem
                                    icon="chart"
                                    text="All saved charts"
                                />
                            </NavLink>
                            <MenuDivider />
                            {spaces?.map((space) => (
                                <NavLink
                                    to={`/projects/${projectUuid}/spaces/${space.uuid}`}
                                >
                                    <MenuItem
                                        icon="folder-close"
                                        text={space.name}
                                    />
                                </NavLink>
                            ))}
                        </MenuWrapper>
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
