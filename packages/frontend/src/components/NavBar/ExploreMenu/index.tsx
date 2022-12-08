import {
    Button,
    Icon,
    IconName,
    Menu,
    PopoverInteractionKind,
    Position,
    Spinner,
} from '@blueprintjs/core';
import { Popover2 } from '@blueprintjs/popover2';
import { subject } from '@casl/ability';
import { FC, memo } from 'react';
import { useIntercom } from 'react-use-intercom';
import { useApp } from '../../../providers/AppProvider';
import { useTracking } from '../../../providers/TrackingProvider';
import { Can } from '../../common/Authorization';
import NavLink from '../../NavLink';
import { FirstItem, NavbarMenuItem, SpinnerWrapper } from '../NavBar.styles';
import {
    ButtonWrapper,
    HelpItem,
    IconContainer,
    ItemCTA,
    ItemDescription,
    LinkWrapper,
    MenuWrapper,
    NotificationWidget,
    NotificationWrapper,
} from './ExploreMenu.styles';

interface Props {
    projectUuid: string;
}

interface ExploreItemProps {
    icon: IconName;
    title: string;
    description: string;
}
const ExploreItem: FC<ExploreItemProps> = ({ icon, title, description }) => {
    return (
        <HelpItem>
            <IconContainer>
                <Icon icon={icon} />
            </IconContainer>
            <div>
                <ItemCTA>{title}</ItemCTA>
                <ItemDescription>{description}</ItemDescription>
            </div>
        </HelpItem>
    );
};
const ExploreMenu: FC<Props> = memo(({ projectUuid }) => {
    const { user } = useApp();

    return (
        <Popover2
            interactionKind={PopoverInteractionKind.CLICK_TARGET_ONLY}
            content={
                <MenuWrapper>
                    <NavLink to={`/projects/${projectUuid}/tables`}>
                        <ExploreItem
                            icon="th"
                            title="Query from tables"
                            description="Build queries from your tables, visualize them & turn them into saved charts."
                        />
                    </NavLink>
                    <NavLink to={`/projects/${projectUuid}/sqlRunner`}>
                        <ExploreItem
                            icon="console"
                            title="Query using SQL runner"
                            description="Directly access your database to run & visualize ad-hoc queries."
                        />
                    </NavLink>
                    <NavLink to={`/projects/${projectUuid}/sqlRunner`}>
                        <ExploreItem
                            icon="control"
                            title="Dashboard"
                            description="Arrange multiple charts into a single view."
                        />
                    </NavLink>

                    <NavLink to={`/projects/${projectUuid}/sqlRunner`}>
                        <ExploreItem
                            icon="folder-new"
                            title="Space"
                            description="Organize your saved charts and dashboards."
                        />
                    </NavLink>
                </MenuWrapper>
            }
            position={Position.BOTTOM_LEFT}
        >
            <Button minimal icon="add">
                New
            </Button>
        </Popover2>
    );
});
export default ExploreMenu;
