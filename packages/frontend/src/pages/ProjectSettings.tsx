import { NonIdealState, Spinner, Tab, Tabs } from '@blueprintjs/core';
import { Breadcrumbs2 } from '@blueprintjs/popover2';
import { FC } from 'react';
import {
    Redirect,
    Route,
    Switch,
    useHistory,
    useParams,
} from 'react-router-dom';
import DbtCloudSettings from '../components/DbtCloudSettings';
import ProjectUserAccess from '../components/ProjectAccess';
import { UpdateProjectConnection } from '../components/ProjectConnection';
import ProjectTablesConfiguration from '../components/ProjectTablesConfiguration/ProjectTablesConfiguration';
import { useProject } from '../hooks/useProject';
import { TabsWrapper } from './ProjectSettings.styles';

enum Integrations {
    DBT_CLOUD = 'dbt-cloud',
}

enum SettingsTabs {
    SETTINGS = 'settings',
    TABLES_CONFIGURATION = 'tablesConfiguration',
    PROJECT_ACCESS = 'projectAccess',
}

const ProjectSettings: FC = () => {
    const history = useHistory();
    const { projectUuid, tab } = useParams<{
        projectUuid: string;
        tab?: SettingsTabs | Integrations;
    }>();

    const { isLoading, data: project, error } = useProject(projectUuid);
    const basePath = `/generalSettings/projectManagement/${projectUuid}`;

    const changeTab = (newTab: SettingsTabs | Integrations) => {
        if (newTab === Integrations.DBT_CLOUD) {
            history.push(`${basePath}/integration/${newTab}`);
        } else {
            history.push(`${basePath}/${newTab}`);
        }
    };

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
                    <Tab id={Integrations.DBT_CLOUD} title="dbt Cloud" />
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
                    path={`${basePath}/integration/${Integrations.DBT_CLOUD}`}
                >
                    <DbtCloudSettings projectUuid={projectUuid} />
                </Route>

                <Redirect to={basePath} />
            </Switch>
        </>
    );
};

export default ProjectSettings;
