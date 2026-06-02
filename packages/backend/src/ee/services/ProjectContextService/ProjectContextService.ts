import { subject } from '@casl/ability';
import {
    DbtProjectType,
    ForbiddenError,
    loadProjectContextFile,
    NotFoundError,
    type DbtProjectConfig,
    type SessionUser,
} from '@lightdash/common';
import {
    getFileContent,
    getInstallationToken,
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
}
