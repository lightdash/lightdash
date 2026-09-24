import {
    AiAgentSkill,
    AiAgentSkillContent,
    AiAgentSkillParsed,
    AiAgentSkillSummary,
    AiAgentSkillVersion,
    AiAgentSkillVersionSource,
    AiAgentSkillVersionSummary,
    NotFoundError,
    validateAiAgentSkill,
} from '@lightdash/common';
import crypto from 'crypto';
import { Knex } from 'knex';
import {
    AiAgentSkillAccessTableName,
    AiAgentSkillTableName,
    AiAgentSkillVersionTableName,
    DbAiAgentSkill,
    DbAiAgentSkillVersion,
} from '../database/entities/aiAgentSkill';

type DbSkillRow = DbAiAgentSkill & {
    agent_uuids: string[] | null;
    version_uuid: string;
    version_number: number;
    version_content: AiAgentSkillContent;
    version_hash: string;
    version_source: AiAgentSkillVersionSource;
    version_restored_from: number | null;
    version_created_at: Date;
    version_created_by: string | null;
};

const canonicalize = (value: unknown): string => {
    if (Array.isArray(value)) {
        return `[${value.map(canonicalize).join(',')}]`;
    }
    if (value !== null && typeof value === 'object') {
        return `{${Object.keys(value as Record<string, unknown>)
            .sort()
            .map(
                (key) =>
                    `${JSON.stringify(key)}:${canonicalize(
                        (value as Record<string, unknown>)[key],
                    )}`,
            )
            .join(',')}}`;
    }
    return JSON.stringify(value);
};

export const getAiAgentSkillContentHash = (
    content: AiAgentSkillContent,
): string =>
    `sha256:${crypto
        .createHash('sha256')
        .update(canonicalize(content))
        .digest('hex')}`;

// Rows were valid when written; a failure here means the validator got stricter since.
const parseStoredContent = (
    content: AiAgentSkillContent,
): AiAgentSkillParsed => {
    const result = validateAiAgentSkill({ files: content.files });
    if (!result.valid) {
        throw new Error(
            `Stored skill content no longer validates: ${result.errors
                .map((issue) => issue.message)
                .join('; ')}`,
        );
    }
    return result.parsed;
};

const toVersionSummary = (
    row: DbAiAgentSkillVersion,
): AiAgentSkillVersionSummary => ({
    uuid: row.ai_agent_skill_version_uuid,
    versionNumber: row.version_number,
    contentHash: row.content_hash,
    source: row.source,
    restoredFromVersion: row.restored_from_version,
    createdAt: row.created_at,
    createdByUserUuid: row.created_by_user_uuid,
});

const currentVersionOf = (row: DbSkillRow): DbAiAgentSkillVersion => ({
    ai_agent_skill_version_uuid: row.version_uuid,
    ai_agent_skill_uuid: row.ai_agent_skill_uuid,
    version_number: row.version_number,
    content: row.version_content,
    content_hash: row.version_hash,
    source: row.version_source,
    restored_from_version: row.version_restored_from,
    created_by_user_uuid: row.version_created_by,
    created_at: row.version_created_at,
});

const toSummary = (
    row: DbSkillRow,
    parsed: AiAgentSkillParsed,
): AiAgentSkillSummary => {
    const { frontmatter } = parsed;
    return {
        uuid: row.ai_agent_skill_uuid,
        organizationUuid: row.organization_uuid,
        projectUuid: row.project_uuid,
        name: row.name,
        title: row.title,
        description: row.description,
        argumentHint: frontmatter.argumentHint,
        disableModelInvocation: frontmatter.disableModelInvocation,
        userInvocable: frontmatter.userInvocable,
        availability: frontmatter.availability,
        currentVersion: toVersionSummary(currentVersionOf(row)),
        agentUuids: row.agent_uuids ?? [],
        createdByUserUuid: row.created_by_user_uuid,
        updatedByUserUuid: row.updated_by_user_uuid,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        deletedAt: row.deleted_at,
    };
};

const mapSummary = (row: DbSkillRow): AiAgentSkillSummary =>
    toSummary(row, parseStoredContent(row.version_content));

const mapSkill = (row: DbSkillRow): AiAgentSkill => {
    const parsed = parseStoredContent(row.version_content);
    return {
        ...toSummary(row, parsed),
        content: row.version_content,
        parsed,
    };
};

const mapVersionRow = (row: DbAiAgentSkillVersion): AiAgentSkillVersion => ({
    ...toVersionSummary(row),
    skillUuid: row.ai_agent_skill_uuid,
    content: row.content,
});

