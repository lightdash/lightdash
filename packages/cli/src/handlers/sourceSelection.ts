import {
    AuthorizationError,
    type ApiProjectDbtSourcesResponse,
    type ProjectDbtSourceSummary,
} from '@lightdash/common';
import { getConfig, setSource } from '../config';
import GlobalState from '../globalState';
import { lightdashApi } from './dbt/apiClient';

const formatSourceNames = (sources: ProjectDbtSourceSummary[]): string =>
    sources.map(({ name }) => `  - ${name}`).join('\n');

export const selectProjectSource = (
    sources: ProjectDbtSourceSummary[],
    selectedName?: string,
): ProjectDbtSourceSummary => {
    if (selectedName) {
        const selected = sources.find(({ name }) => name === selectedName);
        if (selected) return selected;
        throw new Error(
            `The dbt source "${selectedName}" does not belong to this project.\n\nAvailable sources:\n${formatSourceNames(sources)}`,
        );
    }
    if (sources.length === 1) return sources[0];
    if (sources.length === 0) {
        throw new Error('This project has no dbt sources.');
    }
    throw new Error(
        `This project has several dbt sources. Set one with lightdash config set-source <name> or pass --source <name>.\n\nAvailable sources:\n${formatSourceNames(sources)}`,
    );
};

export const getProjectSources = async (
    projectUuid: string,
): Promise<ProjectDbtSourceSummary[]> =>
    lightdashApi<ApiProjectDbtSourcesResponse['results']>({
        method: 'GET',
        url: `/api/v1/projects/${projectUuid}/dbt-sources`,
        body: undefined,
    });

export const resolveProjectSource = async (
    projectUuid: string,
    sourceOverride?: string,
): Promise<ProjectDbtSourceSummary> => {
    const config = await getConfig();
    return selectProjectSource(
        await getProjectSources(projectUuid),
        sourceOverride ??
            (config.context?.project === projectUuid
                ? config.context.source
                : undefined),
    );
};

export const setSourceHandler = async (
    name: string,
    options: { verbose: boolean },
) => {
    GlobalState.setVerbose(options.verbose);
    const config = await getConfig();
    if (!config.context?.project) {
        throw new AuthorizationError(
            `No project selected. Run 'lightdash config set-project' first.`,
        );
    }
    const source = selectProjectSource(
        await getProjectSources(config.context.project),
        name,
    );
    await setSource(source.name);
    console.error(`\n  ✅️ Selected dbt source: ${source.name}\n`);
};
