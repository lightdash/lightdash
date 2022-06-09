import {
    Colors,
    Divider,
    H3,
    Menu,
    MenuDivider,
    NonIdealState,
    Spinner,
} from '@blueprintjs/core';
import React, { FC, useEffect, useMemo, useState } from 'react';
import { Redirect, Route, Switch, useParams } from 'react-router-dom';
import Content from '../components/common/Page/Content';
import PageWithSidebar from '../components/common/Page/PageWithSidebar';
import Sidebar from '../components/common/Page/Sidebar';
import RouterMenuItem from '../components/common/RouterMenuItem';
import { UpdateProjectConnection } from '../components/ProjectConnection';
import WareHouseConnectCard, {
    SelectedWarehouse,
    WarehouseTypeLabels,
} from '../components/ProjectConnection/ProjectConnectFlow/WareHouseConnectCard.tsx';
import ProjectTablesConfiguration from '../components/ProjectTablesConfiguration/ProjectTablesConfiguration';
import { useProject } from '../hooks/useProject';
import {
    BackToWarehouseButton,
    ConnectCardWrapper,
    Title,
    UpdateHeaderWrapper,
    UpdateProjectWrapper,
} from './ProjectSettings.styles';

const ProjectSettings: FC = () => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { isLoading, data, error } = useProject(projectUuid);
    const [selectedWarehouse, setSelectedWarehouse] = useState<
        SelectedWarehouse | undefined
    >();

    useEffect(() => {
        const activeWarehouse = data?.warehouseConnection?.type;

        const defaultWarehouse = WarehouseTypeLabels.filter((warehouse) => {
            return warehouse.key === activeWarehouse;
        });
        if (defaultWarehouse) setSelectedWarehouse(defaultWarehouse[0]);
    }, [data]);

    const basePath = useMemo(
        () => `/projects/${projectUuid}/settings`,
        [projectUuid],
    );

    if (error) {
        return (
            <div style={{ marginTop: '20px' }}>
                <NonIdealState
                    title="Error loading project"
                    description={error.error.message}
                />
            </div>
        );
    }

    if (isLoading || !data) {
        return (
            <div style={{ marginTop: '20px' }}>
                <NonIdealState title="Loading project" icon={<Spinner />} />
            </div>
        );
    }
    return (
        <PageWithSidebar>
            <Sidebar title="Project settings" noMargin>
                <Menu>
                    <RouterMenuItem
                        text="Project connections"
                        exact
                        to={basePath}
                    />
                    <MenuDivider />
                    <RouterMenuItem
                        text="Tables configuration"
                        exact
                        to={`${basePath}/tablesConfiguration`}
                    />
                </Menu>
            </Sidebar>

            <Switch>
                <Route
                    exact
                    path="/projects/:projectUuid/settings/tablesConfiguration"
                >
                    <Content>
                        <H3 style={{ marginTop: 10, marginBottom: 0 }}>
                            Your project has connected successfully! 🎉
                        </H3>
                        <Divider style={{ margin: '20px 0' }} />
                        <p
                            style={{
                                marginBottom: 20,
                                color: Colors.GRAY1,
                            }}
                        >
                            Before you start exploring your data, pick the dbt
                            models you wanto to appear as tables in Lightdash.
                            You can always adjust this in your project settings
                            later.
                        </p>
                        <ProjectTablesConfiguration projectUuid={projectUuid} />
                    </Content>
                </Route>

                <Route exact path="/projects/:projectUuid/settings">
                    <Content noPadding>
                        {!selectedWarehouse ? (
                            <ConnectCardWrapper>
                                <WareHouseConnectCard
                                    setWarehouse={setSelectedWarehouse}
                                />
                            </ConnectCardWrapper>
                        ) : (
                            <UpdateProjectWrapper>
                                <UpdateHeaderWrapper>
                                    <BackToWarehouseButton
                                        icon="chevron-left"
                                        text="Back to warehouses!"
                                        onClick={() =>
                                            setSelectedWarehouse(undefined)
                                        }
                                    />
                                    <Title marginBottom>
                                        {`Edit your ${selectedWarehouse.label} connection`}
                                    </Title>
                                </UpdateHeaderWrapper>
                                <UpdateProjectConnection
                                    projectUuid={projectUuid}
                                    selectedWarehouse={selectedWarehouse}
                                />
                            </UpdateProjectWrapper>
                        )}
                    </Content>
                </Route>
                <Redirect to={basePath} />
            </Switch>
        </PageWithSidebar>
    );
};

export default ProjectSettings;
