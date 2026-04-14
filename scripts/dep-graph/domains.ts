import * as crypto from 'crypto';
import { DOMAIN_CACHE } from './config';
import { withCache } from './cache';
import { callClaude } from './claude';
import type { GraphData } from './types';

function computeNodeHash(graph: GraphData): string {
    const ids = graph.nodes
        .map((n) => n.id)
        .sort()
        .join('\n');
    return crypto.createHash('sha256').update(ids).digest('hex');
}

export function classifyDomains(graph: GraphData, force: boolean): Record<string, string[]> {
    const hash = computeNodeHash(graph);

    const { data: cached } = withCache<{ domains: Record<string, string[]> }>({
        cachePath: DOMAIN_CACHE,
        label: 'Domain',
        force,
        computeHash: () => hash,
        compute: () => {
            const nodeList = graph.nodes
                .map((n) => `- ${n.id} (${n.type})`)
                .join('\n');
            const edgeList = graph.edges
                .map((e) => `- ${e.from} -> ${e.to} (${e.type})`)
                .join('\n');

            const prompt = `You are classifying backend dependency-injection nodes into business domains for a dependency graph visualization.

Below are ${graph.nodes.length} nodes from the Lightdash backend (an open-source BI tool). Each node is a controller, service, model, or client.

NODES:
${nodeList}

EDGES:
${edgeList}

TASK: Group ALL nodes into 14-18 business domains based on their business function, NOT their technical layer.

Rules:
- Nodes that share a name root belong together (e.g., SpaceService, SpaceModel, spaceController -> "Spaces")
- Every node must appear in exactly one domain
- Domain names must be short (1-2 words)
- Use the edges to inform grouping: tightly connected nodes likely belong together
- Use EXACTLY the domain names listed below when they apply

Expected domains (use these names, assign all matching nodes to them):
- "Spaces" — spaceController, SpaceService, SpaceModel, SpacePermissionService, SpacePermissionModel
- "Dashboards" — dashboardController, v2/DashboardController, DashboardService, DashboardModel
- "Saved Charts" — savedChartController, v2/SavedChartController, SavedChartService, SavedChartModel
- "SQL Runner" — sqlRunnerController, SavedSqlService, SavedSqlModel
- "Explores" — exploreController, runQueryController, v2/QueryController, metricsExplorerController, funnelController, MetricsExplorerService, FunnelService, AsyncQueryService, QueryHistoryModel, PivotTableService
- "Projects" — projectController, v2/ParametersController, ProjectService, ProjectModel, ProjectParametersService, ProjectParametersModel, CoderService, WarehouseAvailableTablesModel
- "Organizations" — organizationController, OrganizationService, OrganizationModel, OrganizationMemberProfileModel, OrganizationAllowedEmailDomainsModel, OrganizationWarehouseCredentialsModel, UserWarehouseCredentialsModel
- "Roles & Permissions" — OrganizationRolesController, ProjectRolesController, RolesService, RolesModel, PermissionsService, groupsController, GroupService, GroupsModel
- "User Auth" — userController, UserService, UserModel, SessionModel, OpenIdIdentityModel, PasswordResetLinkModel, InviteLinkModel, OauthService, OauthModel, PersonalAccessTokenService, PersonalAccessTokenModel, OnboardingModel
- "Scheduling" — schedulerController, csvController, SchedulerService, SchedulerModel, SchedulerClient, JobModel, CsvService, DownloadFileService, DownloadFileModel, DownloadAuditModel
- "Content" — v2/ContentController, ContentService, ContentModel, pinningController, PinningService, PinnedListModel, ResourceViewItemModel, renameController, RenameService, shareController, ShareService, ShareModel, PromoteService
- "Catalog" — catalogController, CatalogService, CatalogModel, ChangesetController, ChangesetService, ChangesetModel, TagsModel
- "Notifications" — notificationsController, commentsController, NotificationService, NotificationsModel, CommentService, CommentModel
- "Git Integration" — gitIntegrationController, githubController, gitlabController, GitIntegrationService, GithubAppService, GitlabAppService, GithubAppInstallationsModel, GitlabAppInstallationsModel
- "Slack" — slackController, SlackIntegrationService, SlackService, SlackClient, SlackAuthenticationModel, UnfurlService
- "Infrastructure" — sshController, SshKeyPairService, SshKeyPairModel, S3Client, S3CacheClient, ResultsFileStorageClient, EmailClient, EmailModel, HealthService, MigrationModel, EncryptionUtil (if present)

For any remaining nodes not listed above, assign them to the closest matching domain or create a new domain if needed. Do NOT split the above domains — keep them intact.`;

            console.log('Calling Claude for classification...');
            const output = callClaude<{ domains: Record<string, string[]> }>({
                prompt,
                jsonSchema: {
                    type: 'object',
                    properties: {
                        domains: {
                            type: 'object',
                            additionalProperties: {
                                type: 'array',
                                items: { type: 'string' },
                            },
                        },
                    },
                    required: ['domains'],
                    additionalProperties: false,
                },
            });

            const domainCount = Object.keys(output.domains).length;
            const classifiedCount = Object.values(output.domains).reduce(
                (s, a) => s + a.length,
                0,
            );
            console.log(
                `Got ${domainCount} domains covering ${classifiedCount} nodes (expected ${graph.nodes.length}).`,
            );

            return output;
        },
    });

    return cached.domains;
}
