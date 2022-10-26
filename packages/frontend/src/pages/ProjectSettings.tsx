import { NonIdealState, Spinner, Tab, Tabs } from '@blueprintjs/core';
import { FC } from 'react';
import {
    Redirect,
    Route,
    Switch,
    useHistory,
    useParams,
} from 'react-router-dom';
import Content from '../components/common/Page/Content';
import DbtCloudSettings from '../components/DbtCloudSettings';
import ProjectUserAccess from '../components/ProjectAccess';
import { UpdateProjectConnection } from '../components/ProjectConnection';
import ProjectTablesConfiguration from '../components/ProjectTablesConfiguration/ProjectTablesConfiguration';
import { useProject } from '../hooks/useProject';
import {
    ContentContainer,
    ProjectConnectionContainer,
    Title,
    UpdateHeaderWrapper,
    UpdateProjectWrapper,
} from './ProjectSettings.styles';

const ProjectSettings: FC = () => {
    const history = useHistory();
    const { projectUuid, tab } = useParams<{
        projectUuid: string;
        tab?: string;
    }>();

    const { isLoading, data, error } = useProject(projectUuid);
    const basePath = `/generalSettings/projectManagement/${projectUuid}`;

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

    console.log({ tab });

    if (!tab) {
        return <Redirect to={`${basePath}/settings`} />;
    }

    if (isLoading || !data) {
        return (
            <div style={{ marginTop: '20px' }}>
                <NonIdealState title="Loading project" icon={<Spinner />} />
            </div>
        );
    }

    return (
        <>
            <Tabs
                id="TabsExample"
                selectedTabId={tab}
                onChange={(newTab) => {
                    history.push(`${basePath}/${newTab}`);
                }}
            >
                <Tab id="settings" title="Project Settings" />
                <Tab id="tablesConfiguration" title="Tables Configuration" />
                <Tab id="projectAccess" title="Project Access" />
                <Tab id="integrations/dbt-cloud" title="dbt Cloud" />
            </Tabs>

            <Switch>
                <Route exact path={`${basePath}/settings`}>
                    <ProjectConnectionContainer>
                        <UpdateProjectWrapper>
                            <UpdateProjectConnection
                                projectUuid={projectUuid}
                            />
                        </UpdateProjectWrapper>
                    </ProjectConnectionContainer>
                </Route>

                <Route exact path={`${basePath}/tablesConfiguration}`}>
                    <Content>
                        <ContentContainer>
                            <ProjectTablesConfiguration
                                projectUuid={projectUuid}
                            />
                        </ContentContainer>
                    </Content>
                </Route>

                <Route exact path={`${basePath}/projectAccess`}>
                    <ProjectUserAccess />
                </Route>

                <Route exact path={`${basePath}/integration/dbt-cloud`}>
                    <DbtCloudSettings />
                </Route>

                <Redirect to={basePath} />
            </Switch>
        </>
    );
};

export default ProjectSettings;
