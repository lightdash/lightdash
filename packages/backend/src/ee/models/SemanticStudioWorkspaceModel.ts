import {
    type SemanticStudioWorkspace,
    type SemanticStudioWorkspacePullRequestState,
} from '@lightdash/common';
import { Knex } from 'knex';
import { UserTableName } from '../../database/entities/users';
import {
    AiThreadTableName,
    AiWebAppThreadTableName,
    AiWritebackRunTableName,
} from '../database/entities/ai';
import {
    SemanticStudioWorkspacesTableName,
    type DbSemanticStudioWorkspace,
} from '../database/entities/semanticStudioWorkspaces';

type WorkspaceRow = DbSemanticStudioWorkspace & {
    agent_uuid: string | null;
    first_name: string | null;
    last_name: string | null;
    latest_pr_url: string | null;
};

export type StudioThread = {
    organizationUuid: string;
    agentUuid: string | null;
};

type Owner = { projectUuid: string; userUuid: string };

const latestPullRequestUrl = (workspaceAlias: string) =>
    `(SELECT r.pr_url FROM ${AiWritebackRunTableName} r WHERE r.ai_thread_uuid = ${workspaceAlias}.ai_thread_uuid AND r.pr_url IS NOT NULL ORDER BY r.created_at DESC LIMIT 1)`;

// Two switches at once would otherwise both pass the deactivate step and trip the one-active index.
const lockOwner = (trx: Knex.Transaction, { projectUuid, userUuid }: Owner) =>
    trx.raw('SELECT pg_advisory_xact_lock(hashtextextended(?, 0))', [
        `semantic-studio-workspace:${projectUuid}:${userUuid}`,
    ]);

const toWorkspace = (
    row: WorkspaceRow,
    viewerUuid: string,
): SemanticStudioWorkspace => {
    const url = row.latest_pr_url ?? row.pull_request_url;
    return {
        workspaceUuid: row.semantic_studio_workspace_uuid,
        projectUuid: row.project_uuid,
        name: row.name,
        threadUuid: row.ai_thread_uuid,
        agentUuid: row.agent_uuid,
        owner: {
            userUuid: row.created_by_user_uuid ?? '',
            name:
                [row.first_name, row.last_name].filter(Boolean).join(' ') ||
                'Someone',
        },
        isMine: row.created_by_user_uuid === viewerUuid,
        isActive: row.is_active,
        pullRequest: url
            ? {
                  url,
                  // A state checked for an older pull request says nothing about this one.
                  state:
                      url === row.pull_request_url
                          ? row.pull_request_state
                          : null,
              }
            : null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        finishedAt: row.finished_at,
    };
};

export class SemanticStudioWorkspaceModel {
    private readonly database: Knex;

    constructor({ database }: { database: Knex }) {
        this.database = database;
    }

    private select(trx: Knex = this.database) {
        return trx(`${SemanticStudioWorkspacesTableName} as w`)
            .leftJoin(
                `${AiThreadTableName} as t`,
                't.ai_thread_uuid',
                'w.ai_thread_uuid',
            )
            .leftJoin(
                `${UserTableName} as u`,
                'u.user_uuid',
                'w.created_by_user_uuid',
            )
            .select<WorkspaceRow[]>(
                'w.*',
                't.agent_uuid',
                'u.first_name',
                'u.last_name',
                trx.raw(`${latestPullRequestUrl('w')} AS latest_pr_url`),
            );
    }

    /** A Studio conversation of this person in this project, or null when it is not one. */
    async findStudioThread(
        { projectUuid, userUuid }: Owner,
        threadUuid: string,
    ): Promise<StudioThread | null> {
        const row = await this.database(`${AiThreadTableName} as t`)
            .join(
                `${AiWebAppThreadTableName} as wt`,
                'wt.ai_thread_uuid',
                't.ai_thread_uuid',
            )
            .where('t.ai_thread_uuid', threadUuid)
            .andWhere('t.project_uuid', projectUuid)
            .andWhere('t.created_from', 'semantic_studio')
            .andWhere('wt.user_uuid', userUuid)
            .first('t.organization_uuid', 't.agent_uuid');
        return row
            ? {
                  organizationUuid: row.organization_uuid,
                  agentUuid: row.agent_uuid,
              }
            : null;
    }

    async findInProject(
        projectUuid: string,
        viewerUuid: string,
    ): Promise<SemanticStudioWorkspace[]> {
        const rows = await this.select()
            .where('w.project_uuid', projectUuid)
            .orderBy('w.updated_at', 'desc');
        return rows.map((row) => toWorkspace(row, viewerUuid));
    }

    async find(
        workspaceUuid: string,
        viewerUuid: string,
    ): Promise<SemanticStudioWorkspace | null> {
        const row = await this.select()
            .where('w.semantic_studio_workspace_uuid', workspaceUuid)
            .first();
        return row ? toWorkspace(row, viewerUuid) : null;
    }

