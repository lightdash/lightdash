import {
    DbtProjectType,
    NotFoundError,
    ParameterError,
    ParseError,
    type Project,
    type SemanticLayerDraftItemResult,
} from '@lightdash/common';
import { randomBytes } from 'node:crypto';
import { parseDocument } from 'yaml';
import {
    createBranch,
    createPullRequest,
    createSignedCommitOnBranch,
    getFileContent,
    getInstallationToken,
    getLastCommit,
    getRepoTree,
} from '../../../clients/github/Github';
import { type GithubAppInstallationsModel } from '../../../models/GithubAppInstallations/GithubAppInstallationsModel';

/** The repository a project's native models live in. */
export type RepoConnection = {
    owner: string;
    repo: string;
    branch: string;
    /** No leading or trailing slash; empty for the repository root. */
    projectSubPath: string;
};

/** A repository's native models as of one commit. */
export type RepoModels = {
    connection: RepoConnection;
    /** The commit they were read at, which a pull request branches from. */
    baseSha: string;
    documents: { name: string; content: string }[];
    /** Where each model's file is in the repository, by model name. */
    paths: Map<string, string>;
    /** Where a new model's file goes. */
    modelsDirectory: string;
};

type GithubAccess = { installationId: string; token: string };

const MODEL_TYPES = new Set(['model', 'model/v1beta', 'model/v1']);
// The same two places, in the same order, that a native project is loaded from.
const MODEL_DIRECTORIES = ['models', 'lightdash/models'];
const YAML_FILE = /\.ya?ml$/;
// ponytail: every file is one API call the first time a commit is read; read the tree's blobs in one request if a repo outgrows this.
const MAX_MODEL_FILES = 500;
const READ_CONCURRENCY = 10;
const MAX_KEPT_COMMITS = 4;

const joinPath = (...parts: string[]) => parts.filter(Boolean).join('/');

/** The repository connection of a project that keeps native models in GitHub, or null for any other project. */
export const resolveRepoConnection = (
    dbtConnection: Project['dbtConnection'],
): RepoConnection | null => {
    if (
        dbtConnection.type !== DbtProjectType.GITHUB ||
        dbtConnection.semanticLayer !== 'lightdash'
    ) {
        return null;
    }
    const [owner, repo] = dbtConnection.repository.split('/');
    if (!owner || !repo) return null;
    return {
        owner,
        repo,
        branch: dbtConnection.branch,
        projectSubPath: dbtConnection.project_sub_path.replace(
            /^\/+|\/+$/g,
            '',
        ),
    };
};

/** The title and body of the pull request that carries a draft: one line per model, then what changes on it. */
export const describePullRequest = (
    results: SemanticLayerDraftItemResult[],
): { title: string; body: string } => {
    const changesByModel = new Map<string, Set<string>>();
    results
        .filter(({ status }) => status === 'ready')
        .forEach(({ model, changes }) => {
            const lines = changesByModel.get(model) ?? new Set<string>();
            changes.forEach(({ action, path }) =>
                lines.add(`  - ${action} \`${path}\``),
            );
            changesByModel.set(model, lines);
        });
    const names = [...changesByModel.keys()];
    return {
        title: `Update semantic layer: ${names.slice(0, 3).join(', ')}${
            names.length > 3 ? ` and ${names.length - 3} more` : ''
        }`,
        body: [...changesByModel]
            .map(([model, lines]) => [`- \`${model}\``, ...lines].join('\n'))
            .join('\n'),
    };
};

/** The name of a native model file, or null when the file is something else. */
const readModelName = (content: string): string | null => {
    const parsed: unknown = parseDocument(content).toJS();
    if (
        typeof parsed !== 'object' ||
        parsed === null ||
        !('type' in parsed) ||
        !('name' in parsed)
    ) {
        return null;
    }
    const { type, name } = parsed;
    return typeof type === 'string' &&
        MODEL_TYPES.has(type) &&
        typeof name === 'string'
        ? name
        : null;
};

/** Reads a project's native models from its repository, and sends changes back as a pull request. */
export class RepoModelSource {
    private readonly githubAppInstallationsModel: Pick<
        GithubAppInstallationsModel,
        'findInstallationId'
    >;

    private readonly commits = new Map<string, Promise<RepoModels>>();

    constructor(args: {
        githubAppInstallationsModel: Pick<
            GithubAppInstallationsModel,
            'findInstallationId'
        >;
    }) {
        this.githubAppInstallationsModel = args.githubAppInstallationsModel;
    }

    /** Whether the organization has the GitHub App installed, without which nothing can be read or sent back. */
    async isInstalled(organizationUuid: string): Promise<boolean> {
        return (
            (await this.githubAppInstallationsModel.findInstallationId(
                organizationUuid,
            )) !== undefined
        );
    }

