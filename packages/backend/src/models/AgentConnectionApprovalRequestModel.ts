import { type AgentCapability } from '@lightdash/common';
import { type Knex } from 'knex';
import { createHash, timingSafeEqual } from 'node:crypto';
import { parseGrantResourceConstraints } from '../auth/agentConnectionGrants/resourceConstraints';
import {
    AgentConnectionApprovalRequestsTableName as table,
    type ApprovalSelection,
    type DbAgentConnectionApprovalRequest,
} from '../database/entities/agentConnectionApprovalRequests';

type ApprovalRequestErrorCode =
    | 'approval_request_not_found'
    | 'approval_forbidden'
    | 'approval_request_expired'
    | 'approval_request_consumed'
    | 'approval_selection_changed'
    | 'pending_request_limit'
    | 'csrf_failed'
    | 'invalid_approval_request';

export class AgentConnectionApprovalRequestError extends Error {
    constructor(
        readonly code: ApprovalRequestErrorCode,
        readonly retryAfterSeconds: number | null = null,
    ) {
        super(code);
        this.name = 'AgentConnectionApprovalRequestError';
    }
}

interface Owner {
    requestUuid: string;
    organizationUuid: string;
    subjectUserUuid: string;
}

interface PendingInput {
    organizationUuid: string;
    subjectUserUuid: string;
    clientId: string;
    name: string;
    redirectUri: string;
    state: string;
    codeChallenge: string;
    resource: string;
    requestedProjects: string[] | null;
    requestedCapabilities: AgentCapability[];
    expiresInSeconds: number;
}

type ReviewDecision =
    | { decision: 'deny' }
    | {
          decision: 'approve';
          selection: ApprovalSelection;
          policyVersion: number;
      };

const digest = (value: string): Buffer =>
    createHash('sha256').update(value).digest();
const matchesDigest = (value: string, stored: Buffer | null): boolean =>
    stored !== null &&
    stored.length === 32 &&
    timingSafeEqual(digest(value), stored);
const fail = (code: ApprovalRequestErrorCode): never => {
    throw new AgentConnectionApprovalRequestError(code);
};

export class AgentConnectionApprovalRequestModel {
    constructor(private readonly deps: { database: Knex }) {}

    private static validateSelection(
        selection: ApprovalSelection,
        row: DbAgentConnectionApprovalRequest,
        displayed: ApprovalSelection | null,
        allowEmptyDisplay = false,
    ): void {
        if (
            allowEmptyDisplay &&
            selection.approvedProjectUuids.length === 0 &&
            selection.approvedCapabilities.length === 0 &&
            selection.resourceConstraints.version === 2 &&
            Object.keys(selection.resourceConstraints.projectCapabilities)
                .length === 0
        )
            return;
        const parsed = parseGrantResourceConstraints(selection);
        if (
            parsed?.version !== 2 ||
            selection.approvedProjectUuids.length === 0
        )
            return fail('invalid_approval_request');
        for (const [projectUuid, capabilities] of Object.entries(
            parsed.projectCapabilities,
        )) {
            if (
                row.requested_projects !== null &&
                !row.requested_projects.includes(projectUuid)
            )
                fail('invalid_approval_request');
            if (
                capabilities.some(
                    (capability) =>
                        !row.requested_capabilities.includes(capability),
                )
            )
                fail('invalid_approval_request');
            if (
                displayed !== null &&
                (!Object.hasOwn(
                    displayed.resourceConstraints.projectCapabilities,
                    projectUuid,
                ) ||
                    capabilities.some(
                        (capability) =>
                            !displayed.resourceConstraints.projectCapabilities[
                                projectUuid
                            ].includes(capability),
                    ))
            )
                fail('invalid_approval_request');
        }
    }