    async findActive({
        projectUuid,
        userUuid,
    }: Owner): Promise<SemanticStudioWorkspace | null> {
        const row = await this.select()
            .where('w.project_uuid', projectUuid)
            .andWhere('w.created_by_user_uuid', userUuid)
            .andWhere('w.is_active', true)
            .first();
        return row ? toWorkspace(row, userUuid) : null;
    }

    /** Makes the conversation's workspace the person's active one, starting it when it has none. */
    async start(
        owner: Owner,
        thread: StudioThread & { threadUuid: string; name: string },
    ): Promise<string> {
        return this.database.transaction(async (trx) => {
            await lockOwner(trx, owner);
            await trx(SemanticStudioWorkspacesTableName)
                .where({
                    project_uuid: owner.projectUuid,
                    created_by_user_uuid: owner.userUuid,
                    is_active: true,
                })
                .whereNot('ai_thread_uuid', thread.threadUuid)
                .update({ is_active: false, updated_at: trx.fn.now() });
            const [row] = await trx(SemanticStudioWorkspacesTableName)
                .insert({
                    organization_uuid: thread.organizationUuid,
                    project_uuid: owner.projectUuid,
                    created_by_user_uuid: owner.userUuid,
                    ai_thread_uuid: thread.threadUuid,
                    name: thread.name,
                    is_active: true,
                })
                // Asking for more in a finished workspace's conversation picks it back up.
                .onConflict('ai_thread_uuid')
                .merge({
                    is_active: true,
                    finished_at: null,
                    updated_at: trx.fn.now(),
                })
                .returning('semantic_studio_workspace_uuid');
            return row.semantic_studio_workspace_uuid;
        });
    }

    async activate(owner: Owner, workspaceUuid: string): Promise<void> {
        await this.database.transaction(async (trx) => {
            await lockOwner(trx, owner);
            await trx(SemanticStudioWorkspacesTableName)
                .where({
                    project_uuid: owner.projectUuid,
                    created_by_user_uuid: owner.userUuid,
                    is_active: true,
                })
                .update({ is_active: false, updated_at: trx.fn.now() });
            await trx(SemanticStudioWorkspacesTableName)
                .where({
                    semantic_studio_workspace_uuid: workspaceUuid,
                    project_uuid: owner.projectUuid,
                    created_by_user_uuid: owner.userUuid,
                })
                .update({ is_active: true, updated_at: trx.fn.now() });
        });
    }

    async leave({ projectUuid, userUuid }: Owner): Promise<void> {
        await this.database(SemanticStudioWorkspacesTableName)
            .where({
                project_uuid: projectUuid,
                created_by_user_uuid: userUuid,
                is_active: true,
            })
            .update({ is_active: false, updated_at: this.database.fn.now() });
    }

    async rename(
        owner: Owner,
        workspaceUuid: string,
        name: string,
    ): Promise<number> {
        return this.database(SemanticStudioWorkspacesTableName)
            .where({
                semantic_studio_workspace_uuid: workspaceUuid,
                project_uuid: owner.projectUuid,
                created_by_user_uuid: owner.userUuid,
            })
            .update({ name, updated_at: this.database.fn.now() });
    }

    /** Ends a workspace: it leaves the person's list and stays as history. */
    async finish(owner: Owner, workspaceUuid: string | null): Promise<number> {
        return this.database(SemanticStudioWorkspacesTableName)
            .where({
                project_uuid: owner.projectUuid,
                created_by_user_uuid: owner.userUuid,
            })
            .andWhere(
                workspaceUuid
                    ? { semantic_studio_workspace_uuid: workspaceUuid }
                    : { is_active: true },
            )
            .update({
                is_active: false,
                finished_at: this.database.fn.now(),
                updated_at: this.database.fn.now(),
            });
    }

    /** Points the person's active workspace at a pull request its draft was sent as. */
    async attachPullRequest(owner: Owner, url: string): Promise<void> {
        await this.database(SemanticStudioWorkspacesTableName)
            .where({
                project_uuid: owner.projectUuid,
                created_by_user_uuid: owner.userUuid,
                is_active: true,
            })
            .update({
                pull_request_url: url,
                pull_request_state: 'open',
                updated_at: this.database.fn.now(),
            });
    }

    /** Records what a workspace's current pull request's provider said about it; a merge finishes the workspace. */
    async recordPullRequestState(
        projectUuid: string,
        url: string,
        state: SemanticStudioWorkspacePullRequestState,
    ): Promise<void> {
        const now = this.database.fn.now();
        await this.database(SemanticStudioWorkspacesTableName)
            .where('project_uuid', projectUuid)
            // An older pull request of the same conversation must not finish the one in review now.
            .andWhereRaw(
                `? = COALESCE(${latestPullRequestUrl(SemanticStudioWorkspacesTableName)}, pull_request_url)`,
                [url],
            )
            .whereNull('finished_at')
            .update({
                pull_request_url: url,
                pull_request_state: state,
                updated_at: now,
                ...(state === 'merged'
                    ? { is_active: false, finished_at: now }
                    : {}),
            });
    }
}