export class AiAgentSkillModel {
    private readonly database: Knex;

    constructor({ database }: { database: Knex }) {
        this.database = database;
    }

    private baseSelect(qb: Knex = this.database) {
        return qb(AiAgentSkillTableName)
            .innerJoin(
                AiAgentSkillVersionTableName,
                `${AiAgentSkillTableName}.current_version_uuid`,
                `${AiAgentSkillVersionTableName}.ai_agent_skill_version_uuid`,
            )
            .select<DbSkillRow[]>(
                `${AiAgentSkillTableName}.*`,
                `${AiAgentSkillVersionTableName}.ai_agent_skill_version_uuid as version_uuid`,
                `${AiAgentSkillVersionTableName}.version_number as version_number`,
                `${AiAgentSkillVersionTableName}.content as version_content`,
                `${AiAgentSkillVersionTableName}.content_hash as version_hash`,
                `${AiAgentSkillVersionTableName}.source as version_source`,
                `${AiAgentSkillVersionTableName}.restored_from_version as version_restored_from`,
                `${AiAgentSkillVersionTableName}.created_at as version_created_at`,
                `${AiAgentSkillVersionTableName}.created_by_user_uuid as version_created_by`,
                qb.raw(
                    `COALESCE(
                        (SELECT array_agg(access.ai_agent_uuid)
                         FROM ?? AS access
                         WHERE access.ai_agent_skill_uuid = ??.ai_agent_skill_uuid),
                        ARRAY[]::uuid[]
                    ) AS agent_uuids`,
                    [AiAgentSkillAccessTableName, AiAgentSkillTableName],
                ),
            );
    }

    /** Live skills only. */
    async find(uuid: string): Promise<AiAgentSkill | undefined> {
        const row = await this.baseSelect()
            .where(`${AiAgentSkillTableName}.ai_agent_skill_uuid`, uuid)
            .whereNull(`${AiAgentSkillTableName}.deleted_at`)
            .first();
        return row ? mapSkill(row) : undefined;
    }

    /** Soft-deleted skills too: restore, version history and pinned turns need them. */
    async findIncludingDeleted(
        uuid: string,
    ): Promise<AiAgentSkill | undefined> {
        const row = await this.baseSelect()
            .where(`${AiAgentSkillTableName}.ai_agent_skill_uuid`, uuid)
            .first();
        return row ? mapSkill(row) : undefined;
    }

    async getIncludingDeleted(uuid: string): Promise<AiAgentSkill> {
        const skill = await this.findIncludingDeleted(uuid);
        if (!skill) {
            throw new NotFoundError(`Skill ${uuid} not found`);
        }
        return skill;
    }

    /** Includes soft-deleted rows: a deleted skill still reserves its name. */
    async findByName(args: {
        organizationUuid: string;
        name: string;
    }): Promise<AiAgentSkill | undefined> {
        const row = await this.baseSelect()
            .where(
                `${AiAgentSkillTableName}.organization_uuid`,
                args.organizationUuid,
            )
            .where(`${AiAgentSkillTableName}.name`, args.name)
            .first();
        return row ? mapSkill(row) : undefined;
    }

    async findAllForOrganization(args: {
        organizationUuid: string;
        projectUuid: string | null;
        includeDeleted: boolean;
    }): Promise<AiAgentSkillSummary[]> {
        const query = this.baseSelect().where(
            `${AiAgentSkillTableName}.organization_uuid`,
            args.organizationUuid,
        );
        if (!args.includeDeleted) {
            void query.whereNull(`${AiAgentSkillTableName}.deleted_at`);
        }
        if (args.projectUuid) {
            void query.where((builder) =>
                builder
                    .whereNull(`${AiAgentSkillTableName}.project_uuid`)
                    .orWhere(
                        `${AiAgentSkillTableName}.project_uuid`,
                        args.projectUuid,
                    ),
            );
        }
        const rows = await query.orderBy(`${AiAgentSkillTableName}.name`);
        return rows.map(mapSummary);
    }

    async findBoundToAgent(agentUuid: string): Promise<AiAgentSkill[]> {
        const rows = await this.baseSelect()
            .innerJoin(
                AiAgentSkillAccessTableName,
                `${AiAgentSkillAccessTableName}.ai_agent_skill_uuid`,
                `${AiAgentSkillTableName}.ai_agent_skill_uuid`,
            )
            .where(`${AiAgentSkillAccessTableName}.ai_agent_uuid`, agentUuid)
            .whereNull(`${AiAgentSkillTableName}.deleted_at`)
            .orderBy(`${AiAgentSkillTableName}.name`);
        return rows.map(mapSkill);
    }

