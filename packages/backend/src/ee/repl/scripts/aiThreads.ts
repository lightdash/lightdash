import { ParameterError } from '@lightdash/common';
import { type Knex } from 'knex';
import { DashboardsTableName } from '../../../database/entities/dashboards';
import {
    AiPromptTableName,
    AiThreadTableName,
    AiWebAppPromptTableName,
    AiWebAppThreadTableName,
} from '../../database/entities/ai';

export type EmbedThreadFilter = {
    projectUuid: string;
    agentUuid?: string;
    threadUuids?: string[];
    /** The current owner; null targets threads without one. */
    ownerIdentifier?: string | null;
    /** The dashboard the thread is bound to. */
    dashboardUuid?: string;
    /** A write space of the token that started the thread. */
    spaceUuid?: string;
    /** A viewer (user.externalId) who sent a message in the thread. */
    viewerId?: string;
};

export type EmbedThread = {
    threadUuid: string;
    agentUuid: string | null;
    title: string | null;
    createdAt: Date;
    ownerIdentifier: string | null;
    writeSpaceUuids: string[];
    dashboardUuid: string | null;
    dashboardName: string | null;
    viewerIds: string[];
};

export type EmbedThreadOwnerChange = {
    threadUuid: string;
    title: string | null;
    from: string | null;
    to: string;
};

const FILTER_KEYS: ReadonlyArray<keyof EmbedThreadFilter> = [
    'projectUuid',
    'agentUuid',
    'threadUuids',
    'ownerIdentifier',
    'dashboardUuid',
    'spaceUuid',
    'viewerId',
];

const thread = AiThreadTableName;
const webAppThread = AiWebAppThreadTableName;
const spacesSql = `COALESCE(${webAppThread}.embed_space_uuids, ARRAY[${webAppThread}.embed_space_uuid])`;
const viewersSql = `SELECT DISTINCT wp.external_user_id FROM ${AiPromptTableName} p JOIN ${AiWebAppPromptTableName} wp ON wp.ai_prompt_uuid = p.ai_prompt_uuid WHERE p.ai_thread_uuid = ${thread}.ai_thread_uuid AND wp.external_user_id IS NOT NULL`;

// A typo in a filter key would silently widen what a script changes.
const assertFilter = (where: EmbedThreadFilter) => {
    if (typeof where?.projectUuid !== 'string' || where.projectUuid === '') {
        throw new ParameterError('where.projectUuid is required');
    }
    const unknownKeys = Object.keys(where).filter(
        (key) => !FILTER_KEYS.some((known) => known === key),
    );
    if (unknownKeys.length > 0) {
        throw new ParameterError(
            `Unknown filter: ${unknownKeys.join(', ')}. Use ${FILTER_KEYS.join(', ')}`,
        );
    }
};

