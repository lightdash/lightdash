import { AgentCapability, ProjectMemberRole } from '@lightdash/common';
import { fork, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';
import {
    connectionFixture,
    matrix,
    seedConnectionClient,
} from './agentConnectionFixture';
import {
    enableConnectionFlag,
    forEachInOrder,
    httpRequest,
    sessionCookie,
} from './agentConnectionHttpHarness';

type TestServer = {
    child: ChildProcess;
    base: string;
    pid: number;
    databasePid: number;
};
const start = (connectionUri: string): Promise<TestServer> =>
    new Promise((resolve, reject) => {
        const child = fork(
            path.join(__dirname, 'agentConnectionHttpProcess.ts'),
            [],
            {
                execArgv: ['--import', require.resolve('tsx')],
                env: {
                    ...process.env,
                    EXPERIMENTAL_CACHE: 'true',
                    AGENT_TEST_DATABASE_URI: connectionUri,
                },
                stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
            },
        );
        let output = '';
        child.stdout?.on('data', (data) => {
            output += String(data);
        });
        child.stderr?.on('data', (data) => {
            output += String(data);
        });
        const timeout = setTimeout(() => {
            child.kill();
            reject(new Error(`Child did not start: ${output.slice(-6000)}`));
        }, 60000);
        child.once('error', reject);
        child.once('exit', (code) => {
            clearTimeout(timeout);
            if (code !== 0)
                reject(
                    new Error(`Child exited ${code}: ${output.slice(-6000)}`),
                );
        });
        child.on(
            'message',
            (message: {
                kind: string;
                base: string;
                pid: number;
                databasePid: number;
            }) => {
                if (message.kind === 'ready') {
                    clearTimeout(timeout);
                    resolve({ child, ...message });
                }
            },
        );
    });
let migrated: MigratedDatabase;
let first: TestServer;
let second: TestServer;
beforeAll(async () => {
    migrated = await createMigratedDatabase();
    await seedConnectionClient(migrated.database);
    first = await start(migrated.connectionUri);
    second = await start(migrated.connectionUri);
    expect(first.pid).not.toBe(second.pid);
    expect(first.databasePid).not.toBe(second.databasePid);
    expect(first.pid).not.toBe(process.pid);
});
afterAll(async () => {
    await forEachInOrder([first, second], async (server) => {
        if (server?.child.connected) {
            const exited = once(server.child, 'exit');
            server.child.send({ command: 'close' });
            await exited;
        }
    });
    await migrated?.destroy();
});
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
        const cached = once(server.child, 'message');
        server.child.send({
            command: 'cache',
            userUuid: f.userUuid,
            organizationUuid: f.organizationUuid,
        });
        expect((await cached)[0]).toEqual({
            kind: 'cache',
            hit: true,
            active: true,
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
    'both warm processes see %s on their next bound-token request, second server first',
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

it('an ordinary session on server two retains project access until its independent 30-second cache expires', async () => {
    const f = await connectionFixture(migrated.database);
    await enableConnectionFlag(f.database, f.organizationUuid);
    const connection = await f.createConnection();
    const started = Date.now();
    const { cookie, route } = await warm(f, connection.accessToken);
    await f.projects.deleteProjectAccess(f.projectUuid, f.userUuid);
    const changed = Date.now();
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
    const waitForRefusal = async (): ReturnType<typeof httpRequest> => {
        const response = await httpRequest(second.base, route, { cookie });
        if (response.status !== 200 || Date.now() - changed >= 33000)
            return response;
        await new Promise<void>((resolve) => {
            setTimeout(resolve, 250);
        });
        return waitForRefusal();
    };
    const response = await waitForRefusal();
    const elapsed = Date.now() - changed;
    expect(response.status).toBe(403);
    expect(elapsed).toBeGreaterThanOrEqual(29500 - (changed - started));
    expect(elapsed).toBeLessThan(33000);
    process.stdout.write(
        `Ordinary session cache delay after committed project removal: ${elapsed}ms; warm-up: ${changed - started}ms\n`,
    );
});
