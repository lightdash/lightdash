import { NotFoundError, type AgentPermissionCheck } from '@lightdash/common';
import {
    type AgentPermissionRequest,
    type AgentPermissionService,
} from './AgentPermissionService';

type Dependencies = ConstructorParameters<typeof AgentPermissionService>[0];
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
    if (request.enforcementMode === 'managed') {
        const [assignments, projects] = await Promise.all([
            deps.userModel.getAgentRoleAssignmentsForProjects(
                args.account.user.id,
                args.organizationUuid,
                projectUuids,
            ),
            deps.projectModel.getSummaries(
                projectUuids.filter((uuid): uuid is string => uuid !== null),
            ),
        ]);
        const summaries = new Map(
            projects.map((project) => [project.projectUuid, project]),
        );
        scoped = {
            ...deps,
            userModel: {
                getAgentRoleAssignmentsForProjects:
                    deps.userModel.getAgentRoleAssignmentsForProjects.bind(
                        deps.userModel,
                    ),
                getAgentRoleAssignments: async (
                    _userUuid,
                    _organizationUuid,
                    projectUuid,
                ) => {
                    const roles = assignments.get(projectUuid);
                    if (!roles)
                        throw new NotFoundError(
                            'Project roles were not loaded',
                        );
                    return roles;
                },
            },
            projectModel: {
                getSummaries: deps.projectModel.getSummaries.bind(
                    deps.projectModel,
                ),
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
    let settings:
        | ReturnType<Dependencies['getOrganizationSettings']>
        | undefined;
    scoped = {
        ...scoped,
        getOrganizationSettings: () => {
            settings ??= deps.getOrganizationSettings(args.organizationUuid);
            return settings;
        },
    };
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
