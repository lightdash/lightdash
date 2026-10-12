import { AgentCapability, ProjectMemberRole } from '@lightdash/common';
import { type ChildProcess } from 'node:child_process';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';
import {
    connectionFixture,
    matrix,
    seedConnectionClient,
} from './agentConnectionFixture.mock';
import {
    enableConnectionFlag,
    forEachInOrder,
    httpRequest,
    sessionCookie,
} from './agentConnectionHttpHarness.mock';
import {
    closeConnectionProcess,
    startConnectionProcess,
    type TestServer,
} from './agentConnectionProcessLifecycle.mock';

let migrated: MigratedDatabase;
const children: ChildProcess[] = [];
const cleanup = async () => {
    try {
        const results = await Promise.allSettled(
            children.map((child) => closeConnectionProcess(child)),
        );
        const failures = results.filter(
            (result) => result.status === 'rejected',
        );
        if (failures.length)
            throw new AggregateError(
                failures.map((result) => result.reason),
                'Child cleanup failed',
            );
    } finally {
        await migrated?.destroy();
    }
};
type CacheState = {
    kind: 'cache';
    hit: boolean;
    active: boolean | null;
    canViewProject: boolean | null;
    filledAt: number;
    expiresAt: number;
    ttlMs: number;
};
const cacheState = (
    server: TestServer,
    f: Awaited<ReturnType<typeof connectionFixture>>,
): Promise<CacheState> =>
    new Promise((resolve, reject) => {
        const disposers: (() => void)[] = [];
        const cleanupRead = () => disposers.forEach((dispose) => dispose());
        const failed = (error: Error) => {
            cleanupRead();
            reject(error);
        };
        const exited = () =>
            failed(new Error('Child exited during cache inspection'));
        const receive = (message: CacheState) => {
            if (message.kind === 'cache') {
                cleanupRead();
                resolve(message);
            }
        };
        const timeout = setTimeout(
            () => failed(new Error('Cache inspection timed out')),
            10000,
        );
        disposers.push(() => {
            clearTimeout(timeout);
            server.child.removeListener('message', receive);
            server.child.removeListener('exit', exited);
        });
        server.child.on('message', receive);
        server.child.once('exit', exited);
        server.child.send(
            {
                command: 'cache',
                userUuid: f.userUuid,
                organizationUuid: f.organizationUuid,
                projectUuid: f.projectUuid,
            },
            (error) => {
                if (error) failed(error);
            },
        );
    });
let first: TestServer;
let second: TestServer;
beforeAll(async () => {
    migrated = await createMigratedDatabase();
    await seedConnectionClient(migrated.database);
    first = await startConnectionProcess(migrated.connectionUri, children);
    second = await startConnectionProcess(migrated.connectionUri, children);
    expect(first.pid).not.toBe(second.pid);
    expect(first.databasePid).not.toBe(second.databasePid);
    expect(first.pid).not.toBe(process.pid);
});
afterAll(cleanup);
const warm = async (
    f: Awaited<ReturnType<typeof connectionFixture>>,
    token: string,
) => {
    const cookie = await sessionCookie(
        f.database,
        f.userUuid,
        f.organizationUuid,
    );
    const route = `/api/v1/projects/${f.projectUuid}`;
    await forEachInOrder([first, second], async (server) => {
        const session = await httpRequest(server.base, route, { cookie });
        expect(session.status).toBe(200);
        expect(await cacheState(server, f)).toMatchObject({
            hit: true,
            active: true,
            canViewProject: true,
        });
        const reply = await httpRequest(server.base, route, {
            authorization: `Bearer ${token}`,
        });
        expect(reply.status).toBe(200);
    });
    return { cookie, route };
};

