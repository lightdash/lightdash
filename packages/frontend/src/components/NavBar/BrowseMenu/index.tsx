import {
    Button,
    Menu,
    MenuItem,
    PopoverInteractionKind,
    Position,
    Spinner,
} from '@blueprintjs/core';
import { Popover2 } from '@blueprintjs/popover2';
import React, { FC } from 'react';
import NavLink from '../../NavLink';
import { FirstItem, SpinnerWrapper } from '../NavBar.styles';

interface Props {
    projectId: string | undefined;
}

const BrowseMenu: FC<Props> = ({ projectId }) => (
    <>
        <Popover2
            interactionKind={PopoverInteractionKind.CLICK}
            content={
                !projectId ? (
                    <SpinnerWrapper>
                        <Spinner size={20} />
                    </SpinnerWrapper>
                ) : (
                    <Menu>
                        <NavLink to={`/projects/${projectId}/dashboards`}>
                            <FirstItem
                                role="button"
                                text="Dashboards"
                                icon="control"
                            />
                        </NavLink>
                        <NavLink
                            to={`/projects/${projectId}/saved`}
                            style={{ marginBottom: 5 }}
                        >
                            <MenuItem icon="chart" text="Saved charts" />
                        </NavLink>
                    </Menu>
                )
            }
            position={Position.BOTTOM_LEFT}
        >
            <Button minimal icon="search" text="Browse" />
        </Popover2>
    </>
);
export default BrowseMenu;
