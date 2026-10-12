import { AgentCapability } from '@lightdash/common';
import knex, { type Knex } from 'knex';
import { createHash, randomUUID } from 'node:crypto';
import { AgentConnectionApprovalRequestModel } from '../../../models/AgentConnectionApprovalRequestModel';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';
import { type ApprovalSelection } from '../../entities/agentConnectionApprovalRequests';
import {
    down,
    up,
} from '../20261012000000_add_agent_connection_approval_requests';

let migrated: MigratedDatabase;
let second: Knex;
const table = 'agent_connection_approval_requests';
const sessionId = 'browser-session-sentinel';
const nonce = 'decision-nonce-sentinel';
const projectUuid = randomUUID();
const selection: ApprovalSelection = {
    approvedProjectUuids: [projectUuid],
    approvedCapabilities: [AgentCapability.Query],
    resourceConstraints: {
        version: 2,
        projectCapabilities: { [projectUuid]: [AgentCapability.Query] },
    },
};
beforeAll(async () => {
    migrated = await createMigratedDatabase();
    second = knex({
        client: 'pg',
        connection: migrated.connectionUri,
        pool: { min: 0, max: 2 },
    });
});
afterAll(async () => {
    await second?.destroy();
    await migrated?.destroy();
});
const fixture = async () => {
    const db = migrated.database;
    const [org] = await db('organizations')
        .insert({ organization_name: 'Approval storage test' })
        .returning('*');
    const [user] = await db('users')
        .insert({ first_name: 'Approval', last_name: 'Subject' } as never)
        .returning('*');
    const model = new AgentConnectionApprovalRequestModel({ database: db });
    const input = {
        organizationUuid: org.organization_uuid,
        subjectUserUuid: user.user_uuid,
        clientId: 'lightdash-cli',
        name: 'cli-review',
        redirectUri: 'http://localhost:34123/callback',
        state: 's'.repeat(43),
        codeChallenge: createHash('sha256')
            .update('verifier-sentinel')
            .digest('base64url'),
        resource: 'https://server.example/subpath',
        requestedProjects: null,
        requestedCapabilities: [
            AgentCapability.Query,
            AgentCapability.DeployUpload,
        ],
        expiresInSeconds: 1,
    };
    const row = await model.insertPending(input);
    const owner = {
        requestUuid: row.agent_connection_approval_request_uuid,
        organizationUuid: input.organizationUuid,
        subjectUserUuid: input.subjectUserUuid,
    };
    const bind = () =>
        model.bindReview({
            ...owner,
            sessionId,
            nonce,
            selection,
            policyVersion: 7,
        });
    const decide = (
        decision: 'approve' | 'deny',
        target = model,
        revision = 1,
    ) =>
        target.sealDecision({
            ...owner,
            sessionId,
            nonce,
            revision,
            decide: async () =>
                decision === 'approve'
                    ? { decision, selection, policyVersion: 7 }
                    : { decision },
        });
    return { db, model, input, row, owner, bind, decide, user, org };
};

test('creates an indexed, reversible table and uses a database deadline of fifteen minutes', async () => {
    const f = await fixture();
    expect(
        f.row.request_expires_at.getTime() - f.row.created_at.getTime(),
    ).toBe(900000);
    expect(f.row).toMatchObject({
        requested_projects: null,
        approved_selection: null,
        review_session_hash: null,
        csrf_hash: null,
        review_revision: 0,
    });
    const columns = await f.db(table).columnInfo();
    expect(Object.keys(columns).sort()).toEqual(
        [
            'agent_connection_approval_request_uuid',
            'organization_uuid',
            'subject_user_uuid',
            'client_id',
            'name',
            'redirect_uri',
            'state',
            'code_challenge',
            'resource',
            'requested_projects',
            'requested_capabilities',
            'expires_in_seconds',
            'created_at',
            'request_expires_at',
            'review_session_hash',
            'csrf_hash',
            'displayed_selection',
            'displayed_policy_version',
            'review_revision',
            'approved_selection',
            'approved_at',
            'approval_policy_version',
            'decision_consumed_at',
            'callback_consumed_at',
            'terminal_error',
        ].sort(),
    );
    const indexes = await f
        .db('pg_indexes')
        .where({ tablename: table })
        .select('indexdef');
    for (const key of [
        'organization_uuid',
        'subject_user_uuid',
        'client_id',
        'request_expires_at',
    ]) {
        expect(
            indexes.some(({ indexdef }) => indexdef.includes(`(${key}`)),
        ).toBe(true);
    }
    await f.db.transaction(down);
    expect(await f.db.schema.hasTable(table)).toBe(false);
    await f.db.transaction(up);
    expect(await f.db.schema.hasTable(table)).toBe(true);
});

