import { Stack } from '@mantine/core';
import { type FC } from 'react';
import { Helmet } from 'react-helmet';
import { Redirect, Route, Switch, useParams } from 'react-router-dom';
import ErrorState from '../components/common/ErrorState';
import PageBreadcrumbs from '../components/common/PageBreadcrumbs';
import SuboptimalState from '../components/common/SuboptimalState/SuboptimalState';
import CustomSqlPanel from '../components/CustomSqlPanel/CustomSqlPanel';
import { DataOps } from '../components/DataOps';
import ProjectUserAccess from '../components/ProjectAccess';
import { UpdateProjectConnection } from '../components/ProjectConnection';
import ProjectTablesConfiguration from '../components/ProjectTablesConfiguration/ProjectTablesConfiguration';
import SettingsScheduler from '../components/SettingsScheduler';
import SettingsSemanticLayer from '../components/SettingsSemanticLayer';
import SettingsUsageAnalytics from '../components/SettingsUsageAnalytics';
import { SettingsValidator } from '../components/SettingsValidator';
import { useProject } from '../hooks/useProject';

const ProjectSettings: FC = () => {
    const { projectUuid } = useParams<{
        projectUuid: string;
    }>();

    const { isInitialLoading, data: project, error } = useProject(projectUuid);

    if (error) {
        return <ErrorState error={error.error} />;
    }

    if (isInitialLoading || !project) {
        return (
            <div style={{ marginTop: '20px' }}>
                <SuboptimalState title="Loading project" loading />
            </div>
        );
    }

    return (
        <>
            <Helmet>
                <title>Project Settings - Lightdash</title>
            </Helmet>

            <Stack spacing="xl">
                <PageBreadcrumbs
                    items={[
                        {
                            title: 'All projects',
                            to: '/generalSettings/projectManagement',
                        },
                        {
                            title: project.name,
                            active: true,
                        },
                    ]}
                />

                <Switch>
                    <Route
                        exact
                        path={`/generalSettings/projectManagement/${projectUuid}/settings`}
                    >
                        <UpdateProjectConnection projectUuid={projectUuid} />
                    </Route>

                    <Route
                        exact
                        path={`/generalSettings/projectManagement/${projectUuid}/tablesConfiguration`}
                    >
                        <ProjectTablesConfiguration projectUuid={projectUuid} />
                    </Route>

                    <Route
                        exact
                        path={`/generalSettings/projectManagement/${projectUuid}/projectAccess`}
                    >
                        <ProjectUserAccess projectUuid={projectUuid} />
                    </Route>

                    <Route
                        exact
                        path={`/generalSettings/projectManagement/${projectUuid}/semanticLayer`}
                    >
                        <SettingsSemanticLayer projectUuid={projectUuid} />
                    </Route>

                    <Route
                        exact
                        path={`/generalSettings/projectManagement/${projectUuid}/usageAnalytics`}
                    >
                        <SettingsUsageAnalytics projectUuid={projectUuid} />
                    </Route>

                    <Route
                        exact
                        path={`/generalSettings/projectManagement/${projectUuid}/scheduledDeliveries`}
                    >
                        <SettingsScheduler projectUuid={projectUuid} />
                    </Route>

                    <Route
                        exact
                        path={`/generalSettings/projectManagement/${projectUuid}/validator`}
                    >
                        <SettingsValidator projectUuid={projectUuid} />
                    </Route>

                    <Route
                        exact
                        path={`/generalSettings/projectManagement/${projectUuid}/customSql`}
                    >
                        <CustomSqlPanel projectUuid={projectUuid} />
                    </Route>

                    <Route
                        exact
                        path={`/generalSettings/projectManagement/${projectUuid}/dataOps`}
                    >
                        <DataOps projectUuid={projectUuid} />
                    </Route>

                    <Redirect to={`/generalSettings/`} />
                </Switch>
            </Stack>
        </>
    );
};

export default ProjectSettings;