    async findBoundToAgentByName(args: {
        agentUuid: string;
        name: string;
    }): Promise<AiAgentSkill | undefined> {
        const row = await this.baseSelect()
            .innerJoin(
                AiAgentSkillAccessTableName,
                `${AiAgentSkillAccessTableName}.ai_agent_skill_uuid`,
                `${AiAgentSkillTableName}.ai_agent_skill_uuid`,
            )
            .where(
                `${AiAgentSkillAccessTableName}.ai_agent_uuid`,
                args.agentUuid,
            )
            .where(`${AiAgentSkillTableName}.name`, args.name)
            .whereNull(`${AiAgentSkillTableName}.deleted_at`)
            .first();
        return row ? mapSkill(row) : undefined;
    }

    async create(args: {
        organizationUuid: string;
        projectUuid: string | null;
        content: AiAgentSkillContent;
        parsed: AiAgentSkillParsed;
        source: AiAgentSkillVersionSource;
        userUuid: string | null;
        agentUuids: string[];
    }): Promise<AiAgentSkill> {
        const uuid = await this.database.transaction(async (trx) => {
            const [skill] = await trx(AiAgentSkillTableName)
                .insert({
                    organization_uuid: args.organizationUuid,
                    project_uuid: args.projectUuid,
                    name: args.parsed.frontmatter.name,
                    title: args.parsed.frontmatter.title,
                    description: args.parsed.frontmatter.description,
                    created_by_user_uuid: args.userUuid,
                    updated_by_user_uuid: args.userUuid,
                })
                .returning('ai_agent_skill_uuid');
            await this.insertVersion(trx, {
                skillUuid: skill.ai_agent_skill_uuid,
                versionNumber: 1,
                content: args.content,
                source: args.source,
                restoredFromVersion: null,
                userUuid: args.userUuid,
            });
            if (args.agentUuids.length > 0) {
                await trx(AiAgentSkillAccessTableName).insert(
                    args.agentUuids.map((agentUuid) => ({
                        ai_agent_skill_uuid: skill.ai_agent_skill_uuid,
                        ai_agent_uuid: agentUuid,
                    })),
                );
            }
            return skill.ai_agent_skill_uuid;
        });
        return this.getIncludingDeleted(uuid);
    }

    private async insertVersion(
        trx: Knex.Transaction,
        args: {
            skillUuid: string;
            versionNumber: number;
            content: AiAgentSkillContent;
            source: AiAgentSkillVersionSource;
            restoredFromVersion: number | null;
            userUuid: string | null;
        },
    ): Promise<string> {
        const [version] = await trx(AiAgentSkillVersionTableName)
            .insert({
                ai_agent_skill_uuid: args.skillUuid,
                version_number: args.versionNumber,
                content: args.content,
                content_hash: getAiAgentSkillContentHash(args.content),
                source: args.source,
                restored_from_version: args.restoredFromVersion,
                created_by_user_uuid: args.userUuid,
            })
            .returning('ai_agent_skill_version_uuid');
        await trx(AiAgentSkillTableName)
            .where('ai_agent_skill_uuid', args.skillUuid)
            .update({
                current_version_uuid: version.ai_agent_skill_version_uuid,
                updated_by_user_uuid: args.userUuid,
                updated_at: trx.fn.now(),
            });
        return version.ai_agent_skill_version_uuid;
    }

    /** Publishes a new version unless the content hash equals the current one; `revive` also clears a soft delete. */
    async publishVersion(args: {
        skillUuid: string;
        content: AiAgentSkillContent;
        parsed: AiAgentSkillParsed;
        source: AiAgentSkillVersionSource;
        restoredFromVersion: number | null;
        revive: boolean;
        userUuid: string | null;
    }): Promise<{ skill: AiAgentSkill; created: boolean }> {
        const created = await this.database.transaction(async (trx) => {
            const current = await trx(AiAgentSkillTableName)
                .innerJoin(
                    AiAgentSkillVersionTableName,
                    `${AiAgentSkillTableName}.current_version_uuid`,
                    `${AiAgentSkillVersionTableName}.ai_agent_skill_version_uuid`,
                )
                .where(
                    `${AiAgentSkillTableName}.ai_agent_skill_uuid`,
                    args.skillUuid,
                )
                .select<{ content_hash: string }[]>(
                    `${AiAgentSkillVersionTableName}.content_hash`,
                )
                .forUpdate()
                .first();
            if (!current) {
                throw new NotFoundError(`Skill ${args.skillUuid} not found`);
            }
            const hash = getAiAgentSkillContentHash(args.content);
            // A restore always records the act, even when content equals the current version.
            if (args.source !== 'restore' && current.content_hash === hash) {
                return false;
            }
            const latest = await trx(AiAgentSkillVersionTableName)
                .where('ai_agent_skill_uuid', args.skillUuid)
                .max<{ max: number | null }[]>('version_number as max')
                .first();
            await this.insertVersion(trx, {
                skillUuid: args.skillUuid,
                versionNumber: (latest?.max ?? 0) + 1,
                content: args.content,
                source: args.source,
                restoredFromVersion: args.restoredFromVersion,
                userUuid: args.userUuid,
            });
            await trx(AiAgentSkillTableName)
                .where('ai_agent_skill_uuid', args.skillUuid)
                .update({
                    title: args.parsed.frontmatter.title,
                    description: args.parsed.frontmatter.description,
                    ...(args.revive
                        ? { deleted_at: null, deleted_by_user_uuid: null }
                        : {}),
                });
            return true;
        });
        return {
            skill: await this.getIncludingDeleted(args.skillUuid),
            created,
        };
    }