test('stores only protocol data and digests and seals the exact version-two selection', async () => {
    const f = await fixture();
    const bound = await f.bind();
    expect(bound.review_session_hash).toEqual(
        createHash('sha256').update(sessionId).digest(),
    );
    expect(bound.csrf_hash).toEqual(
        createHash('sha256').update(nonce).digest(),
    );
    expect(bound.displayed_selection).toEqual(selection);
    const approved = await f.decide('approve');
    expect(approved).toMatchObject({
        approved_selection: selection,
        terminal_error: 'agent_connections_unavailable',
        approval_policy_version: 7,
    });
    expect(approved.approved_at).toEqual(approved.decision_consumed_at);
    const stored = JSON.stringify(
        await f.db(table).where({ subject_user_uuid: f.user.user_uuid }),
    );
    for (const secret of [
        sessionId,
        nonce,
        'verifier-sentinel',
        'PAT-sentinel',
        'proxy-sentinel',
    ])
        expect(stored).not.toContain(secret);
    await Promise.all(
        [
            'agent_connection_grants',
            'oauth2_authorization_codes',
            'oauth2_access_tokens',
            'oauth2_refresh_tokens',
        ].map(async (tokenTable) => {
            expect(
                await f
                    .db(tokenTable)
                    .where({ organization_uuid: f.org.organization_uuid })
                    .count('* as count')
                    .first(),
            ).toMatchObject({ count: '0' });
        }),
    );
});

test.each([
    ['approve', 'approve'],
    ['approve', 'deny'],
] as const)(
    'only one %s / %s decision wins across database clients',
    async (left, right) => {
        const f = await fixture();
        await f.bind();
        const outcomes = await Promise.allSettled([
            f.decide(left),
            f.decide(
                right,
                new AgentConnectionApprovalRequestModel({ database: second }),
            ),
        ]);
        expect(
            outcomes.filter(({ status }) => status === 'fulfilled'),
        ).toHaveLength(1);
        expect(
            outcomes.find(({ status }) => status === 'rejected'),
        ).toMatchObject({ reason: { code: 'approval_request_consumed' } });
        const final = await f.model.findOwned(f.owner);
        expect(final.terminal_error).toBe(
            outcomes[0].status === 'fulfilled' || right === 'approve'
                ? 'agent_connections_unavailable'
                : 'access_denied',
        );
    },
);

test('serializes the pending cap across clients and stops at five', async () => {
    const f = await fixture();
    const other = new AgentConnectionApprovalRequestModel({ database: second });
    const outcomes = await Promise.allSettled(
        Array.from({ length: 8 }, (_, index) =>
            (index % 2 ? other : f.model).insertPending(f.input),
        ),
    );
    expect(
        outcomes.filter(({ status }) => status === 'fulfilled'),
    ).toHaveLength(4);
    expect(outcomes.filter(({ status }) => status === 'rejected')).toEqual(
        Array.from({ length: 4 }, () =>
            expect.objectContaining({
                reason: expect.objectContaining({
                    code: 'pending_request_limit',
                    retryAfterSeconds: expect.any(Number),
                }),
            }),
        ),
    );
    await f.bind();
    await f.decide('deny');
    await expect(f.model.insertPending(f.input)).resolves.toBeDefined();
});

