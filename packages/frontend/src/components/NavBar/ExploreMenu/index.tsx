import {
    Button,
    Icon,
    IconName,
    PopoverInteractionKind,
    Position,
} from '@blueprintjs/core';
import { Popover2 } from '@blueprintjs/popover2';
import { subject } from '@casl/ability';
import { FC, memo, useState } from 'react';
import { useHistory } from 'react-router-dom';
import { useCreateMutation } from '../../../hooks/dashboard/useDashboard';
import { DEFAULT_DASHBOARD_NAME } from '../../../pages/SavedDashboards';
import { useApp } from '../../../providers/AppProvider';
import { Can } from '../../common/Authorization';
import SpaceActionModal, { ActionType } from '../../common/SpaceActionModal';
import {
    ButtonWrapper,
    HelpItem,
    IconContainer,
    ItemCTA,
    ItemDescription,
    MenuWrapper,
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
    const history = useHistory();
    const [isOpen, setIsOpen] = useState<boolean>(false);
    const {
        isLoading: isCreatingDashboard,
        isSuccess: hasCreatedDashboard,
        mutate: createDashboard,
        data: newDashboard,
        reset,
    } = useCreateMutation(projectUuid);
    const [isCreateSpaceOpen, setIsCreateSpaceOpen] = useState<boolean>(false);

    if (!isCreatingDashboard && hasCreatedDashboard && newDashboard) {
        history.push(
            `/projects/${projectUuid}/dashboards/${newDashboard.uuid}`,
        );
        reset();
    }
    return (
        <>
            <Popover2
                isOpen={isOpen}
                interactionKind={PopoverInteractionKind.CLICK}
                onClose={() => setIsOpen(false)}
                content={
                    <MenuWrapper>
                        <ButtonWrapper
                            onClick={() => {
                                setIsOpen(false);
                                history.push(`/projects/${projectUuid}/tables`);
                            }}
                        >
                            <ExploreItem
                                icon="th"
                                title="Query from tables"
                                description="Build queries and save them as charts."
                            />
                        </ButtonWrapper>
                        <Can
                            I="manage"
                            this={subject('SqlRunner', {
                                organizationUuid: user.data?.organizationUuid,
                                projectUuid,
                            })}
                        >
                            <ButtonWrapper
                                onClick={() => {
                                    setIsOpen(false);
                                    history.push(
                                        `/projects/${projectUuid}/sqlRunner`,
                                    );
                                }}
                            >
                                <ExploreItem
                                    icon="console"
                                    title="Query using SQL runner"
                                    description="Access your database to run ad-hoc queries."
                                />
                            </ButtonWrapper>
                        </Can>
                        <Can
                            I="manage"
                            this={subject('Dashboard', {
                                organizationUuid: user.data?.organizationUuid,
                                projectUuid,
                            })}
                        >
                            <ButtonWrapper
                                onClick={() => {
                                    setIsOpen(false);
                                    createDashboard({
                                        name: DEFAULT_DASHBOARD_NAME,
                                        tiles: [],
                                    });
                                }}
                            >
                                <ExploreItem
                                    icon="control"
                                    title="Dashboard"
                                    description="Arrange multiple charts into a single view."
                                />
                            </ButtonWrapper>
                        </Can>
                        <Can
                            I="manage"
                            this={subject('Space', {
                                organizationUuid: user.data?.organizationUuid,
                                projectUuid,
                            })}
                        >
                            <ButtonWrapper
                                onClick={() => {
                                    setIsOpen(false);
                                    setIsCreateSpaceOpen(true);
                                }}
                            >
                                <ExploreItem
                                    icon="folder-new"
                                    title="Space"
                                    description="Organize your saved charts and dashboards."
                                />
                            </ButtonWrapper>
                        </Can>
                    </MenuWrapper>
                }
                position={Position.BOTTOM_LEFT}
            >
                <Button minimal icon="add" onClick={() => setIsOpen(!isOpen)}>
                    New
                </Button>
            </Popover2>
            {isCreateSpaceOpen && (
                <SpaceActionModal
                    projectUuid={projectUuid}
                    actionType={ActionType.CREATE}
                    title="Create new space"
                    confirmButtonLabel="Create"
                    icon="folder-close"
                    onClose={() => setIsCreateSpaceOpen(false)}
                    onSubmitForm={(space) => {
                        if (space)
                            history.push(
                                `/projects/${projectUuid}/spaces/${space.uuid}`,
                            );
                    }}
                />
            )}
        </>
    );
});
export default ExploreMenu;