    async listVersions(
        skillUuid: string,
    ): Promise<AiAgentSkillVersionSummary[]> {
        const rows = await this.database(AiAgentSkillVersionTableName)
            .where('ai_agent_skill_uuid', skillUuid)
            .orderBy('version_number', 'desc');
        return rows.map(toVersionSummary);
    }

    async findVersionByUuid(
        versionUuid: string,
    ): Promise<AiAgentSkillVersion | undefined> {
        const row = await this.database(AiAgentSkillVersionTableName)
            .where('ai_agent_skill_version_uuid', versionUuid)
            .first();
        return row ? mapVersionRow(row) : undefined;
    }

    async findVersion(args: {
        skillUuid: string;
        versionNumber: number;
    }): Promise<AiAgentSkillVersion | undefined> {
        const row = await this.database(AiAgentSkillVersionTableName)
            .where('ai_agent_skill_uuid', args.skillUuid)
            .where('version_number', args.versionNumber)
            .first();
        return row ? mapVersionRow(row) : undefined;
    }

    /** Soft-deletes the skill and removes every binding; returns the unbound agents. */
    async softDelete(args: {
        skillUuid: string;
        userUuid: string | null;
    }): Promise<string[]> {
        return this.database.transaction(async (trx) => {
            const bindings = await trx(AiAgentSkillAccessTableName)
                .where('ai_agent_skill_uuid', args.skillUuid)
                .delete()
                .returning('ai_agent_uuid');
            await trx(AiAgentSkillTableName)
                .where('ai_agent_skill_uuid', args.skillUuid)
                .update({
                    deleted_at: trx.fn.now(),
                    deleted_by_user_uuid: args.userUuid,
                    updated_by_user_uuid: args.userUuid,
                    updated_at: trx.fn.now(),
                });
            return bindings.map((row) => row.ai_agent_uuid);
        });
    }

    /** Makes the given set the agent's bindings: binds missing, unbinds extra. */
    async setAgentSkills(args: {
        agentUuid: string;
        skillUuids: string[];
    }): Promise<void> {
        await this.database.transaction(async (trx) => {
            await trx(AiAgentSkillAccessTableName)
                .where('ai_agent_uuid', args.agentUuid)
                .whereNotIn('ai_agent_skill_uuid', args.skillUuids)
                .delete();
            if (args.skillUuids.length > 0) {
                await trx(AiAgentSkillAccessTableName)
                    .insert(
                        args.skillUuids.map((skillUuid) => ({
                            ai_agent_skill_uuid: skillUuid,
                            ai_agent_uuid: args.agentUuid,
                        })),
                    )
                    .onConflict(['ai_agent_skill_uuid', 'ai_agent_uuid'])
                    .ignore();
            }
        });
    }

    async countBoundToAgent(agentUuid: string): Promise<number> {
        const result = await this.database(AiAgentSkillAccessTableName)
            .innerJoin(
                AiAgentSkillTableName,
                `${AiAgentSkillTableName}.ai_agent_skill_uuid`,
                `${AiAgentSkillAccessTableName}.ai_agent_skill_uuid`,
            )
            .where(`${AiAgentSkillAccessTableName}.ai_agent_uuid`, agentUuid)
            .whereNull(`${AiAgentSkillTableName}.deleted_at`)
            .count<{ count: string }[]>(
                `${AiAgentSkillAccessTableName}.ai_agent_skill_uuid as count`,
            )
            .first();
        return Number(result?.count ?? 0);
    }
}
