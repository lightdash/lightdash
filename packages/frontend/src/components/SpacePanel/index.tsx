import { Button } from '@blueprintjs/core';
import { Breadcrumbs2 } from '@blueprintjs/popover2';
import { subject } from '@casl/ability';
import { LightdashMode, Space } from '@lightdash/common';
import React, { useState } from 'react';
import { useHistory, useParams } from 'react-router-dom';
import { useApp } from '../../providers/AppProvider';
import { Can } from '../common/Authorization';
import ResourceList from '../common/ResourceList';
import AddResourceToSpaceMenu from '../Explorer/SpaceBrowser/AddResourceToSpaceMenu';
import AddResourceToSpaceModal, {
    AddToSpaceResources,
} from '../Explorer/SpaceBrowser/AddResourceToSpaceModal';
import CreateResourceToSpace from '../Explorer/SpaceBrowser/CreateResourceToSpace';
import { DeleteSpaceModal } from '../Explorer/SpaceBrowser/DeleteSpaceModal';
import { EditSpaceModal } from '../Explorer/SpaceBrowser/EditSpaceModal';
import { SpaceBrowserMenu } from '../Explorer/SpaceBrowser/SpaceBrowserMenu';
import {
    BreadcrumbsWrapper,
    SpacePanelHeader,
    SpacePanelWrapper,
} from './SpacePanel.styles';

interface Props {
    space: Space;
}

export const DEFAULT_DASHBOARD_NAME = 'Untitled dashboard';

export const SpacePanel: React.FC<Props> = ({ space }) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { user, health } = useApp();
    const isDemo = health.data?.mode === LightdashMode.DEMO;
    const history = useHistory();
    const savedDashboards = space.dashboards;
    const savedCharts = space.queries;
    const orderedCharts = savedCharts.sort(
        (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );

    const [updateSpace, setUpdateSpace] = useState<boolean>(false);
    const [deleteSpace, setDeleteSpace] = useState<boolean>(false);
    const [addToSpace, setAddToSpace] = useState<AddToSpaceResources>();
    const [createToSpace, setCreateToSpace] = useState<AddToSpaceResources>();

    return (
        <SpacePanelWrapper>
            <SpacePanelHeader>
                <BreadcrumbsWrapper>
                    <Breadcrumbs2
                        items={[
                            {
                                href: '/home',
                                text: 'Home',
                                className: 'home-breadcrumb',
                                onClick: (e) => {
                                    e.preventDefault();
                                    history.push('/home');
                                },
                            },
                            { text: space.name },
                        ]}
                    />
                </BreadcrumbsWrapper>

                <SpaceBrowserMenu
                    onRename={() => setUpdateSpace(true)}
                    onDelete={() => setDeleteSpace(true)}
                >
                    <Can
                        I="manage"
                        this={subject('Space', {
                            organizationUuid: user.data?.organizationUuid,
                            projectUuid,
                        })}
                    >
                        <Button icon="edit" text="Edit space" />
                    </Can>
                </SpaceBrowserMenu>

                {updateSpace && (
                    <EditSpaceModal
                        spaceUuid={space.uuid}
                        onClose={() => {
                            setUpdateSpace(false);
                        }}
                    />
                )}

                {deleteSpace && (
                    <DeleteSpaceModal
                        spaceUuid={space.uuid}
                        onClose={() => {
                            setDeleteSpace(false);
                        }}
                    />
                )}
            </SpacePanelHeader>

            <ResourceList
                headerTitle="Dashboards"
                resourceIcon="control"
                resourceType="dashboard"
                resourceList={savedDashboards}
                getURL={({ uuid }) =>
                    `/projects/${projectUuid}/dashboards/${uuid}/view`
                }
                headerAction={
                    user.data?.ability?.can('manage', 'Dashboard') &&
                    !isDemo && (
                        <AddResourceToSpaceMenu
                            resourceType={AddToSpaceResources.DASHBOARD}
                            onAdd={() =>
                                setAddToSpace(AddToSpaceResources.DASHBOARD)
                            }
                            onCreate={() =>
                                setCreateToSpace(AddToSpaceResources.DASHBOARD)
                            }
                        >
                            <Button icon="plus" intent="primary" />
                        </AddResourceToSpaceMenu>
                    )
                }
            />

            <ResourceList
                headerTitle="Saved charts"
                resourceList={orderedCharts}
                resourceIcon="chart"
                resourceType="saved_chart"
                getURL={({ uuid }) => `/projects/${projectUuid}/saved/${uuid}`}
                headerAction={
                    !isDemo &&
                    user.data?.ability?.can('manage', 'SavedChart') && (
                        <AddResourceToSpaceMenu
                            resourceType={AddToSpaceResources.CHART}
                            onAdd={() =>
                                setAddToSpace(AddToSpaceResources.CHART)
                            }
                            onCreate={() =>
                                setCreateToSpace(AddToSpaceResources.CHART)
                            }
                        >
                            <Button icon="plus" intent="primary" />
                        </AddResourceToSpaceMenu>
                    )
                }
            />

            {addToSpace && (
                <AddResourceToSpaceModal
                    isOpen
                    resourceType={addToSpace}
                    onClose={() => setAddToSpace(undefined)}
                />
            )}

            {createToSpace && (
                <CreateResourceToSpace resourceType={createToSpace} />
            )}
        </SpacePanelWrapper>
    );
};

export default SpacePanel;