    private static async lockOwned(
        trx: Knex.Transaction,
        owner: Owner,
    ): Promise<DbAgentConnectionApprovalRequest> {
        const row = await trx(table)
            .where({
                agent_connection_approval_request_uuid: owner.requestUuid,
            })
            .forUpdate()
            .first();
        if (!row) return fail('approval_request_not_found');
        if (
            row.organization_uuid !== owner.organizationUuid ||
            row.subject_user_uuid !== owner.subjectUserUuid
        )
            return fail('approval_forbidden');
        await AgentConnectionApprovalRequestModel.assertUnexpired(
            trx,
            owner.requestUuid,
        );
        return row;
    }

    private static async assertUnexpired(
        trx: Knex.Transaction,
        requestUuid: string,
    ): Promise<void> {
        const live = await trx(table)
            .where({ agent_connection_approval_request_uuid: requestUuid })
            .where('request_expires_at', '>', trx.raw('clock_timestamp()'))
            .first();
        if (!live) fail('approval_request_expired');
    }

    private static async purge(
        trx: Knex.Transaction,
        limit: number,
    ): Promise<number> {
        const expired = await trx(table)
            .select('agent_connection_approval_request_uuid')
            .where(
                'request_expires_at',
                '<=',
                trx.raw("clock_timestamp() - interval '1 hour'"),
            )
            .orderBy('request_expires_at')
            .limit(limit)
            .forUpdate()
            .skipLocked();
        if (expired.length === 0) return 0;
        return trx(table)
            .whereIn(
                'agent_connection_approval_request_uuid',
                expired.map(
                    (row) => row.agent_connection_approval_request_uuid,
                ),
            )
            .delete();
    }

