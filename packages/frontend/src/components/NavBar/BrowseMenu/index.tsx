import {
    Button,
    MenuItem,
    PopoverInteractionKind,
    Position,
    Spinner,
} from '@blueprintjs/core';
import { Popover2 } from '@blueprintjs/popover2';
import React, { FC } from 'react';
import NavLink from '../../NavLink';
import { FirstItem, MenuWrapper, SpinnerWrapper } from '../NavBar.styles';

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
                    <MenuWrapper>
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
                    </MenuWrapper>
                )
            }
            position={Position.BOTTOM_LEFT}
        >
            <Button minimal icon="search" text="Browse" />
        </Popover2>
    </>
);
export default BrowseMenu;