/** AI agent thread scripts for the backend REPL. */
export function getAiThreadScripts(database: Knex) {
    async function listEmbedThreads(
        where: EmbedThreadFilter,
    ): Promise<EmbedThread[]> {
        assertFilter(where);

        const query = database(thread)
            .join(
                webAppThread,
                `${thread}.ai_thread_uuid`,
                `${webAppThread}.ai_thread_uuid`,
            )
            .leftJoin(DashboardsTableName, function joinBoundDashboard() {
                void this.on(
                    `${DashboardsTableName}.dashboard_uuid`,
                    `${thread}.bound_entity_uuid`,
                )
                    .andOnVal(`${thread}.bound_entity_type`, 'dashboard')
                    .andOnNull(`${DashboardsTableName}.deleted_at`);
            })
            .select({
                threadUuid: `${thread}.ai_thread_uuid`,
                agentUuid: `${thread}.agent_uuid`,
                title: `${thread}.title`,
                createdAt: `${thread}.created_at`,
                ownerIdentifier: `${webAppThread}.embed_external_user_id`,
                writeSpaceUuids: database.raw(
                    `ARRAY_REMOVE(${spacesSql}, NULL)::text[]`,
                ),
                dashboardUuid: database.raw(
                    `CASE WHEN ${thread}.bound_entity_type = 'dashboard' THEN ${thread}.bound_entity_uuid END`,
                ),
                dashboardName: `${DashboardsTableName}.name`,
                viewerIds: database.raw(`ARRAY(${viewersSql} ORDER BY 1)`),
            })
            .where(`${thread}.project_uuid`, where.projectUuid)
            // Never web app threads: an owner would expose them to embed tokens.
            .whereRaw(
                `(${webAppThread}.embed_space_uuids IS NOT NULL OR ${webAppThread}.embed_space_uuid IS NOT NULL OR ${webAppThread}.embed_external_user_id IS NOT NULL)`,
            )
            .orderBy(`${thread}.created_at`);

        if (where.agentUuid !== undefined) {
            void query.where(`${thread}.agent_uuid`, where.agentUuid);
        }
        if (where.threadUuids !== undefined) {
            void query.whereIn(`${thread}.ai_thread_uuid`, where.threadUuids);
        }
        if (where.ownerIdentifier === null) {
            void query.whereNull(`${webAppThread}.embed_external_user_id`);
        } else if (where.ownerIdentifier !== undefined) {
            void query.where(
                `${webAppThread}.embed_external_user_id`,
                where.ownerIdentifier,
            );
        }
        if (where.dashboardUuid !== undefined) {
            void query
                .where(`${thread}.bound_entity_type`, 'dashboard')
                .where(`${thread}.bound_entity_uuid`, where.dashboardUuid);
        }
        if (where.spaceUuid !== undefined) {
            void query.whereRaw(`?::uuid = ANY(${spacesSql})`, [
                where.spaceUuid,
            ]);
        }
        if (where.viewerId !== undefined) {
            void query.whereRaw(`? IN (${viewersSql})`, [where.viewerId]);
        }

        return query;
    }

    async function setEmbedThreadOwners(args: {
        where: EmbedThreadFilter;
        /** The new owner of each matched thread; null leaves the thread as it is. */
        owner: (thread: EmbedThread) => string | null;
        /** Defaults to true: report the changes without applying them. */
        dryRun?: boolean;
    }): Promise<{ dryRun: boolean; changes: EmbedThreadOwnerChange[] }> {
        if (typeof args?.owner !== 'function') {
            throw new ParameterError(
                'owner must be a function, for example (thread) => `dashboard:${thread.dashboardUuid}`',
            );
        }
        const dryRun = args.dryRun ?? true;
        const threads = await listEmbedThreads(args.where);

        const changes = threads.flatMap<EmbedThreadOwnerChange>((match) => {
            const to = args.owner(match);
            if (to === null || to === match.ownerIdentifier) return [];
            if (typeof to !== 'string' || to.trim() === '') {
                throw new ParameterError(
                    `owner returned an invalid identifier for thread ${match.threadUuid}`,
                );
            }
            return [
                {
                    threadUuid: match.threadUuid,
                    title: match.title,
                    from: match.ownerIdentifier,
                    to,
                },
            ];
        });

        if (!dryRun && changes.length > 0) {
            await database.transaction(async (trx) => {
                const owners = [...new Set(changes.map((change) => change.to))];
                await Promise.all(
                    owners.map((to) =>
                        trx.raw(
                            `UPDATE ${webAppThread} SET embed_external_user_id = ? WHERE ai_thread_uuid = ANY(?::uuid[])`,
                            [
                                to,
                                changes
                                    .filter((change) => change.to === to)
                                    .map((change) => change.threadUuid),
                            ],
                        ),
                    ),
                );
            });
        }

        console.log(
            dryRun
                ? `Dry run: ${changes.length} of ${threads.length} matched threads would change owner. Pass dryRun: false to apply.`
                : `Changed the owner of ${changes.length} of ${threads.length} matched threads.`,
        );
        return { dryRun, changes };
    }

    return { listEmbedThreads, setEmbedThreadOwners };
}
