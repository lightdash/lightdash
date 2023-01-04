import { NonIdealState, Spinner, Tab, Tabs } from '@blueprintjs/core';
import { Breadcrumbs2 } from '@blueprintjs/popover2';
import { FC } from 'react';
import { Helmet } from 'react-helmet';
import {
    Redirect,
    Route,
    Switch,
    useHistory,
    useParams,
} from 'react-router-dom';
import ErrorState from '../components/common/ErrorState';
import DbtCloudSettings from '../components/DbtCloudSettings';
import ProjectUserAccess from '../components/ProjectAccess';
import { UpdateProjectConnection } from '../components/ProjectConnection';
import ProjectTablesConfiguration from '../components/ProjectTablesConfiguration/ProjectTablesConfiguration';
import { useProject } from '../hooks/useProject';
import { TabsWrapper } from './ProjectSettings.styles';

enum SettingsTabs {
    SETTINGS = 'settings',
    TABLES_CONFIGURATION = 'tablesConfiguration',
    PROJECT_ACCESS = 'projectAccess',
}

enum IntegrationsTabs {
    DBT_CLOUD = 'dbt-cloud',
}

const ProjectSettings: FC = () => {
    const history = useHistory();
    const { projectUuid, tab } = useParams<{
        projectUuid: string;
        tab?: SettingsTabs | IntegrationsTabs;
    }>();

    const { isLoading, data: project, error } = useProject(projectUuid);
    const basePath = `/generalSettings/projectManagement/${projectUuid}`;

    const changeTab = (newTab: SettingsTabs | IntegrationsTabs) => {
        if (newTab === IntegrationsTabs.DBT_CLOUD) {
            history.push(`${basePath}/integrations/${newTab}`);
        } else {
            history.push(`${basePath}/${newTab}`);
        }
    };

    if (error) {
        return <ErrorState error={error.error} />;
    }

    if (!tab) {
        return <Redirect to={`${basePath}/${SettingsTabs.SETTINGS}`} />;
    }

    if (isLoading || !project) {
        return (
            <div style={{ marginTop: '20px' }}>
                <NonIdealState title="Loading project" icon={<Spinner />} />
            </div>
        );
    }

    return (
        <>
            <Helmet>
                <title>Project Settings - Lightdash</title>
            </Helmet>
            <Breadcrumbs2
                items={[
                    {
                        text: 'All projects',
                        onClick: () =>
                            history.push('/generalSettings/projectManagement'),
                    },
                    {
                        text: project.name,
                    },
                ]}
            />

            <TabsWrapper>
                <Tabs id="TabsExample" selectedTabId={tab} onChange={changeTab}>
                    <Tab id={SettingsTabs.SETTINGS} title="Project Settings" />
                    <Tab
                        id={SettingsTabs.TABLES_CONFIGURATION}
                        title="Tables Configuration"
                    />
                    <Tab
                        id={SettingsTabs.PROJECT_ACCESS}
                        title="Project Access"
                    />
                    <Tab id={IntegrationsTabs.DBT_CLOUD} title="dbt Cloud" />
                </Tabs>
            </TabsWrapper>

            <Switch>
                <Route exact path={`${basePath}/${SettingsTabs.SETTINGS}`}>
                    <UpdateProjectConnection projectUuid={projectUuid} />
                </Route>

                <Route
                    exact
                    path={`${basePath}/${SettingsTabs.TABLES_CONFIGURATION}`}
                >
                    <ProjectTablesConfiguration projectUuid={projectUuid} />
                </Route>

                <Route
                    exact
                    path={`${basePath}/${SettingsTabs.PROJECT_ACCESS}`}
                >
                    <ProjectUserAccess projectUuid={projectUuid} />
                </Route>

                <Route
                    exact
                    path={`${basePath}/integrations/${IntegrationsTabs.DBT_CLOUD}`}
                >
                    <DbtCloudSettings projectUuid={projectUuid} />
                </Route>

                <Redirect to={basePath} />
            </Switch>
        </>
    );
};

export default ProjectSettings;
