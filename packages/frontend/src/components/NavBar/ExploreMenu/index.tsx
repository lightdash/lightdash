import {
    Button,
    Colors,
    Icon,
    Menu,
    PopoverInteractionKind,
    Position,
} from '@blueprintjs/core';
import { Popover2 } from '@blueprintjs/popover2';
import { subject } from '@casl/ability';
import {
    IconFolder,
    IconLayoutDashboard,
    IconSquareRoundedPlus,
    IconTable,
    IconTerminal2,
} from '@tabler/icons-react';
import { FC, memo, useState } from 'react';
import { useHistory } from 'react-router-dom';
import { useApp } from '../../../providers/AppProvider';
import { Can } from '../../common/Authorization';
import MantineIcon from '../../common/MantineIcon';
import DashboardCreateModal from '../../common/modal/DashboardCreateModal';
import SpaceActionModal, { ActionType } from '../../common/SpaceActionModal';
import {
    LargeMenuItem,
    LargeMenuItemIconWrapper,
    LargeMenuItemSubText,
    LargeMenuItemText,
} from './ExploreMenu.styles';

interface Props {
    projectUuid: string;
}

const ExploreMenu: FC<Props> = memo(({ projectUuid }) => {
    const { user } = useApp();
    const history = useHistory();
    const [isOpen, setIsOpen] = useState<boolean>(false);

    const [isCreateSpaceOpen, setIsCreateSpaceOpen] = useState<boolean>(false);
    const [isCreateDashboardOpen, setIsCreateDashboardOpen] =
        useState<boolean>(false);

    return (
        <>
            {' '}
            <Can
                I="manage"
                this={subject('Explore', {
                    organizationUuid: user.data?.organizationUuid,
                    projectUuid,
                })}
            >
                <Popover2
                    isOpen={isOpen}
                    interactionKind={PopoverInteractionKind.CLICK}
                    onClose={() => setIsOpen(false)}
                    content={
                        <Menu large>
                            <LargeMenuItem
                                icon={
                                    <LargeMenuItemIconWrapper>
                                        <MantineIcon
                                            icon={IconTable}
                                            size={22}
                                            color="gray.0"
                                        />
                                    </LargeMenuItemIconWrapper>
                                }
                                href={`/projects/${projectUuid}/tables`}
                                text={
                                    <>
                                        <LargeMenuItemText>
                                            Query from tables
                                        </LargeMenuItemText>
                                        <LargeMenuItemSubText>
                                            Build queries and save them as
                                            charts.
                                        </LargeMenuItemSubText>
                                    </>
                                }
                            />
                            <Can
                                I="manage"
                                this={subject('SqlRunner', {
                                    organizationUuid:
                                        user.data?.organizationUuid,
                                    projectUuid,
                                })}
                            >
                                <LargeMenuItem
                                    icon={
                                        <LargeMenuItemIconWrapper>
                                            <MantineIcon
                                                icon={IconTerminal2}
                                                size={22}
                                                color="gray.0"
                                            />
                                        </LargeMenuItemIconWrapper>
                                    }
                                    href={`/projects/${projectUuid}/sqlRunner`}
                                    onClick={() => setIsOpen(false)}
                                    text={
                                        <>
                                            <LargeMenuItemText>
                                                Query using SQL runner
                                            </LargeMenuItemText>
                                            <LargeMenuItemSubText>
                                                Access your database to run
                                                ad-hoc queries.
                                            </LargeMenuItemSubText>
                                        </>
                                    }
                                />
                            </Can>
                            <Can
                                I="manage"
                                this={subject('Dashboard', {
                                    organizationUuid:
                                        user.data?.organizationUuid,
                                    projectUuid,
                                })}
                            >
                                <LargeMenuItem
                                    icon={
                                        <LargeMenuItemIconWrapper>
                                            <MantineIcon
                                                icon={IconLayoutDashboard}
                                                size={22}
                                                color="gray.0"
                                            />
                                        </LargeMenuItemIconWrapper>
                                    }
                                    onClick={() => {
                                        setIsOpen(false);
                                        setIsCreateDashboardOpen(true);
                                    }}
                                    text={
                                        <>
                                            <LargeMenuItemText>
                                                Dashboard
                                            </LargeMenuItemText>
                                            <LargeMenuItemSubText>
                                                Arrange multiple charts into a
                                                single view.
                                            </LargeMenuItemSubText>
                                        </>
                                    }
                                />
                            </Can>
                            <Can
                                I="manage"
                                this={subject('Space', {
                                    organizationUuid:
                                        user.data?.organizationUuid,
                                    projectUuid,
                                })}
                            >
                                <LargeMenuItem
                                    icon={
                                        <LargeMenuItemIconWrapper>
                                            <MantineIcon
                                                icon={IconFolder}
                                                size={22}
                                                color="gray.0"
                                            />
                                        </LargeMenuItemIconWrapper>
                                    }
                                    onClick={() => {
                                        setIsOpen(false);
                                        setIsCreateSpaceOpen(true);
                                    }}
                                    text={
                                        <>
                                            <LargeMenuItemText>
                                                Space
                                            </LargeMenuItemText>
                                            <LargeMenuItemSubText>
                                                Organize your saved charts and
                                                dashboards.
                                            </LargeMenuItemSubText>
                                        </>
                                    }
                                />
                            </Can>
                        </Menu>
                    }
                    position={Position.BOTTOM_RIGHT}
                >
                    <Button
                        minimal
                        icon={
                            <MantineIcon
                                icon={IconSquareRoundedPlus}
                                size={20}
                                color="gray.5"
                                style={{ marginRight: '6px' }}
                            />
                        }
                        onClick={() => setIsOpen(!isOpen)}
                    >
                        New
                    </Button>
                </Popover2>
            </Can>
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
            <DashboardCreateModal
                projectUuid={projectUuid}
                isOpen={isCreateDashboardOpen}
                onClose={() => setIsCreateDashboardOpen(false)}
                onConfirm={(dashboard) => {
                    history.push(
                        `/projects/${projectUuid}/dashboards/${dashboard.uuid}/edit`,
                    );

                    setIsCreateDashboardOpen(false);
                }}
            />
        </>
    );
});
export default ExploreMenu;
