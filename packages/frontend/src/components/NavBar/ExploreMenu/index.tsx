import {
    Button,
    MenuItem,
    PopoverInteractionKind,
    Position,
    Spinner,
} from '@blueprintjs/core';
import { Popover2 } from '@blueprintjs/popover2';
import { subject } from '@casl/ability';
import React, { FC } from 'react';
import { useApp } from '../../../providers/AppProvider';
import { Can } from '../../common/Authorization';
import NavLink from '../../NavLink';
import { FirstItem, MenuWrapper, SpinnerWrapper } from '../NavBar.styles';

interface Props {
    projectId: string | undefined;
}

const ExploreMenu: FC<Props> = ({ projectId }) => {
    const { user } = useApp();

    return (
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
                                <FirstItem
                                    role="button"
                                    icon="th"
                                    text="Tables"
                                />
                            </NavLink>
                            <Can
                                I={'manage'}
                                this={subject('SqlRunner', {
                                    organizationUuid:
                                        user.data?.organizationUuid,
                                    projectId,
                                })}
                            >
                                <NavLink
                                    to={`/projects/${projectId}/sqlRunner`}
                                >
                                    <MenuItem
                                        role="button"
                                        icon="console"
                                        text="SQL Runner"
                                    />
                                </NavLink>
                            </Can>
                        </MenuWrapper>
                    )
                }
                position={Position.BOTTOM_LEFT}
            >
                <Button minimal icon="series-search" text="Explore" />
            </Popover2>
        </>
    );
};
export default ExploreMenu;
