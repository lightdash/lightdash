import {
    Button,
    PopoverInteractionKind,
    Position,
    Spinner,
} from '@blueprintjs/core';
import { MenuItem2, Popover2 } from '@blueprintjs/popover2';
import { subject } from '@casl/ability';
import React, { FC } from 'react';
import { useApp } from '../../../providers/AppProvider';
import { Can } from '../../common/Authorization';
import NavLink from '../../NavLink';
import { FirstItem, MenuWrapper, SpinnerWrapper } from '../NavBar.styles';

interface Props {
    projectUuid: string;
}

const ExploreMenu: FC<Props> = ({ projectUuid }) => {
    const { user } = useApp();

    return (
        <>
            <Popover2
                minimal
                interactionKind={PopoverInteractionKind.CLICK}
                content={
                    !projectUuid ? (
                        <SpinnerWrapper>
                            <Spinner size={20} />
                        </SpinnerWrapper>
                    ) : (
                        <MenuWrapper>
                            <NavLink to={`/projects/${projectUuid}/tables`}>
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
                                    projectUuid,
                                })}
                            >
                                <NavLink
                                    to={`/projects/${projectUuid}/sqlRunner`}
                                >
                                    <MenuItem2
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
