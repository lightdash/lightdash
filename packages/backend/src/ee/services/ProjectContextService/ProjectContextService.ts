import { subject } from '@casl/ability';
import {
    applyProjectContextWriteback,
    DbtProjectType,
    ForbiddenError,
    loadProjectContextFile,
    NotFoundError,
    type AiAgentJudgeProjectContextEntry,
    type DbtProjectConfig,
    type SessionUser,
} from '@lightdash/common';
import {
    createBranch,
    createPullRequest,
    createSignedCommitOnBranch,
    getFileContent,
    getInstallationToken,
    getLastCommit,
} from '../../../clients/github/Github';
import type { GithubAppInstallationsModel } from '../../../models/GithubAppInstallations/GithubAppInstallationsModel';
import type { ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import { BaseService } from '../../../services/BaseService';
import type { ProjectContextModel } from '../../models/ProjectContextModel';

// The living document is a sibling of lightdash.config.yml inside the dbt
// project directory, so it travels with the project's other Lightdash metadata.
const PROJECT_CONTEXT_FILE_NAME = 'lightdash.project_context.yml';

// Resolve the repo-relative path for the GitHub contents API: strip a leading
// "./" or "/" and a trailing slash from project_sub_path, then prefix the file
// name. project_sub_path "/" (repo root) yields the bare file name.
export const projectContextFilePath = (projectSubPath: string): string => {
    const trimmed = projectSubPath
        .trim()
        .replace(/^\.?\/+/, '')
        .replace(/\/+$/, '');
    return trimmed === ''
        ? PROJECT_CONTEXT_FILE_NAME
        : `${trimmed}/${PROJECT_CONTEXT_FILE_NAME}`;
};

export type ProjectContextIngestResult =
    | { ingested: true; entryCount: number }
    | { ingested: false; reason: string };

export type ProjectContextWritebackResult = {
    prUrl: string;
    prNumber: number;
    owner: string;
    repo: string;
    op: 'create' | 'update';
    entryId: string;
};

type GithubAccess = {
    owner: string;
    repo: string;
    branch: string;
    projectSubPath: string;
    installationId: string;
    token: string;
};

type ProjectContextServiceDeps = {
    projectModel: ProjectModel;
    githubAppInstallationsModel: GithubAppInstallationsModel;
    projectContextModel: ProjectContextModel;
};

export class ProjectContextService extends BaseService {
    private readonly projectModel: ProjectModel;

    private readonly githubAppInstallationsModel: GithubAppInstallationsModel;

    private readonly projectContextModel: ProjectContextModel;

    constructor(deps: ProjectContextServiceDeps) {
        super();
        this.projectModel = deps.projectModel;
        this.githubAppInstallationsModel = deps.githubAppInstallationsModel;
        this.projectContextModel = deps.projectContextModel;
    }

    private static resolveGithubConnection(connection: DbtProjectConfig): {
        owner: string;
        repo: string;
        branch: string;
        projectSubPath: string;
    } | null {
        if (connection.type !== DbtProjectType.GITHUB) {
            return null;
        }
        const [owner, repo] = connection.repository.split('/');
        if (!owner || !repo) {
            return null;
        }
        return {
            owner,
            repo,
            branch: connection.branch,
            projectSubPath: connection.project_sub_path,
        };
    }

    // Resolves the project's GitHub repo + an installation token, or null when
    // the project isn't GitHub-backed / the org hasn't installed the app.
    private async resolveGithubAccess(
        projectUuid: string,
    ): Promise<GithubAccess | null> {
        const project = await this.projectModel.get(projectUuid);
        const connection = ProjectContextService.resolveGithubConnection(
            project.dbtConnection,
        );
        if (!connection) {
            return null;
        }
        const installationId =
            await this.githubAppInstallationsModel.findInstallationId(
                project.organizationUuid,
            );
        if (!installationId) {
            return null;
        }
        const token = await getInstallationToken(installationId);
        return { ...connection, installationId, token };
    }

    private async assertCanIngestProjectContext(
        user: SessionUser,
        projectUuid: string,
    ): Promise<void> {
        const { organizationUuid, type } =
            await this.projectModel.getSummary(projectUuid);
        const auditedAbility = this.createAuditedAbility(user);

        if (
            auditedAbility.cannot(
                'manage',
                subject('CompileProject', {
                    organizationUuid,
                    projectUuid,
                    type,
                }),
            )
        ) {
            throw new ForbiddenError();
        }
    }

    /**
     * Fetch lightdash.project_context.yml from the project's GitHub repo, parse
     * it, and replace the cached entries. Degrades to a no-op (never throws) when
     * the project isn't GitHub-backed or the org hasn't installed the GitHub App.
     * A missing file clears the cache (the file is the source of truth); a
     * transient GitHub error or a parse error is surfaced without wiping entries.
     */
    async ingestProjectContext(
        user: SessionUser,
        projectUuid: string,
    ): Promise<ProjectContextIngestResult> {
        await this.assertCanIngestProjectContext(user, projectUuid);

        const access = await this.resolveGithubAccess(projectUuid);
        if (!access) {
            return { ingested: false, reason: 'no_github_access' };
        }
        const fileName = projectContextFilePath(access.projectSubPath);

        let content: string;
        try {
            ({ content } = await getFileContent({
                fileName,
                owner: access.owner,
                repo: access.repo,
                branch: access.branch,
                installationId: access.installationId,
                token: access.token,
            }));
        } catch (error) {
            if (error instanceof NotFoundError) {
                // File removed (or never added): clear the cache.
                await this.projectContextModel.replaceEntriesForProject(
                    projectUuid,
                    [],
                );
                return { ingested: true, entryCount: 0 };
            }
            throw error;
        }

        const entries = loadProjectContextFile(content);
        await this.projectContextModel.replaceEntriesForProject(
            projectUuid,
            entries,
        );
        return { ingested: true, entryCount: entries.length };
    }

    /**
     * Deterministic GitHub-API writeback for a judge-emitted project_context
     * entry: fetch the current file, apply the entry by id, and open a PR on a
     * fresh branch. No sandbox (distinct from the semantic_layer strategy).
     * `branchTimestamp` keys the PR branch name (caller supplies it so the
     * method stays free of wall-clock reads).
     */
    async writebackEntry(args: {
        projectUuid: string;
        entry: AiAgentJudgeProjectContextEntry;
        branchTimestamp: number;
        // The agent thread that motivated this entry, linked from the PR body
        // so a reviewer can trace it back. Null when the source is unknown.
        sourceThread: {
            threadUrl: string;
            promptUuid: string;
            threadUuid: string;
        } | null;
    }): Promise<ProjectContextWritebackResult> {
        const access = await this.resolveGithubAccess(args.projectUuid);
        if (!access) {
            throw new NotFoundError(
                'Project is not connected to GitHub or the GitHub App is not installed',
            );
        }
        const { owner, repo, branch, installationId, token } = access;
        const fileName = projectContextFilePath(access.projectSubPath);

        let existingContent = '';
        try {
            const file = await getFileContent({
                fileName,
                owner,
                repo,
                branch,
                installationId,
                token,
            });
            existingContent = file.content;
        } catch (error) {
            if (!(error instanceof NotFoundError)) {
                throw error;
            }
        }

        const {
            content: serialized,
            entryId,
            op,
        } = applyProjectContextWriteback(existingContent, args.entry);

        const lastCommit = await getLastCommit({
            owner,
            repo,
            branch,
            installationId,
            token,
        });
        const headBranch = `lightdash-project-context/${entryId}-${args.branchTimestamp}`;
        await createBranch({
            owner,
            repo,
            sha: lastCommit.sha,
            branch: headBranch,
            installationId,
            token,
        });

        const commitMessage = `${
            op === 'create' ? 'Add' : 'Update'
        } project context: ${entryId}`;
        // Reuse the writeback infra's signed-commit helper (GitHub GraphQL
        // createCommitOnBranch) so the commit is server-side "Verified", like
        // the semantic_layer writeback — a single addition overwrites the file
        // whether it already exists or not.
        await createSignedCommitOnBranch({
            owner,
            repo,
            branch: headBranch,
            expectedHeadOid: lastCommit.sha,
            headline: commitMessage,
            body: '',
            fileChanges: {
                additions: [
                    {
                        path: fileName,
                        contents: Buffer.from(serialized, 'utf-8').toString(
                            'base64',
                        ),
                    },
                ],
                deletions: [],
            },
            installationId,
            token,
        });

        const bodyLines = [
            `This PR ${
                op === 'create' ? 'adds a new' : 'updates an'
            } project context entry from an AI agent review finding.`,
            `- id: \`${entryId}\``,
            `- kind: \`${args.entry.kind}\``,
            '',
            args.entry.content,
        ];
        if (args.sourceThread) {
            bodyLines.push(
                '',
                '---',
                `[View the agent thread that motivated this entry](${args.sourceThread.threadUrl}) (prompt \`${args.sourceThread.promptUuid}\`).`,
            );
        }

        const pr = await createPullRequest({
            owner,
            repo,
            title: commitMessage,
            body: bodyLines.join('\n'),
            head: headBranch,
            base: branch,
            installationId,
            token,
        });

        return {
            prUrl: pr.html_url,
            prNumber: pr.number,
            owner,
            repo,
            op,
            entryId,
        };
    }
}
