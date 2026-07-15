import { ParameterError, ProjectSummary } from '@lightdash/common';
import { LightdashAnalytics } from '../analytics/analytics';
import { getConfig, setProject } from '../config';
import GlobalState from '../globalState';
import { lightdashApi } from './dbt/apiClient';

type RenameProjectOptions = {
    name: string;
    verbose: boolean;
};

export const renameProjectCommand = async (name: string) => {
    const trimmedName = name.trim();
    if (trimmedName.length === 0) {
        throw new ParameterError('Project name cannot be empty');
    }

    const config = await getConfig();
    const projectUuid = config.context?.project;

    if (!projectUuid) {
        throw new Error(
            'No project set. Use `lightdash config set-project` to select a project.',
        );
    }

    const project = await lightdashApi<ProjectSummary>({
        method: 'PATCH',
        url: `/api/v1/projects/${projectUuid}/details`,
        body: JSON.stringify({ name: trimmedName }),
    });

    await setProject(project.projectUuid, project.name);
    console.error(`\n  ✅️ Renamed project to: ${project.name}\n`);
};

export const renameProjectHandler = async (options: RenameProjectOptions) => {
    const startTime = Date.now();
    let success = true;
    GlobalState.setVerbose(options.verbose);

    try {
        await renameProjectCommand(options.name);
    } catch (e) {
        success = false;
        throw e;
    } finally {
        await LightdashAnalytics.track({
            event: 'command.executed',
            properties: {
                command: 'rename-project',
                durationMs: Date.now() - startTime,
                success,
            },
        });
    }
};