it.each([
    'role lowered',
    'project removed',
    'group removed',
    'policy narrowed',
    'person deactivated',
    'person deleted',
    'connection revoked',
    'connection expired',
] as const)(
    '%s: refused on the next request on both servers, second server first',
    async (change) => {
        const f = await connectionFixture(migrated.database);
        await enableConnectionFlag(f.database, f.organizationUuid);
        await f
            .database('project_memberships')
            .where('user_id', f.user.user_id)
            .update({ role: ProjectMemberRole.DEVELOPER });
        await f.savePolicy({
            systemRoleMatrix: {
                ...matrix([]),
                developer: [AgentCapability.ReadDiscover],
            },
        });
        const [group] = await f
            .database('groups')
            .insert({
                organization_id: f.organization.organization_id,
                name: 'Connection admission',
                created_by_user_uuid: f.userUuid,
                updated_by_user_uuid: f.userUuid,
            })
            .returning('*');
        const [membership] = await f.groups.addGroupMembers(group.group_uuid, [
            f.userUuid,
        ]);
        await f.savePolicy({
            allowedGroupUuids: [group.group_uuid],
            systemRoleMatrix: {
                ...matrix([]),
                developer: [AgentCapability.ReadDiscover],
            },
        });
        const connection = await f.createConnection();
        const { route, cookie } = await warm(f, connection.accessToken);
        switch (change) {
            case 'role lowered':
                await f
                    .database('project_memberships')
                    .where('user_id', f.user.user_id)
                    .update({ role: ProjectMemberRole.VIEWER });
                break;
            case 'project removed':
                await f.projects.deleteProjectAccess(f.projectUuid, f.userUuid);
                break;
            case 'group removed':
                await f.groups.removeGroupMember(membership);
                break;
            case 'policy narrowed':
                await f.savePolicy({
                    allowedCapabilities: Object.values(AgentCapability).filter(
                        (capability) =>
                            capability !== AgentCapability.ReadDiscover,
                    ),
                    systemRoleMatrix: {
                        ...matrix([]),
                        developer: [AgentCapability.ReadDiscover],
                    },
                    allowedGroupUuids: [group.group_uuid],
                });
                break;
            case 'person deactivated':
                await f.users.updateUser(f.userUuid, undefined, {
                    isActive: false,
                });
                break;
            case 'person deleted':
                await f.users.delete(f.userUuid);
                break;
            case 'connection revoked':
                expect(
                    (
                        await httpRequest(
                            first.base,
                            `/api/v2/user/agent-connections/${connection.grant.grantUuid}`,
                            { cookie },
                            'DELETE',
                        )
                    ).status,
                ).toBe(200);
                break;
            case 'connection expired':
                await f.database.raw(
                    "UPDATE agent_connection_grants SET approved_at = clock_timestamp() - interval '2 minutes', expires_at = clock_timestamp() - interval '1 minute' WHERE agent_connection_grant_uuid = ?",
                    [connection.grant.grantUuid],
                );
                break;
            default:
                throw new Error('Unknown change');
        }
        await forEachInOrder([second, first], async (server) => {
            const response = await httpRequest(server.base, route, {
                authorization: `Bearer ${connection.accessToken}`,
            });
            expect(response.status).toBe(
                [
                    'person deactivated',
                    'person deleted',
                    'connection revoked',
                    'connection expired',
                ].includes(change)
                    ? 401
                    : 403,
            );
        });
    },
);

it('loads the person fresh for a connection while both stale caches still admit the same person session', async () => {
    const f = await connectionFixture(migrated.database);
    await enableConnectionFlag(f.database, f.organizationUuid);
    await f.savePolicy({
        systemRoleMatrix: {
            ...matrix([AgentCapability.ReadDiscover]),
            member: [AgentCapability.ReadDiscover],
        },
    });
    const connection = await f.createConnection();
    const { cookie, route } = await warm(f, connection.accessToken);
    const filled = await Promise.all(
        [first, second].map((server) => cacheState(server, f)),
    );
    await f.projects.deleteProjectAccess(f.projectUuid, f.userUuid);
    await expect(f.check()).resolves.toBeUndefined();
    await forEachInOrder([second, first], async (server) => {
        const before = filled[server === first ? 0 : 1];
        expect(await cacheState(server, f)).toEqual(before);
        expect(before).toMatchObject({
            hit: true,
            active: true,
            canViewProject: true,
        });
        const bearer = await httpRequest(server.base, route, {
            authorization: `Bearer ${connection.accessToken}`,
        });
        const session = await httpRequest(server.base, route, { cookie });
        expect(await cacheState(server, f)).toEqual(before);
        process.stdout.write(
            `Fresh-person isolation server ${server === second ? 'two' : 'one'}: bearer=${bearer.status}, session=${session.status}, cachedProjectAccess=${before.canViewProject}\n`,
        );
        expect
            .soft(
                bearer.status,
                'PRODUCTION FINDING if 200: connection used stale project access despite permissive agent policy',
            )
            .toBe(403);
        expect.soft(session.status).toBe(200);
    });
});

it('an ordinary session retains stale project access until its own cache expiry, with 5 seconds of expiry tolerance and no response-time upper bound', async () => {
    const f = await connectionFixture(migrated.database);
    await enableConnectionFlag(f.database, f.organizationUuid);
    const connection = await f.createConnection();
    const { cookie, route } = await warm(f, connection.accessToken);
    const filled = await cacheState(second, f);
    expect(filled.ttlMs).toBeGreaterThan(0);
    expect(filled.expiresAt - filled.filledAt).toBe(filled.ttlMs);
    await f.projects.deleteProjectAccess(f.projectUuid, f.userUuid);
    const changed = Date.now();
    expect(await cacheState(second, f)).toEqual(filled);
    expect(filled).toMatchObject({ hit: true, canViewProject: true });
    expect(
        (
            await httpRequest(second.base, route, {
                authorization: `Bearer ${connection.accessToken}`,
            })
        ).status,
    ).toBe(403);
    expect((await httpRequest(second.base, route, { cookie })).status).toBe(
        200,
    );
    expect(await cacheState(second, f)).toEqual(filled);
    await new Promise<void>((resolve) => {
        setTimeout(resolve, Math.max(0, filled.expiresAt + 5000 - Date.now()));
    });
    expect(await cacheState(second, f)).toMatchObject({
        hit: false,
        canViewProject: null,
    });
    expect((await httpRequest(second.base, route, { cookie })).status).toBe(
        403,
    );
    process.stdout.write(
        `Session cache: ttl=${filled.ttlMs}ms; filled=${filled.filledAt}; expiry=${filled.expiresAt}; refusal observed ${Date.now() - changed}ms after removal\n`,
    );
});
