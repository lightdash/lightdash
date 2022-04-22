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

const ExploreMenu: FC<Props> = ({ projectId }) => (
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
                        <NavLink to={`/projects/${projectId}/tables`}>
                            <FirstItem role="button" icon="th" text="Tables" />
                        </NavLink>
                        <NavLink to={`/projects/${projectId}/sqlRunner`}>
                            <MenuItem
                                role="button"
                                icon="console"
                                text="SQL Runner"
                            />
                        </NavLink>
                    </MenuWrapper>
                )
            }
            position={Position.BOTTOM_LEFT}
        >
            <Button minimal icon="series-search" text="Explore" />
        </Popover2>
    </>
);
export default ExploreMenu;
