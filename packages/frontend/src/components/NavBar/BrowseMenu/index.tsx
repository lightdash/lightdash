import {
    Button,
    MenuDivider,
    MenuItem,
    PopoverInteractionKind,
    Position,
    Spinner,
} from '@blueprintjs/core';
import { Popover2 } from '@blueprintjs/popover2';
import React, { FC } from 'react';
import { useSpaces } from '../../../hooks/useSpaces';
import NavLink from '../../NavLink';
import { FirstItem, MenuWrapper, SpinnerWrapper } from '../NavBar.styles';

interface Props {
    projectId: string;
}

const BrowseMenu: FC<Props> = ({ projectId }) => {
    const { data: spaces, isLoading } = useSpaces(projectId);
    return (
        <>
            <Popover2
                interactionKind={PopoverInteractionKind.CLICK}
                content={
                    !projectId || isLoading ? (
                        <SpinnerWrapper>
                            <Spinner size={20} />
                        </SpinnerWrapper>
                    ) : (
                        <MenuWrapper>
                            <NavLink to={`/projects/${projectId}/dashboards`}>
                                <FirstItem
                                    role="button"
                                    text="Dashboards"
                                    icon="control"
                                />
                            </NavLink>
                            <NavLink to={`/projects/${projectId}/saved`}>
                                <MenuItem icon="chart" text="Saved charts" />
                            </NavLink>
                            <MenuDivider />
                            {spaces?.map((space) => (
                                <NavLink
                                    to={`/projects/${projectId}/spaces/${space.uuid}`}
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
                <Button minimal icon="search" text="Browse" />
            </Popover2>
        </>
    );
};
export default BrowseMenu;
