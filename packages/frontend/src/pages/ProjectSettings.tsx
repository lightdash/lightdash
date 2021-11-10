import React, { FC, useMemo } from 'react';
import {
    Menu,
    MenuDivider,
    NonIdealState,
    Spinner,
    Divider,
    H3,
} from '@blueprintjs/core';
import { Redirect, Route, Switch, useParams } from 'react-router-dom';
import { useProject } from '../hooks/useProject';
import { UpdateProjectConnection } from '../components/ProjectConnection';
import PageBase from '../components/common/Page/PageBase';
import Sidebar from '../components/common/Page/Sidebar';
import Content from '../components/common/Page/Content';
import NavMenuItem from '../components/common/NavMenuItem';

const ProjectSettings: FC = () => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { isLoading, data, error } = useProject(projectUuid);

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
        <PageBase>
            <Sidebar title="Project settings">
                <Menu>
                    <NavMenuItem
                        text="Project connections"
                        exact
                        to={basePath}
                    />
                </Menu>
            </Sidebar>
            <Content>
                <Switch>
                    <Route exact path={basePath}>
                        <H3 style={{ marginTop: 10, marginBottom: 0 }}>
                            Edit your project connections
                        </H3>
                        <Divider style={{ margin: '20px 0' }} />
                        <UpdateProjectConnection projectUuid={projectUuid} />
                    </Route>
                    <Redirect to={basePath} />
                </Switch>
            </Content>
        </PageBase>
    );
};

export default ProjectSettings;