test('ignores application clock skew and refuses expired requests before cleanup', async () => {
    const f = await fixture();
    await f.bind();
    await f
        .db(table)
        .where({ agent_connection_approval_request_uuid: f.owner.requestUuid })
        .update({
            created_at: f.db.raw("clock_timestamp() - interval '16 minutes'"),
            request_expires_at: f.db.raw(
                "clock_timestamp() - interval '1 minute'",
            ),
        });
    vi.spyOn(Date, 'now').mockReturnValue(0);
    try {
        await expect(f.decide('approve')).rejects.toMatchObject({
            code: 'approval_request_expired',
        });
        await expect(f.model.findOwned(f.owner)).rejects.toMatchObject({
            code: 'approval_request_expired',
        });
        expect(
            await f
                .db(table)
                .where({
                    agent_connection_approval_request_uuid: f.owner.requestUuid,
                })
                .first(),
        ).toMatchObject({ decision_consumed_at: null });
        expect(await f.model.deleteExpiredBatch(1000)).toBe(0);
    } finally {
        vi.restoreAllMocks();
    }
});

test('cleanup is bounded, keeps live and recently expired rows, and insertion purges a bounded batch', async () => {
    const f = await fixture();
    await f.db(table).del();
    const base = {
        ...f.row,
        requested_projects: null,
        requested_capabilities: JSON.stringify(f.row.requested_capabilities),
    };
    const old = Array.from({ length: 105 }, () => ({
        ...base,
        agent_connection_approval_request_uuid: randomUUID(),
        created_at: new Date(Date.now() - 9000000),
        request_expires_at: new Date(Date.now() - 8000000),
    }));
    await f.db(table).insert(old);
    await f.db(table).insert(base);
    expect(await f.model.deleteExpiredBatch(2)).toBe(2);
    await f.model.insertPending(f.input);
    expect(await f.db(table).count('* as count').first()).toEqual({
        count: '5',
    });
    expect(await f.model.findOwned(f.owner)).toMatchObject({
        name: 'cli-review',
    });
    await expect(f.model.deleteExpiredBatch(1001)).rejects.toThrow();
});

test('requires owner, session, nonce and displayed revision without consuming on refusal', async () => {
    const f = await fixture();
    await f.bind();
    const args = {
        ...f.owner,
        sessionId,
        nonce,
        revision: 1,
        decide: async () => ({ decision: 'deny' as const }),
    };
    await Promise.all(
        [
            { subjectUserUuid: randomUUID() },
            { organizationUuid: randomUUID() },
            { sessionId: 'other' },
            { nonce: '' },
            { nonce: 'other' },
            { revision: 0 },
        ].map(async (overrides) => {
            await expect(
                f.model.sealDecision({ ...args, ...overrides }),
            ).rejects.toThrow();
            expect(
                (await f.model.findOwned(f.owner)).decision_consumed_at,
            ).toBeNull();
        }),
    );
    await f.bind();
    await expect(f.decide('approve')).rejects.toMatchObject({
        code: 'approval_selection_changed',
    });
    await expect(f.decide('approve', f.model, 2)).resolves.toBeDefined();
    await expect(f.bind()).rejects.toMatchObject({
        code: 'approval_request_consumed',
    });
});

test('denial and callback consumption are independent and each can happen only once', async () => {
    const f = await fixture();
    const args = { ...f.owner, sessionId };
    await expect(f.model.consumeCallback(args)).rejects.toThrow();
    await f.bind();
    await f.decide('deny');
    await expect(
        f.model.consumeCallback({ ...args, sessionId: 'other' }),
    ).rejects.toThrow();
    const outcomes = await Promise.allSettled([
        f.model.consumeCallback(args),
        new AgentConnectionApprovalRequestModel({
            database: second,
        }).consumeCallback(args),
    ]);
    expect(
        outcomes.filter(({ status }) => status === 'fulfilled'),
    ).toHaveLength(1);
    expect(await f.model.findOwned(f.owner)).toMatchObject({
        terminal_error: 'access_denied',
        approved_selection: null,
        callback_consumed_at: expect.any(Date),
    });
});

