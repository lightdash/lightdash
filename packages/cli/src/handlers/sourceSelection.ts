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
    name: string,
): ProjectDbtSourceSummary => {
    const selected = sources.find((source) => source.name === name);
    if (!selected) {
        throw new Error(
            `The dbt source "${name}" does not belong to this project.\n\nAvailable sources:\n${formatSourceNames(sources)}`,
        );
    }
    return selected;
};

const getProjectSources = async (
    projectUuid: string,
): Promise<ProjectDbtSourceSummary[]> =>
    lightdashApi<ApiProjectDbtSourcesResponse['results']>({
        method: 'GET',
        url: `/api/v1/projects/${projectUuid}/dbt-sources`,
        body: undefined,
    });

export const resolveProjectSourceUuid = async (
    projectUuid: string,
    sourceOverride: string | undefined,
    configuredProjectUuid: string = projectUuid,
): Promise<string | undefined> => {
    const config = await getConfig();
    const name =
        sourceOverride ??
        (config.context?.project === configuredProjectUuid
            ? config.context.source
            : undefined);
    if (name === undefined) return undefined;
    return selectProjectSource(await getProjectSources(projectUuid), name)
        .projectDbtSourceUuid;
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
