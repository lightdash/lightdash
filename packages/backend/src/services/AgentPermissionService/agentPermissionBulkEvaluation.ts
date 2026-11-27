import { NotFoundError, type AgentPermissionCheck } from '@lightdash/common';
import { type ProjectModel } from '../../models/ProjectModel/ProjectModel';
import {
    type AgentPermissionRequest,
    type AgentPermissionService,
} from './AgentPermissionService';

type Dependencies = ConstructorParameters<typeof AgentPermissionService>[0];
export type AgentPermissionBulkLoaders = {
    projectModel: Pick<ProjectModel, 'getSummaries'>;
};
type Operation = Parameters<AgentPermissionService['assertOperation']>[0];
export type AgentPermissionBulkArgs = Pick<
    Operation,
    'account' | 'organizationUuid' | 'surface'
> & {
    operations: Pick<
        Operation,
        'kind' | 'key' | 'projectUuid' | 'connectedTool'
    >[];
};

export const evaluateAgentPermissionOperations = async (
    deps: Dependencies,
    loaders: AgentPermissionBulkLoaders,
    args: AgentPermissionBulkArgs,
    request: AgentPermissionRequest,
    createReader: (
        dependencies: Dependencies,
    ) => (
        operation: Operation,
        request: AgentPermissionRequest,
    ) => Promise<AgentPermissionCheck | null>,
): Promise<(AgentPermissionCheck | null)[]> => {
    const projectUuids = [
        ...new Set(args.operations.map((op) => op.projectUuid)),
    ];
    let scoped = deps;
    if (request.enforcementMode === 'restricted') {
        const projects = await loaders.projectModel.getSummaries(
            projectUuids.filter((uuid): uuid is string => uuid !== null),
        );
        const summaries = new Map(
            projects.map((project) => [project.projectUuid, project]),
        );
        scoped = {
            ...deps,
            projectModel: {
                getSummary: async (projectUuid) => {
                    const project = summaries.get(projectUuid);
                    if (!project)
                        throw new NotFoundError(
                            `Cannot find project with id: ${projectUuid}`,
                        );
                    return project;
                },
            },
        };
    }
    const read = createReader(scoped);
    return Promise.all(
        args.operations.map((operation) =>
            read(
                {
                    account: args.account,
                    organizationUuid: args.organizationUuid,
                    surface: args.surface,
                    ...operation,
                },
                request,
            ),
        ),
    );
};