test('validates selections, allows zero actions, and refuses widening beyond request or display', async () => {
    const f = await fixture();
    await f.bind();
    const widened: ApprovalSelection = {
        ...selection,
        approvedCapabilities: [AgentCapability.DeployUpload],
        resourceConstraints: {
            version: 2,
            projectCapabilities: {
                [projectUuid]: [AgentCapability.DeployUpload],
            },
        },
    };
    const decide = (value: ApprovalSelection) =>
        f.model.sealDecision({
            ...f.owner,
            sessionId,
            nonce,
            revision: 1,
            decide: async () => ({
                decision: 'approve',
                selection: value,
                policyVersion: 7,
            }),
        });
    await expect(decide(widened)).rejects.toThrow();
    await expect(
        decide({ ...selection, approvedProjectUuids: [] }),
    ).rejects.toThrow();
    const empty: ApprovalSelection = {
        ...selection,
        approvedCapabilities: [],
        resourceConstraints: {
            version: 2,
            projectCapabilities: { [projectUuid]: [] },
        },
    };
    await expect(decide(empty)).resolves.toMatchObject({
        approved_selection: empty,
    });
    const restricted = await f.model.insertPending({
        ...f.input,
        requestedCapabilities: [],
        requestedProjects: [projectUuid],
    });
    await expect(
        f.model.bindReview({
            ...f.owner,
            requestUuid: restricted.agent_connection_approval_request_uuid,
            sessionId,
            nonce,
            selection,
            policyVersion: 7,
        }),
    ).rejects.toThrow();
});

test('rolls back a failed decision computation and checks expiry again before sealing', async () => {
    const f = await fixture();
    await f.bind();
    await expect(
        f.model.sealDecision({
            ...f.owner,
            sessionId,
            nonce,
            revision: 1,
            decide: async () => {
                throw new Error('fresh permission lookup failed');
            },
        }),
    ).rejects.toThrow('fresh permission lookup failed');
    expect((await f.model.findOwned(f.owner)).decision_consumed_at).toBeNull();
    await expect(
        f.model.sealDecision({
            ...f.owner,
            sessionId,
            nonce,
            revision: 1,
            decide: async (_row, trx) => {
                await trx(table)
                    .where({
                        agent_connection_approval_request_uuid:
                            f.owner.requestUuid,
                    })
                    .update({
                        created_at: trx.raw(
                            "clock_timestamp() - interval '16 minutes'",
                        ),
                        request_expires_at: trx.raw(
                            "clock_timestamp() - interval '1 minute'",
                        ),
                    });
                return { decision: 'approve', selection, policyVersion: 7 };
            },
        }),
    ).rejects.toMatchObject({ code: 'approval_request_expired' });
    expect((await f.model.findOwned(f.owner)).decision_consumed_at).toBeNull();
});

test.each(['users', 'organizations', 'oauth2_clients'] as const)(
    'deleting %s cascades its pending requests',
    async (parent) => {
        const f = await fixture();
        if (parent === 'users')
            await f.db(parent).where({ user_uuid: f.user.user_uuid }).del();
        if (parent === 'organizations')
            await f
                .db(parent)
                .where({ organization_uuid: f.org.organization_uuid })
                .del();
        if (parent === 'oauth2_clients')
            await f.db.transaction(async (trx) => {
                await trx(parent).where({ client_id: f.input.clientId }).del();
                expect(
                    await trx(table)
                        .where({
                            agent_connection_approval_request_uuid:
                                f.owner.requestUuid,
                        })
                        .first(),
                ).toBeUndefined();
                await trx.rollback();
            });
        else
            expect(
                await f
                    .db(table)
                    .where({
                        agent_connection_approval_request_uuid:
                            f.owner.requestUuid,
                    })
                    .first(),
            ).toBeUndefined();
    },
);

test('can display an empty answer and deny but cannot approve zero projects', async () => {
    const f = await fixture();
    const empty: ApprovalSelection = {
        approvedProjectUuids: [],
        approvedCapabilities: [],
        resourceConstraints: { version: 2, projectCapabilities: {} },
    };
    await f.model.bindReview({
        ...f.owner,
        sessionId,
        nonce,
        selection: empty,
        policyVersion: 0,
    });
    await expect(
        f.model.sealDecision({
            ...f.owner,
            sessionId,
            nonce,
            revision: 1,
            decide: async () => ({
                decision: 'approve',
                selection: empty,
                policyVersion: 0,
            }),
        }),
    ).rejects.toMatchObject({ code: 'invalid_approval_request' });
    await expect(f.decide('deny')).resolves.toMatchObject({
        terminal_error: 'access_denied',
    });
});

