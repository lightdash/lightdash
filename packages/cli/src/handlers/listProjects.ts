import { OrganizationProject, ProjectType } from '@lightdash/common';
import { LightdashAnalytics } from '../analytics/analytics';
import GlobalState from '../globalState';
import * as styles from '../styles';
import { lightdashApi } from './dbt/apiClient';

type ListProjectsOptions = {
    verbose: boolean;
};

export const listProjectsHandler = async (options: ListProjectsOptions) => {
    const startTime = Date.now();
    GlobalState.setVerbose(options.verbose);

    try {
        const projects = await lightdashApi<OrganizationProject[]>({
            method: 'GET',
            url: `/api/v1/org/projects`,
            body: undefined,
        });

        GlobalState.debug(
            `> List projects returned response: ${JSON.stringify(projects)}`,
        );

        // Filter out preview projects
        const filteredProjects = projects.filter(
            (project) => project.type !== ProjectType.PREVIEW,
        );

        if (filteredProjects.length === 0) {
            console.error(styles.warning('No projects found.'));
        } else {
            console.error(
                styles.bold(`\nProjects (${filteredProjects.length}):\n`),
            );

            filteredProjects.forEach((project) => {
                console.error(`  ${styles.bold(project.name)}`);
                console.error(`    UUID: ${project.projectUuid}`);
                if (project.warehouseType) {
                    console.error(`    Warehouse: ${project.warehouseType}`);
                }
                console.error('');
            });
        }
    } finally {
        await LightdashAnalytics.track({
            event: 'command.executed',
            properties: {
                command: 'list-projects',
                durationMs: Date.now() - startTime,
            },
        });
    }
};
