import { Colors, Divider, H3, NonIdealState, Spinner } from '@blueprintjs/core';
import { FC } from 'react';
import { Redirect, Route, Switch, useParams } from 'react-router-dom';
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
    const { projectUuid } = useParams<{ projectUuid: string }>();
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

    if (isLoading || !data) {
        return (
            <div style={{ marginTop: '20px' }}>
                <NonIdealState title="Loading project" icon={<Spinner />} />
            </div>
        );
    }

    {
        /* <Sidebar title="Project settings" noMargin>
                <Menu>
                    <RouterMenuItem
                        text="Project connections"
                        exact
                        to={`${basePath}/settings`}
                    />
                    <MenuDivider />
                    <RouterMenuItem
                        text="Tables configuration"
                        exact
                        to={`${basePath}/tablesConfiguration`}
                    />
                    <MenuDivider />
                    <RouterMenuItem
                        text="Project access"
                        exact
                        to={`${basePath}/projectAccess`}
                    />
                    <MenuDivider />
                    <RouterMenuItem
                        text="dbt Cloud"
                        exact
                        to={`${basePath}/integration/dbt-cloud`}
                    />
                </Menu>
            </Sidebar> */
    }

    return (
        <Switch>
            <Route exact path={`${basePath}/tablesConfiguration}`}>
                <Content>
                    <ContentContainer>
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
                            models you want to appear as tables in Lightdash.
                            You can always adjust this in your project settings
                            later.
                        </p>
                        <ProjectTablesConfiguration projectUuid={projectUuid} />
                    </ContentContainer>
                </Content>
            </Route>

            <Route exact path={`${basePath}/settings`}>
                <ProjectConnectionContainer>
                    <UpdateProjectWrapper>
                        <UpdateHeaderWrapper>
                            <Title marginBottom>
                                Edit your project connection
                            </Title>
                        </UpdateHeaderWrapper>
                        <UpdateProjectConnection projectUuid={projectUuid} />
                    </UpdateProjectWrapper>
                </ProjectConnectionContainer>
            </Route>

            <Route exact path={`${basePath}/projectAccess`}>
                <ProjectUserAccess />
            </Route>

            <Route exact path={`${basePath}/integration/dbt-cloud`}>
                <DbtCloudSettings />
            </Route>

            <Redirect to={basePath} />
        </Switch>
    );
};

export default ProjectSettings;