test('reads expiry after waiting for the row lock, not from the transaction start', async () => {
    const f = await fixture();
    await f.bind();
    const holder = await f.db.transaction();
    await holder(table)
        .where({ agent_connection_approval_request_uuid: f.owner.requestUuid })
        .forUpdate()
        .first();
    const waiting = new AgentConnectionApprovalRequestModel({
        database: second,
    });
    let started!: () => void;
    const issued = new Promise<void>((resolve) => {
        started = resolve;
    });
    const listener = (query: { sql: string }) => {
        if (query.sql.includes('for update')) started();
    };
    second.on('query', listener);
    const outcome = f.decide('approve', waiting).then(
        () => 'unexpected-success',
        (error: unknown) => error,
    );
    try {
        await issued;
        await holder(table)
            .where({
                agent_connection_approval_request_uuid: f.owner.requestUuid,
            })
            .update({
                created_at: holder.raw(
                    "clock_timestamp() - interval '16 minutes'",
                ),
                request_expires_at: holder.raw('clock_timestamp()'),
            });
        await holder.commit();
        expect(await outcome).toMatchObject({
            code: 'approval_request_expired',
        });
        expect(
            await f
                .db(table)
                .where({
                    agent_connection_approval_request_uuid: f.owner.requestUuid,
                })
                .first(),
        ).toMatchObject({ decision_consumed_at: null });
    } finally {
        second.removeListener('query', listener);
        if (!holder.isCompleted()) await holder.rollback();
    }
});

test('skips a locked expired row during cleanup', async () => {
    const f = await fixture();
    await f
        .db(table)
        .where({ agent_connection_approval_request_uuid: f.owner.requestUuid })
        .update({
            created_at: f.db.raw("clock_timestamp() - interval '2 hours'"),
            request_expires_at: f.db.raw(
                "clock_timestamp() - interval '90 minutes'",
            ),
        });
    const holder = await f.db.transaction();
    try {
        await holder(table)
            .where({
                agent_connection_approval_request_uuid: f.owner.requestUuid,
            })
            .forUpdate()
            .first();
        await new AgentConnectionApprovalRequestModel({
            database: second,
        }).deleteExpiredBatch();
        expect(
            await holder(table)
                .where({
                    agent_connection_approval_request_uuid: f.owner.requestUuid,
                })
                .first(),
        ).toBeDefined();
        await holder.commit();
        await f.model.deleteExpiredBatch();
        expect(
            await f
                .db(table)
                .where({
                    agent_connection_approval_request_uuid: f.owner.requestUuid,
                })
                .first(),
        ).toBeUndefined();
    } finally {
        if (!holder.isCompleted()) await holder.rollback();
    }
});

test('ignores extra credential material in its input and rejects malformed state transitions at the database boundary', async () => {
    const f = await fixture();
    const row = await f.model.insertPending({
        ...f.input,
        ...{
            personalAccessToken: 'PAT-sentinel',
            proxyCredential: 'proxy-sentinel',
            codeVerifier: 'verifier-sentinel',
        },
    });
    expect(JSON.stringify(row)).not.toMatch(
        /PAT-sentinel|proxy-sentinel|verifier-sentinel/,
    );
    const invalid = [
        { callback_consumed_at: new Date() },
        { decision_consumed_at: new Date(), terminal_error: 'access_denied' },
        { review_session_hash: Buffer.alloc(32) },
        { review_revision: -1 },
        { expires_in_seconds: 0 },
        { expires_in_seconds: 604801 },
        { name: 'Work laptop' },
        { state: 'short' },
        { code_challenge: 'short' },
        { requested_projects: '[]' },
    ];
    await Promise.all(
        invalid.map(async (changes) => {
            await expect(
                f
                    .db(table)
                    .where({
                        agent_connection_approval_request_uuid:
                            row.agent_connection_approval_request_uuid,
                    })
                    .update(changes as never),
            ).rejects.toThrow();
        }),
    );
});