    private async getAccess(organizationUuid: string): Promise<GithubAccess> {
        const installationId =
            await this.githubAppInstallationsModel.findInstallationId(
                organizationUuid,
            );
        if (!installationId) {
            throw new NotFoundError('The GitHub App is not installed');
        }
        return {
            installationId,
            token: await getInstallationToken(installationId),
        };
    }

    /** The repository's models at the head of the project's branch; one commit is read once. */
    async load(
        organizationUuid: string,
        connection: RepoConnection,
    ): Promise<RepoModels> {
        const access = await this.getAccess(organizationUuid);
        const { sha } = await getLastCommit({ ...connection, ...access });
        const key = [
            connection.owner,
            connection.repo,
            connection.projectSubPath,
            sha,
        ].join('|');
        const kept = this.commits.get(key);
        const models = kept ?? RepoModelSource.read(connection, access, sha);
        // Set again so the entry counts as the most recently used.
        this.commits.delete(key);
        this.commits.set(key, models);
        if (this.commits.size > MAX_KEPT_COMMITS) {
            const [oldest] = this.commits.keys();
            this.commits.delete(oldest);
        }
        models.catch(() => this.commits.delete(key));
        return models;
    }

    private static async read(
        connection: RepoConnection,
        access: GithubAccess,
        sha: string,
    ): Promise<RepoModels> {
        const { files, truncated } = await getRepoTree({
            ...connection,
            ...access,
            branch: sha,
        });
        if (truncated) {
            throw new ParameterError(
                'This repository is too large to read its models from',
            );
        }
        const directories = MODEL_DIRECTORIES.map((directory) =>
            joinPath(connection.projectSubPath, directory),
        );
        const modelsDirectory =
            directories.find((directory) =>
                files.some(({ path }) => path.startsWith(`${directory}/`)),
            ) ?? directories[0];
        const candidates = files
            .map(({ path }) => path)
            .filter(
                (path) =>
                    path.startsWith(`${modelsDirectory}/`) &&
                    YAML_FILE.test(path),
            )
            .sort((a, b) => a.localeCompare(b));
        if (candidates.length > MAX_MODEL_FILES) {
            throw new ParameterError(
                `This repository has more than ${MAX_MODEL_FILES} files under ${modelsDirectory}, too many to read here`,
            );
        }
        const contents: { path: string; content: string }[] = [];
        for (
            let start = 0;
            start < candidates.length;
            start += READ_CONCURRENCY
        ) {
            contents.push(
                // eslint-disable-next-line no-await-in-loop
                ...(await Promise.all(
                    candidates
                        .slice(start, start + READ_CONCURRENCY)
                        .map(async (path) => ({
                            path,
                            content: (
                                await getFileContent({
                                    ...connection,
                                    ...access,
                                    fileName: path,
                                    branch: sha,
                                })
                            ).content,
                        })),
                )),
            );
        }
        const paths = new Map<string, string>();
        const documents = contents.flatMap(({ path, content }) => {
            const name = readModelName(content);
            if (name === null) return [];
            const previous = paths.get(name);
            if (previous !== undefined) {
                throw new ParseError(
                    `Duplicate model "${name}" in ${previous} and ${path}`,
                );
            }
            paths.set(name, path);
            return [{ name, content }];
        });
        return {
            connection,
            baseSha: sha,
            documents,
            paths,
            modelsDirectory,
        };
    }

    /** Sends model changes back as one signed commit on a new branch, and opens a pull request against the project's branch; null content removes a model's file. */
    async openPullRequest({
        organizationUuid,
        models,
        writes,
        title,
        body,
    }: {
        organizationUuid: string;
        models: RepoModels;
        writes: Map<string, string | null>;
        title: string;
        body: string;
    }): Promise<{ url: string }> {
        const { connection, baseSha, paths, modelsDirectory } = models;
        const access = await this.getAccess(organizationUuid);
        const pathOf = (name: string) =>
            paths.get(name) ?? joinPath(modelsDirectory, `${name}.yml`);
        const additions = [...writes].flatMap(([name, content]) =>
            content === null
                ? []
                : [
                      {
                          path: pathOf(name),
                          contents: Buffer.from(content, 'utf-8').toString(
                              'base64',
                          ),
                      },
                  ],
        );
        const deletions = [...writes].flatMap(([name, content]) =>
            content === null && paths.has(name) ? [{ path: pathOf(name) }] : [],
        );
        if (additions.length === 0 && deletions.length === 0) {
            throw new ParameterError(
                'There is nothing to send to the repository',
            );
        }
        const branch = `lightdash-semantic-studio/${randomBytes(4).toString('hex')}`;
        await createBranch({ ...connection, ...access, sha: baseSha, branch });
        await createSignedCommitOnBranch({
            ...connection,
            ...access,
            branch,
            expectedHeadOid: baseSha,
            headline: title,
            body: '',
            fileChanges: { additions, deletions },
        });
        const pullRequest = await createPullRequest({
            ...connection,
            ...access,
            title,
            body,
            head: branch,
            base: connection.branch,
        });
        return { url: pullRequest.html_url };
    }
}
