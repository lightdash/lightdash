import {
    NotFoundError,
    STUDIO_EDITED_IN,
    UNTITLED_WORKSPACE_NAME,
    type SemanticStudioBranchCompile,
    type SemanticStudioWorkspace,
    type SemanticStudioWorkspacePullRequestState,
    type StudioChangeSummary,
} from '@lightdash/common';
import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';
import { ProjectModelDraftChangesTableName } from '../../database/entities/projectModelDraftChanges';
import { UserTableName } from '../../database/entities/users';
import {
    AiPromptTableName,
    AiThreadTableName,
    AiWebAppThreadTableName,
    AiWritebackRunTableName,
    type DbAiPrompt,
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
    published_live: boolean;
};

type StudioThread = {
    organizationUuid: string;
    agentUuid: string | null;
    title: string | null;
};

type Owner = { projectUuid: string; userUuid: string };

/** A branch compile as Studio reads it, with the explores of its last success. */
export type BranchCompile = Omit<SemanticStudioBranchCompile, 'hasExplores'> & {
    explores: DbSemanticStudioBranchCompile['explores'];
};

const activeOf = ({ projectUuid, userUuid }: Owner) => ({
    project_uuid: projectUuid,
    created_by_user_uuid: userUuid,
    is_active: true,
});

const latestPullRequestUrl = (workspaceAlias: string) =>
    `(SELECT r.pr_url FROM ${AiWritebackRunTableName} r WHERE r.ai_thread_uuid = ${workspaceAlias}.ai_thread_uuid AND r.pr_url IS NOT NULL ORDER BY r.created_at DESC LIMIT 1)`;

const publishedLive = (workspaceAlias: string) =>
    `EXISTS (SELECT 1 FROM ${ProjectModelDraftChangesTableName} d WHERE d.workspace_uuid = ${workspaceAlias}.semantic_studio_workspace_uuid AND d.status = 'applied' AND d.applied_change_set_uuid IS NOT NULL)`;