    async deleteExpiredBatch(limit = 1000): Promise<number> {
        if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000)
            return fail('invalid_approval_request');
        return this.deps.database.transaction((trx) =>
            AgentConnectionApprovalRequestModel.purge(trx, limit),
        );
    }

    async insertPending(
        input: PendingInput,
    ): Promise<DbAgentConnectionApprovalRequest> {
        await this.deleteExpiredBatch(100);
        return this.deps.database.transaction(async (trx) => {
            const person = await trx('users')
                .select('user_uuid')
                .where({ user_uuid: input.subjectUserUuid })
                .forUpdate()
                .first();
            if (!person) return fail('approval_forbidden');
            const pending = await trx(table)
                .select('request_expires_at')
                .where({
                    subject_user_uuid: input.subjectUserUuid,
                    organization_uuid: input.organizationUuid,
                })
                .whereNull('decision_consumed_at')
                .where('request_expires_at', '>', trx.raw('clock_timestamp()'))
                .orderBy('request_expires_at')
                .limit(5);
            if (pending.length === 5) {
                const { rows } = await trx.raw<{
                    rows: { retry_after: number }[];
                }>(
                    'SELECT greatest(1, ceil(extract(epoch FROM (?::timestamptz - clock_timestamp()))))::integer AS retry_after',
                    [pending[0].request_expires_at],
                );
                throw new AgentConnectionApprovalRequestError(
                    'pending_request_limit',
                    rows[0].retry_after,
                );
            }
            const [row] = await trx(table)
                .insert({
                    organization_uuid: input.organizationUuid,
                    subject_user_uuid: input.subjectUserUuid,
                    client_id: input.clientId,
                    name: input.name,
                    redirect_uri: input.redirectUri,
                    state: input.state,
                    code_challenge: input.codeChallenge,
                    resource: input.resource,
                    requested_projects:
                        input.requestedProjects === null
                            ? null
                            : JSON.stringify(input.requestedProjects),
                    requested_capabilities: JSON.stringify(
                        input.requestedCapabilities,
                    ),
                    expires_in_seconds: input.expiresInSeconds,
                    created_at: trx.raw('statement_timestamp()'),
                    request_expires_at: trx.raw(
                        "statement_timestamp() + interval '15 minutes'",
                    ),
                })
                .returning('*');
            return row;
        });
    }

    async findOwned(owner: Owner): Promise<DbAgentConnectionApprovalRequest> {
        return this.deps.database.transaction((trx) =>
            AgentConnectionApprovalRequestModel.lockOwned(trx, owner),
        );
    }

    async bindReview(
        args: Owner & {
            sessionId: string;
            nonce: string;
            selection: ApprovalSelection;
            policyVersion: number;
        },
    ): Promise<DbAgentConnectionApprovalRequest> {
        return this.deps.database.transaction(async (trx) => {
            const row = await AgentConnectionApprovalRequestModel.lockOwned(
                trx,
                args,
            );
            if (row.decision_consumed_at !== null)
                return fail('approval_request_consumed');
            if (!args.sessionId || !args.nonce) return fail('csrf_failed');
            AgentConnectionApprovalRequestModel.validateSelection(
                args.selection,
                row,
                null,
                true,
            );
            const [bound] = await trx(table)
                .where({
                    agent_connection_approval_request_uuid: args.requestUuid,
                })
                .where('request_expires_at', '>', trx.raw('clock_timestamp()'))
                .update({
                    review_session_hash: digest(args.sessionId),
                    csrf_hash: digest(args.nonce),
                    displayed_selection: args.selection,
                    displayed_policy_version: args.policyVersion,
                    review_revision: row.review_revision + 1,
                })
                .returning('*');
            if (!bound) return fail('approval_request_expired');
            return bound;
        });
    }

    async sealDecision(
        args: Owner & {
            sessionId: string;
            nonce: string;
            revision: number;
            decide: (
                row: DbAgentConnectionApprovalRequest,
                trx: Knex.Transaction,
            ) => Promise<ReviewDecision>;
        },
    ): Promise<DbAgentConnectionApprovalRequest> {
        return this.deps.database.transaction(async (trx) => {
            const row = await AgentConnectionApprovalRequestModel.lockOwned(
                trx,
                args,
            );
            if (row.decision_consumed_at !== null)
                return fail('approval_request_consumed');
            if (
                !matchesDigest(args.sessionId, row.review_session_hash) ||
                !matchesDigest(args.nonce, row.csrf_hash)
            )
                return fail('csrf_failed');
            if (args.revision !== row.review_revision)
                return fail('approval_selection_changed');
            const decision = await args.decide(row, trx);
            if (decision.decision === 'approve') {
                if (row.displayed_selection === null)
                    return fail('invalid_approval_request');
                AgentConnectionApprovalRequestModel.validateSelection(
                    decision.selection,
                    row,
                    row.displayed_selection,
                );
            }
            const [sealed] = await trx(table)
                .where({
                    agent_connection_approval_request_uuid: args.requestUuid,
                })
                .where('request_expires_at', '>', trx.raw('clock_timestamp()'))
                .update({
                    decision_consumed_at: trx.raw('statement_timestamp()'),
                    terminal_error:
                        decision.decision === 'approve'
                            ? 'agent_connections_unavailable'
                            : 'access_denied',
                    approved_selection:
                        decision.decision === 'approve'
                            ? decision.selection
                            : null,
                    approved_at:
                        decision.decision === 'approve'
                            ? trx.raw('statement_timestamp()')
                            : null,
                    approval_policy_version:
                        decision.decision === 'approve'
                            ? decision.policyVersion
                            : null,
                })
                .returning('*');
            if (!sealed) return fail('approval_request_expired');
            return sealed;
        });
    }

    async consumeCallback(
        args: Owner & { sessionId: string },
    ): Promise<DbAgentConnectionApprovalRequest> {
        return this.deps.database.transaction(async (trx) => {
            const row = await AgentConnectionApprovalRequestModel.lockOwned(
                trx,
                args,
            );
            if (!matchesDigest(args.sessionId, row.review_session_hash))
                return fail('csrf_failed');
            if (
                row.decision_consumed_at === null ||
                row.callback_consumed_at !== null
            )
                return fail('approval_request_consumed');
            const [consumed] = await trx(table)
                .where({
                    agent_connection_approval_request_uuid: args.requestUuid,
                })
                .where('request_expires_at', '>', trx.raw('clock_timestamp()'))
                .update({ callback_consumed_at: trx.raw('clock_timestamp()') })
                .returning('*');
            if (!consumed) return fail('approval_request_expired');
            return consumed;
        });
    }
}
