import {
    Button,
    Menu,
    PopoverInteractionKind,
    Position,
    Spinner,
} from '@blueprintjs/core';
import { Popover2 } from '@blueprintjs/popover2';
import { subject } from '@casl/ability';
import { FC, memo } from 'react';
import { useApp } from '../../../providers/AppProvider';
import { Can } from '../../common/Authorization';
import NavLink from '../../NavLink';
import { FirstItem, NavbarMenuItem, SpinnerWrapper } from '../NavBar.styles';

interface Props {
    projectUuid: string;
}

const ExploreMenu: FC<Props> = memo(({ projectUuid }) => {
    const { user } = useApp();

    return (
        <Popover2
            interactionKind={PopoverInteractionKind.CLICK}
            content={
                !projectUuid ? (
                    <SpinnerWrapper>
                        <Spinner size={20} />
                    </SpinnerWrapper>
                ) : (
                    <Menu>
                        <NavLink to={`/projects/${projectUuid}/tables`}>
                            <FirstItem
                                roleStructure="menuitem"
                                icon="th"
                                text="Tables"
                            />
                        </NavLink>
                        <Can
                            I="manage"
                            this={subject('SqlRunner', {
                                organizationUuid: user.data?.organizationUuid,
                                projectUuid,
                            })}
                        >
                            <NavLink to={`/projects/${projectUuid}/sqlRunner`}>
                                <NavbarMenuItem
                                    roleStructure="menuitem"
                                    icon="console"
                                    text="SQL Runner"
                                />
                            </NavLink>
                        </Can>
                    </Menu>
                )
            }
            position={Position.BOTTOM_LEFT}
        >
            <Button minimal icon="series-search" text="Explore" />
        </Popover2>
    );
});
export default ExploreMenu;
