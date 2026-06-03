import { subject } from '@casl/ability';
import {
    DbtProjectType,
    detectPreviewDeployWorkflow,
    ForbiddenError,
    generatePreviewDeployWorkflowFiles,
    getErrorMessage,
    getPreviewDeploySecrets,
    ParameterError,
    PullRequestProvider,
    PullRequestSource,
    type DbtProjectConfig,
    type PreviewDeploySetupResult,
    type ProjectCiStatus,
    type SessionUser,
} from '@lightdash/common';
import { randomUUID } from 'crypto';
import {
    createBranch,
    createPullRequest,
    createSignedCommitOnBranch,
    getBranchHeadSha,
    getRepoDefaultBranch,
    getRepoWorkflowFiles,
} from '../../../clients/github/Github';
import type { LightdashConfig } from '../../../config/parseConfig';
import type { GithubAppInstallationsModel } from '../../../models/GithubAppInstallations/GithubAppInstallationsModel';
import type { ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import type { PullRequestsModel } from '../../../models/PullRequestsModel';
import { BaseService } from '../../../services/BaseService';
import { VERSION } from '../../../version';
import type { ProjectCiStatusModel } from '../../models/ProjectCiStatusModel';

type PreviewDeploySetupServiceDeps = {
    lightdashConfig: LightdashConfig;
    projectModel: ProjectModel;
    githubAppInstallationsModel: GithubAppInstallationsModel;
    pullRequestsModel: PullRequestsModel;
    projectCiStatusModel: ProjectCiStatusModel;
};

type GithubTarget = {
    owner: string;
    repo: string;
    /** dbt project directory relative to the repo root; null for the root. */
    projectSubPath: string | null;
};

const PR_TITLE = 'Add Lightdash preview deploys';
const PR_BODY = [
    'This pull request adds a GitHub Actions workflow that spins up a temporary Lightdash preview project for every pull request and tears it down when the PR is closed.',
    '',
    'Before these previews can run, add the GitHub Actions repository secrets listed in the chat (`LIGHTDASH_URL`, `LIGHTDASH_PROJECT`, `LIGHTDASH_API_KEY`, `DBT_PROFILES`).',
    '',
    'Opened by the Lightdash AI assistant.',
].join('\n');
const COMMIT_HEADLINE = 'Add Lightdash preview-deploy GitHub Actions workflow';

/** Normalise the stored sub-path (leading slash, `/` for root) to a repo-root-relative path, or null for the root. */
const normalizeProjectSubPath = (projectSubPath: string): string | null => {
    const relative = projectSubPath
        .trim()
        .replace(/^\/+/, '')
        .replace(/\/+$/, '');
    return relative === '' ? null : relative;
};

/** Commit message body with the triggering user credited as a co-author. */
const buildCommitBody = (user: SessionUser): string => {
    const name = `${user.firstName} ${user.lastName}`.trim();
    const trailer = user.email
        ? `Co-authored-by: ${name || user.email} <${user.email}>`
        : null;
    return trailer ? `${COMMIT_HEADLINE}\n\n${trailer}` : COMMIT_HEADLINE;
};

const parseGithubTarget = (connection: DbtProjectConfig): GithubTarget => {
    if (connection.type !== DbtProjectType.GITHUB) {
        throw new ParameterError(
            `Automated preview-deploy setup currently supports GitHub Actions only, so it can't run for this project's "${connection.type}" connection. Preview deploys can still be set up manually via your own CI.`,
        );
    }
    const [owner, repo] = connection.repository.split('/');
    if (!owner || !repo) {
        throw new ParameterError(
            `Project's dbt connection has an invalid repository "${connection.repository}" (expected "owner/repo")`,
        );
    }
    return {
        owner,
        repo,
        projectSubPath: normalizeProjectSubPath(connection.project_sub_path),
    };
};

/**
 * Owns everything about Lightdash preview-deploy CI: reading/scanning a
 * project's CI status, and opening the pull request that adds the preview
 * GitHub Actions workflow. Deliberately self-contained — it shares nothing with
 * AiWritebackService beyond the pure `@lightdash/common` primitives and the
 * `ProjectCiStatusModel`, so the two concerns (data writeback vs. preview-deploy
 * setup) stay cleanly separated. GitHub Actions only.
 */
export class PreviewDeploySetupService extends BaseService {
    private readonly lightdashConfig: LightdashConfig;

    private readonly projectModel: ProjectModel;

    private readonly githubAppInstallationsModel: GithubAppInstallationsModel;

    private readonly pullRequestsModel: PullRequestsModel;

    private readonly projectCiStatusModel: ProjectCiStatusModel;

    constructor({
        lightdashConfig,
        projectModel,
        githubAppInstallationsModel,
        pullRequestsModel,
        projectCiStatusModel,
    }: PreviewDeploySetupServiceDeps) {
        super({ serviceName: 'PreviewDeploySetupService' });
        this.lightdashConfig = lightdashConfig;
        this.projectModel = projectModel;
        this.githubAppInstallationsModel = githubAppInstallationsModel;
        this.pullRequestsModel = pullRequestsModel;
        this.projectCiStatusModel = projectCiStatusModel;
    }

    private assertCanViewSourceCode(
        user: SessionUser,
        organizationUuid: string,
        projectUuid: string,
    ): void {
        // Authorize against the project's own organization (resource-derived),
        // not the caller's org.
        if (
            this.createAuditedAbility(user).cannot(
                'view',
                subject('SourceCode', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }
    }

    private async resolveInstallationId(
        organizationUuid: string,
    ): Promise<string> {
        const installationId =
            await this.githubAppInstallationsModel.getInstallationId(
                organizationUuid,
            );
        if (!installationId) {
            throw new ForbiddenError(
                'GitHub App is not installed for this organization',
            );
        }
        return installationId;
    }

    /**
     * Read the recorded CI status for a project (whether its repo has a
     * Lightdash preview-deploy workflow). Returns null when the project has
     * never been scanned. Used by the chat UI to decide whether a write-back PR
     * will get a preview deployment, so it only waits for a preview URL when one
     * is actually expected.
     */
    async getProjectCiStatus(
        user: SessionUser,
        projectUuid: string,
    ): Promise<ProjectCiStatus | null> {
        const project = await this.projectModel.get(projectUuid);
        this.assertCanViewSourceCode(
            user,
            project.organizationUuid,
            projectUuid,
        );
        return this.projectCiStatusModel.findByProjectUuid(projectUuid);
    }

    /**
     * Return the project's preview-deploy CI status, scanning the connected repo
     * via the GitHub API (no sandbox) when it hasn't been determined yet.
     *
     * This lets the assistant answer "is preview-deploy CI set up?" by looking
     * at the git-backed project on demand, rather than only learning the answer
     * as a side effect of a full writeback run. A project already recorded as
     * configured is not re-scanned. Best-effort: returns the last known status
     * (or null) when the project isn't GitHub-backed, the GitHub App isn't
     * installed, or the scan fails.
     */
    async getOrScanProjectCiStatus(
        user: SessionUser,
        projectUuid: string,
    ): Promise<ProjectCiStatus | null> {
        const project = await this.projectModel.get(projectUuid);
        this.assertCanViewSourceCode(
            user,
            project.organizationUuid,
            projectUuid,
        );

        const existing =
            await this.projectCiStatusModel.findByProjectUuid(projectUuid);
        if (existing?.hasPreviewDeployWorkflow) {
            // Already configured — don't re-scan (matches the writeback path).
            return existing;
        }

        // Automated detection covers the GitHub Actions workflow only.
        if (project.dbtConnection.type !== DbtProjectType.GITHUB) {
            return existing;
        }

        try {
            const { owner, repo } = parseGithubTarget(project.dbtConnection);
            const installationId = await this.resolveInstallationId(
                project.organizationUuid,
            );
            const files = await getRepoWorkflowFiles({
                owner,
                repo,
                installationId,
            });
            const detection = detectPreviewDeployWorkflow(files);
            return await this.projectCiStatusModel.upsert({
                projectUuid,
                hasPreviewDeployWorkflow: detection.hasPreviewDeployWorkflow,
                workflowPath: detection.workflowPath,
                detectedCommitSha: null,
            });
        } catch (error) {
            this.logger.warn(
                `PreviewDeploySetup: on-demand preview-deploy scan failed — returning last known status: ${getErrorMessage(
                    error,
                )}`,
            );
            return existing;
        }
    }

    /**
     * Open a dedicated pull request that adds the Lightdash preview-deploy
     * GitHub Actions workflow. The workflow files are generated deterministically
     * and committed straight through the GitHub API — no sandbox, no sub-agent —
     * so this is fast and produces identical output every time. Returns the PR
     * URL plus the secrets the user must add for the workflow to run, with the
     * values Lightdash can pre-fill already populated.
     */
    async setupPreviewDeploy(args: {
        user: SessionUser;
        projectUuid: string;
    }): Promise<PreviewDeploySetupResult> {
        const { user, projectUuid } = args;
        const project = await this.projectModel.get(projectUuid);

        // Writeback-style gate: opens a PR from a fresh feature branch, so
        // `isProtectedBranch: false` mirrors the other PR-creating paths.
        const canSetup = this.createAuditedAbility(user).can(
            'manage',
            subject('SourceCode', {
                organizationUuid: project.organizationUuid,
                projectUuid,
                isProtectedBranch: false,
            }),
        );
        if (!canSetup) {
            throw new ForbiddenError();
        }

        const { owner, repo, projectSubPath } = parseGithubTarget(
            project.dbtConnection,
        );
        const installationId = await this.resolveInstallationId(
            project.organizationUuid,
        );

        const files = generatePreviewDeployWorkflowFiles({
            projectSubPath,
            // Pin the CLI to this instance's own version — Lightdash packages
            // release in lockstep, so it's the matching, self-updating pin.
            cliVersion: VERSION,
        });

        const baseBranch = await getRepoDefaultBranch({
            owner,
            repo,
            installationId,
        });
        const baseOid = await getBranchHeadSha({
            owner,
            repo,
            branch: baseBranch,
            installationId,
        });
        const branch = `lightdash-preview-deploy/${randomUUID()}`;
        await createBranch({
            owner,
            repo,
            sha: baseOid,
            branch,
            installationId,
        });

        // Commit via the API so the commit is signed/verified and authored by
        // the Lightdash GitHub App; the triggering user is credited as a
        // co-author trailer.
        await createSignedCommitOnBranch({
            owner,
            repo,
            branch,
            expectedHeadOid: baseOid,
            headline: COMMIT_HEADLINE,
            body: buildCommitBody(user),
            fileChanges: {
                additions: files.map((file) => ({
                    path: file.path,
                    contents: Buffer.from(file.content, 'utf-8').toString(
                        'base64',
                    ),
                })),
                deletions: [],
            },
            installationId,
        });

        const pr = await createPullRequest({
            owner,
            repo,
            title: PR_TITLE,
            body: PR_BODY,
            head: branch,
            base: baseBranch,
            installationId,
        });

        // Record the PR in the project's "Pull requests" view. findOrCreate
        // dedupes if the same PR is somehow recorded twice.
        await this.pullRequestsModel.findOrCreate({
            organizationUuid: project.organizationUuid,
            projectUuid,
            createdByUserUuid: user.userUuid,
            provider: PullRequestProvider.GITHUB,
            source: PullRequestSource.AI_AGENT,
            owner,
            repo,
            prNumber: pr.number,
            prUrl: pr.html_url,
        });

        this.logger.info('Preview-deploy setup PR opened', {
            event: 'preview_deploy_setup.pr_opened',
            projectUuid,
            prUrl: pr.html_url,
        });

        return {
            prUrl: pr.html_url,
            projectName: project.name,
            repository: `${owner}/${repo}`,
            // Pre-fill the secrets we know server-side (instance URL + project
            // UUID) so the caller can surface concrete values.
            secrets: getPreviewDeploySecrets({
                projectUuid,
                siteUrl: this.lightdashConfig.siteUrl,
            }),
        };
    }
}