// Two switches at once would otherwise both pass the deactivate step and trip the one-active index.
const lockStudioWorkspaceOwner = (
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
        publishedLive: row.published_live,
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
                trx.raw(`${publishedLive('w')} AS published_live`),
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

    /** Open drafts and their models, each with who edited it; `threadUuid` is the chat asking. */
    async listChanges(
        { projectUuid, userUuid }: Owner,
        threadUuid: string | null,
    ) {
        const [byHand, thisChat, anotherChat] = STUDIO_EDITED_IN;
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
                this.database.raw(
                    `COALESCE((SELECT jsonb_agg(jsonb_build_object('name', name, 'editedIn', edited_in) ORDER BY name) FROM (
                    SELECT m->>'name' AS name, array_agg(DISTINCT CASE
                        WHEN d.prompt_uuid IS NULL THEN ?::text
                        WHEN p.ai_thread_uuid = ? THEN ?::text
                        ELSE ?::text END) AS edited_in
                    FROM ?? d
                    CROSS JOIN LATERAL jsonb_array_elements(d.models::jsonb) m
                    LEFT JOIN ?? p ON p.ai_prompt_uuid = d.prompt_uuid
                    WHERE d.workspace_uuid = w.semantic_studio_workspace_uuid AND d.status <> 'discarded'
                    AND d.created_by_user_uuid = w.created_by_user_uuid AND d.project_uuid = w.project_uuid
                    GROUP BY 1) per_model), '[]'::jsonb) AS models`,
                    [
                        byHand,
                        threadUuid,
                        thisChat,
                        anotherChat,
                        ProjectModelDraftChangesTableName,
                        AiPromptTableName,
                    ],
                ),
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

    /** The owners of the unfinished workspaces whose current pull request is this one, whoever is asking. */
    async findUnfinishedWithPullRequest(
        projectUuid: string,
        prUrl: string,
    ): Promise<{ workspaceUuid: string; userUuid: string }[]> {
        const rows = await this.select()
            .where('w.project_uuid', projectUuid)
            .whereNull('w.finished_at');
        return rows.flatMap((row) =>
            (row.latest_pr_url ?? row.pull_request_url) === prUrl &&
            row.created_by_user_uuid !== null
                ? [
                      {
                          workspaceUuid: row.semantic_studio_workspace_uuid,
                          userUuid: row.created_by_user_uuid,
                      },
                  ]
                : [],
        );
    }

    /**
     * Inside a draft write: locks the person's workspaces and returns the active one, starting one named
     * `name` when none is or naming an untitled one; null when the active one is no longer `expectedWorkspaceUuid`.
     */
    static async checkOutForDraft(
        trx: Knex.Transaction,
        owner: Owner,
        {
            expectedWorkspaceUuid,
            organizationUuid,
            name,
            promptUuid,
        }: {
            expectedWorkspaceUuid: string | null;
            organizationUuid: string;
            name: string;
            promptUuid: string | null;
        },
    ): Promise<{
        workspaceUuid: string;
        startedChange: { workspaceUuid: string; name: string } | null;
    } | null> {
        await lockStudioWorkspaceOwner(trx, owner);
        const active = await trx(SemanticStudioWorkspacesTableName)
            .where(activeOf(owner))
            .forUpdate()
            .first();
        if (
            (active?.semantic_studio_workspace_uuid ?? null) !==
            expectedWorkspaceUuid
        ) {
            return null;
        }
        const resumed =
            !active && promptUuid
                ? await SemanticStudioWorkspaceModel.reopenPromptThread(
                      trx,
                      owner,
                      promptUuid,
                  )
                : undefined;
        const workspace =
            active ??
            resumed ??
            (
                await trx(SemanticStudioWorkspacesTableName)
                    .insert({
                        organization_uuid: organizationUuid,
                        project_uuid: owner.projectUuid,
                        created_by_user_uuid: owner.userUuid,
                        ai_thread_uuid: null,
                        name,
                        is_active: true,
                    })
                    .returning(['semantic_studio_workspace_uuid', 'name'])
            )[0];
        const workspaceUuid = workspace.semantic_studio_workspace_uuid;
        // A draft still untitled takes the name of its first change; a name someone gave it stays.
        if (
            workspace.name === UNTITLED_WORKSPACE_NAME &&
            name !== UNTITLED_WORKSPACE_NAME
        ) {
            await trx(SemanticStudioWorkspacesTableName)
                .where('semantic_studio_workspace_uuid', workspaceUuid)
                .update({ name });
        }
        if (promptUuid && !active?.ai_thread_uuid) {
            await SemanticStudioWorkspaceModel.attachPromptThread(
                trx,
                workspaceUuid,
                promptUuid,
            );
        }
        return {
            workspaceUuid,
            startedChange: active
                ? null
                : { workspaceUuid, name: workspace.name },
        };
    }

    /** A chat that keeps writing after its draft was published picks that draft back up, so its edits stay in the chat. */
    private static async reopenPromptThread(
        trx: Knex.Transaction,
        owner: Owner,
        promptUuid: string,
    ): Promise<
        { semantic_studio_workspace_uuid: string; name: string } | undefined
    > {
        const prompt = await trx(AiPromptTableName)
            .select('ai_thread_uuid')
            .where('ai_prompt_uuid', promptUuid)
            .first();
        if (!prompt) return undefined;
        const [row] = await trx(SemanticStudioWorkspacesTableName)
            .where({
                project_uuid: owner.projectUuid,
                created_by_user_uuid: owner.userUuid,
                ai_thread_uuid: prompt.ai_thread_uuid,
            })
            .update({
                is_active: true,
                finished_at: null,
                updated_at: trx.fn.now(),
            })
            .returning(['semantic_studio_workspace_uuid', 'name']);
        return row;
    }

    /** A draft keeps the chat that first changed it, so opening the draft opens that chat; a chat already kept by another draft stays there. */
    private static async attachPromptThread(
        trx: Knex.Transaction,
        workspaceUuid: string,
        promptUuid: string,
    ) {
        const prompt = await trx(AiPromptTableName)
            .select('ai_thread_uuid')
            .where('ai_prompt_uuid', promptUuid)
            .first();
        if (!prompt) return;
        const taken = await trx(SemanticStudioWorkspacesTableName)
            .where('ai_thread_uuid', prompt.ai_thread_uuid)
            .first();
        if (taken) return;
        await trx(SemanticStudioWorkspacesTableName)
            .where('semantic_studio_workspace_uuid', workspaceUuid)
            .whereNull('ai_thread_uuid')
            .update({ ai_thread_uuid: prompt.ai_thread_uuid });
    }

    async create(
        owner: Owner,
        organizationUuid: string,
        name: string,
    ): Promise<string> {
        return this.database.transaction(async (trx) => {
            await lockStudioWorkspaceOwner(trx, owner);
            await trx(SemanticStudioWorkspacesTableName)
                .where(activeOf(owner))
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
                .where(activeOf(owner))
                .whereNull('ai_thread_uuid')
                .first();
            if (independent) return independent.semantic_studio_workspace_uuid;
            await trx(SemanticStudioWorkspacesTableName)
                .where(activeOf(owner))
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
                .where(activeOf(owner))
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

    async leave(owner: Owner): Promise<void> {
        await this.database.transaction(async (trx) => {
            await lockStudioWorkspaceOwner(trx, owner);
            await trx(SemanticStudioWorkspacesTableName)
                .where(activeOf(owner))
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
    async finish(owner: Owner, workspaceUuid: string): Promise<number> {
        return this.database(SemanticStudioWorkspacesTableName)
            .where({
                project_uuid: owner.projectUuid,
                created_by_user_uuid: owner.userUuid,
                semantic_studio_workspace_uuid: workspaceUuid,
            })
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

    /** Records what a workspace's current pull request's provider said about it; a merge finishes the workspace. Returns whether a workspace changed. */
    async recordPullRequestState(
        projectUuid: string,
        url: string,
        state: SemanticStudioWorkspacePullRequestState,
        /** Whether a state other than open ends the workspace; false keeps one whose draft is still there. */
        finishes: boolean,
    ): Promise<boolean> {
        const now = this.database.fn.now();
        const updated = await this.database(SemanticStudioWorkspacesTableName)
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
                ...(state !== 'open' && finishes
                    ? { is_active: false, finished_at: now }
                    : {}),
            });
        return updated > 0;
    }

    /** Asks for a new compile of a change's branch; returns the request a compile must still match to be kept. */
    async requestBranchCompile(
        workspaceUuid: string,
        requestedByAgent: boolean,
    ): Promise<string> {
        const compileRequestUuid = uuidv4();
        await this.database(SemanticStudioBranchCompilesTableName)
            .insert({
                semantic_studio_workspace_uuid: workspaceUuid,
                compile_request_uuid: compileRequestUuid,
                status: 'compiling',
                requested_by_agent: requestedByAgent,
            })
            .onConflict('semantic_studio_workspace_uuid')
            .merge({
                compile_request_uuid: compileRequestUuid,
                status: 'compiling',
                error: null,
                requested_at: this.database.fn.now(),
                requested_by_agent: requestedByAgent,
                follow_up_claimed_at: null,
            });
        return compileRequestUuid;
    }

    /** Marks an agent's failed compile as sent back to the agent; false when it is not that, or was already sent. */
    async claimBranchCompileFollowUp(
        workspaceUuid: string,
        compileRequestUuid: string,
    ): Promise<boolean> {
        const updated = await this.database(
            SemanticStudioBranchCompilesTableName,
        )
            .where({
                semantic_studio_workspace_uuid: workspaceUuid,
                compile_request_uuid: compileRequestUuid,
                status: 'failed',
                requested_by_agent: true,
            })
            .whereNull('follow_up_claimed_at')
            .update({ follow_up_claimed_at: this.database.fn.now() });
        return updated > 0;
    }

    /** The thread's latest prompts, newest first. */
    async findLatestPrompts(
        threadUuid: string,
        limit: number,
    ): Promise<
        Pick<DbAiPrompt, 'prompt' | 'hidden' | 'created_at' | 'responded_at'>[]
    > {
        return this.database(AiPromptTableName)
            .where('ai_thread_uuid', threadUuid)
            .orderBy('created_at', 'desc')
            .limit(limit)
            .select('prompt', 'hidden', 'created_at', 'responded_at');
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
    ): Promise<BranchCompile | null> {
        const row = await this.database(SemanticStudioBranchCompilesTableName)
            .where('semantic_studio_workspace_uuid', workspaceUuid)
            .first();
        return row
            ? {
                  status: row.status,
                  branch: row.branch,
                  error: row.error,
                  explores: row.explores,
                  requestedAt: row.requested_at,
                  compiledAt: row.compiled_at,
                  compileRequestUuid: row.compile_request_uuid,
                  requestedByAgent: row.requested_by_agent,
              }
            : null;
    }
}
