import {
    NotFoundError,
    type SemanticStudioWorkspace,
    type SemanticStudioWorkspacePullRequestState,
    type StudioChangeSummary,
} from '@lightdash/common';
import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';
import { UserTableName } from '../../database/entities/users';
import {
    AiThreadTableName,
    AiWebAppThreadTableName,
    AiWritebackRunTableName,
} from '../database/entities/ai';
import {
    SemanticStudioBranchCompilesTableName,
    type DbSemanticStudioBranchCompile,
} from '../database/entities/semanticStudioBranchCompiles';
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
    title: string | null;
};

type Owner = { projectUuid: string; userUuid: string };

const latestPullRequestUrl = (workspaceAlias: string) =>
    `(SELECT r.pr_url FROM ${AiWritebackRunTableName} r WHERE r.ai_thread_uuid = ${workspaceAlias}.ai_thread_uuid AND r.pr_url IS NOT NULL ORDER BY r.created_at DESC LIMIT 1)`;

// Two switches at once would otherwise both pass the deactivate step and trip the one-active index.
export const lockStudioWorkspaceOwner = (
    trx: Knex.Transaction,
    { projectUuid, userUuid }: Owner,
) =>
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
            .first('t.organization_uuid', 't.agent_uuid', 't.title');
        return row
            ? {
                  organizationUuid: row.organization_uuid,
                  agentUuid: row.agent_uuid,
                  title: row.title,
              }
            : null;
    }

    async listChanges({ projectUuid, userUuid }: Owner) {
        return this.database(`${SemanticStudioWorkspacesTableName} as w`)
            .where({
                'w.project_uuid': projectUuid,
                'w.created_by_user_uuid': userUuid,
            })
            .whereNull('w.finished_at')
            .orderBy('w.updated_at', 'desc')
            .select<StudioChangeSummary[]>(
                'w.name',
                'w.is_active as isCheckedOut',
                this.database
                    .raw(`ARRAY(SELECT DISTINCT m->>'name' FROM project_model_draft_changes d
                    CROSS JOIN LATERAL jsonb_array_elements(d.models::jsonb) m
                    WHERE d.workspace_uuid = w.semantic_studio_workspace_uuid AND d.status <> 'discarded'
                    AND d.created_by_user_uuid = w.created_by_user_uuid AND d.project_uuid = w.project_uuid
                    ORDER BY 1) AS models`),
            );
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

    async create(
        owner: Owner,
        organizationUuid: string,
        name: string,
    ): Promise<string> {
        return this.database.transaction(async (trx) => {
            await lockStudioWorkspaceOwner(trx, owner);
            await trx(SemanticStudioWorkspacesTableName)
                .where({
                    project_uuid: owner.projectUuid,
                    created_by_user_uuid: owner.userUuid,
                    is_active: true,
                })
                .update({ is_active: false });
            const [row] = await trx(SemanticStudioWorkspacesTableName)
                .insert({
                    project_uuid: owner.projectUuid,
                    created_by_user_uuid: owner.userUuid,
                    organization_uuid: organizationUuid,
                    name,
                    ai_thread_uuid: null,
                    is_active: true,
                })
                .returning('semantic_studio_workspace_uuid');
            return row.semantic_studio_workspace_uuid;
        });
    }

    async start(
        owner: Owner,
        thread: StudioThread & { threadUuid: string; name: string },
    ): Promise<string> {
        return this.database.transaction(async (trx) => {
            await lockStudioWorkspaceOwner(trx, owner);
            const independent = await trx(SemanticStudioWorkspacesTableName)
                .where({
                    project_uuid: owner.projectUuid,
                    created_by_user_uuid: owner.userUuid,
                    is_active: true,
                })
                .whereNull('ai_thread_uuid')
                .first();
            if (independent) return independent.semantic_studio_workspace_uuid;
            await trx(SemanticStudioWorkspacesTableName)
                .where({
                    project_uuid: owner.projectUuid,
                    created_by_user_uuid: owner.userUuid,
                    is_active: true,
                })
                .whereRaw('ai_thread_uuid IS DISTINCT FROM ?', [
                    thread.threadUuid,
                ])
                .update({ is_active: false });
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

    /** Switching changes is not an update to either, so it leaves updated_at alone. */
    async activate(owner: Owner, workspaceUuid: string): Promise<void> {
        await this.database.transaction(async (trx) => {
            await lockStudioWorkspaceOwner(trx, owner);
            const target = await trx(SemanticStudioWorkspacesTableName)
                .where({
                    semantic_studio_workspace_uuid: workspaceUuid,
                    project_uuid: owner.projectUuid,
                    created_by_user_uuid: owner.userUuid,
                })
                .whereNull('finished_at')
                .forUpdate()
                .first();
            if (!target) throw new NotFoundError('No open change matches');
            await trx(SemanticStudioWorkspacesTableName)
                .where({
                    project_uuid: owner.projectUuid,
                    created_by_user_uuid: owner.userUuid,
                    is_active: true,
                })
                .update({ is_active: false });
            await trx(SemanticStudioWorkspacesTableName)
                .where({
                    semantic_studio_workspace_uuid: workspaceUuid,
                    project_uuid: owner.projectUuid,
                    created_by_user_uuid: owner.userUuid,
                })
                .update({ is_active: true });
        });
    }

    async leave({ projectUuid, userUuid }: Owner): Promise<void> {
        await this.database.transaction(async (trx) => {
            await lockStudioWorkspaceOwner(trx, { projectUuid, userUuid });
            await trx(SemanticStudioWorkspacesTableName)
                .where({
                    project_uuid: projectUuid,
                    created_by_user_uuid: userUuid,
                    is_active: true,
                })
                .update({ is_active: false });
        });
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
            .update({ name });
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
    async attachPullRequest(
        owner: Owner & { workspaceUuid: string | null },
        url: string,
    ): Promise<void> {
        if (owner.workspaceUuid === null) return;
        await this.database(SemanticStudioWorkspacesTableName)
            .where({
                project_uuid: owner.projectUuid,
                created_by_user_uuid: owner.userUuid,
                semantic_studio_workspace_uuid: owner.workspaceUuid,
            })
            .update({
                pull_request_url: url,
                pull_request_state: 'open',
                updated_at: this.database.fn.now(),
            });
    }

    /** Points a person's conversation at the pull request a hand save opened for it. */
    async attachThreadPullRequest(
        owner: Owner,
        aiThreadUuid: string,
        url: string,
    ): Promise<void> {
        await this.database(SemanticStudioWorkspacesTableName)
            .where({
                project_uuid: owner.projectUuid,
                created_by_user_uuid: owner.userUuid,
                ai_thread_uuid: aiThreadUuid,
            })
            .whereNull('finished_at')
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
            // Open checks only update new state; terminal states also finish older unfinished records.
            .andWhereRaw(
                "(pull_request_url IS DISTINCT FROM ? OR pull_request_state IS DISTINCT FROM ? OR ? <> 'open')",
                [url, state, state],
            )
            .update({
                pull_request_url: url,
                pull_request_state: state,
                updated_at: now,
                ...(state !== 'open'
                    ? { is_active: false, finished_at: now }
                    : {}),
            });
    }

    /** Asks for a new compile of a change's branch; returns the request a compile must still match to be kept. */
    async requestBranchCompile(workspaceUuid: string): Promise<string> {
        const compileRequestUuid = uuidv4();
        await this.database(SemanticStudioBranchCompilesTableName)
            .insert({
                semantic_studio_workspace_uuid: workspaceUuid,
                compile_request_uuid: compileRequestUuid,
                status: 'compiling',
            })
            .onConflict('semantic_studio_workspace_uuid')
            .merge({
                compile_request_uuid: compileRequestUuid,
                status: 'compiling',
                error: null,
                requested_at: this.database.fn.now(),
            });
        return compileRequestUuid;
    }

    /** Records a compile's outcome, unless a newer one was asked for since; a failure keeps the last good explores. */
    async finishBranchCompile(
        workspaceUuid: string,
        compileRequestUuid: string,
        outcome:
            | {
                  status: 'ready';
                  branch: string;
                  explores: DbSemanticStudioBranchCompile['explores'];
              }
            | { status: 'failed'; branch: string | null; error: string },
    ): Promise<boolean> {
        const updated = await this.database(
            SemanticStudioBranchCompilesTableName,
        )
            .where({
                semantic_studio_workspace_uuid: workspaceUuid,
                compile_request_uuid: compileRequestUuid,
            })
            .update(
                outcome.status === 'ready'
                    ? {
                          status: 'ready',
                          branch: outcome.branch,
                          error: null,
                          explores: JSON.stringify(outcome.explores),
                          compiled_at: this.database.fn.now(),
                      }
                    : {
                          status: 'failed',
                          branch: outcome.branch,
                          error: outcome.error,
                      },
            );
        return updated > 0;
    }

    /** Drops the compiles of a project's finished changes; nothing reads them again. */
    async deleteFinishedBranchCompiles(projectUuid: string): Promise<void> {
        await this.database(SemanticStudioBranchCompilesTableName)
            .whereIn(
                'semantic_studio_workspace_uuid',
                this.database(SemanticStudioWorkspacesTableName)
                    .select('semantic_studio_workspace_uuid')
                    .where('project_uuid', projectUuid)
                    .whereNotNull('finished_at'),
            )
            .delete();
    }

    async findBranchCompile(
        workspaceUuid: string,
    ): Promise<DbSemanticStudioBranchCompile | null> {
        const row = await this.database(SemanticStudioBranchCompilesTableName)
            .where('semantic_studio_workspace_uuid', workspaceUuid)
            .first();
        return row ?? null;
    }
}
