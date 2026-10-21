import {
    AgentCapability,
    DeploySessionStatus,
    ProjectMemberRole,
    ProjectType,
} from '@lightdash/common';
import { randomUUID } from 'node:crypto';
import { validExplore } from '../../../services/ProjectService/ProjectService.mock';
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
    startConnectionHttpServer,
} from './agentConnectionHttpHarness.mock';
import {
    assignDeployCustomRole,
    captureSql,
    databaseRows,
    deployFixture,
    deployRows,
    personHeaders,
    refused,
} from './deploySessionFixture.mock';
import { mainDeploySql } from './deploySessionSql.mock';

let migrated: MigratedDatabase;
let server: Awaited<ReturnType<typeof startConnectionHttpServer>>;
beforeAll(async () => {
    migrated = await createMigratedDatabase();
    await seedConnectionClient(migrated.database);
    server = await startConnectionHttpServer(migrated.database);
});
afterAll(async () => {
    await server?.close();
    await migrated?.destroy();
});

it.each(['another connection', 'person session'] as const)(
    'finishes the same staged deploy as %s after revoking the staging connection',
    async (finisher) => {
        const f = await connectionFixture(migrated.database);
        await enableConnectionFlag(f.database, f.organizationUuid);
        const capabilities = [AgentCapability.DeployUpload];
        await f
            .database('project_memberships')
            .where('user_id', f.user.user_id)
            .update({ role: ProjectMemberRole.DEVELOPER });
        await f.savePolicy({
            systemRoleMatrix: { ...matrix([]), developer: capabilities },
        });
        const first = await f.createConnection(capabilities);
        const second = await f.createConnection(capabilities);
        const firstHeaders = { authorization: `Bearer ${first.accessToken}` };
        const secondHeaders: Record<string, string> =
            finisher === 'another connection'
                ? { authorization: `Bearer ${second.accessToken}` }
                : {
                      cookie: await sessionCookie(
                          f.database,
                          f.userUuid,
                          f.organizationUuid,
                      ),
                  };
        const route = `/api/v2/projects/${f.projectUuid}/deploy`;
        const started = await httpRequest(
            server.base,
            route,
            firstHeaders,
            'POST',
            {},
        );
        expect(started.status).toBe(200);
        const sessionUuid = started.body.results.deploySessionUuid as string;
        const one = {
            ...validExplore,
            name: 'staged_by_first',
            label: 'First connection batch',
        };
        const two = {
            ...validExplore,
            name: 'staged_by_finisher',
            label: 'Finishing connection batch',
        };
        expect(
            await httpRequest(
                server.base,
                `${route}/${sessionUuid}/batch`,
                firstHeaders,
                'POST',
                { explores: [one], batchNumber: 1, complete: true },
            ),
        ).toEqual({
            status: 200,
            body: {
                status: 'ok',
                results: { batchNumber: 1, exploreCount: 1 },
            },
        });
        const stranger = await connectionFixture(
            migrated.database,
            f.organizationUuid,
        );
        await f.savePolicy({
            systemRoleMatrix: { ...matrix([]), developer: capabilities },
        });
        const [project] = await f
            .database('projects')
            .where('project_uuid', f.projectUuid);
        await f.database('project_memberships').insert({
            project_id: project.project_id,
            user_id: stranger.user.user_id,
            role: ProjectMemberRole.DEVELOPER,
        });
        const other = await stranger.createConnection(capabilities, [
            f.projectUuid,
        ]);
        const strangerHeaders = {
            authorization: `Bearer ${other.accessToken}`,
        };
        await forEachInOrder(['batch', 'finalize'], async (action) => {
            const response = await httpRequest(
                server.base,
                `${route}/${sessionUuid}/${action}`,
                strangerHeaders,
                'POST',
                { explores: [two], batchNumber: 2 },
            );
            expect(response.status).toBe(403);
        });
        expect(
            await server.models.getDeploySessionModel().getSession(sessionUuid),
        ).toMatchObject({
            userUuid: f.userUuid,
            projectUuid: f.projectUuid,
            status: DeploySessionStatus.UPLOADING,
            batchCount: 1,
        });
        await f.grants.revoke({
            grantUuid: first.grant.grantUuid,
            organizationUuid: f.organizationUuid,
            revokedByUserUuid: f.userUuid,
            reason: 'owner_revoked',
        });
        expect(
            await httpRequest(
                server.base,
                `${route}/${sessionUuid}/batch`,
                firstHeaders,
                'POST',
                { explores: [two], batchNumber: 2 },
            ),
        ).toEqual({ status: 401, body: { error: 'invalid_token' } });
        if (finisher === 'another connection') {
            expect(
                await httpRequest(
                    server.base,
                    `${route}/${sessionUuid}/batch`,
                    secondHeaders,
                    'POST',
                    { explores: [two], batchNumber: 2, complete: true },
                ),
            ).toEqual({
                status: 200,
                body: {
                    status: 'ok',
                    results: { batchNumber: 2, exploreCount: 1 },
                },
            });
        }
        const staged = finisher === 'another connection' ? [one, two] : [one];
        expect(
            await server.models
                .getDeploySessionModel()
                .getDeployData(sessionUuid),
        ).toEqual({
            explores: JSON.parse(JSON.stringify(staged)),
            complete: true,
        });
        const final = await httpRequest(
            server.base,
            `${route}/${sessionUuid}/finalize`,
            secondHeaders,
            'POST',
            { dbtModelNames: staged.map((explore) => explore.name) },
        );
        expect(final.status).toBe(200);
        expect(final.body.results).toMatchObject({
            exploreCount: staged.length,
            status: DeploySessionStatus.COMPLETED,
        });
        const cached = Object.values(
            await f.projects.getAllExploresFromCache(f.projectUuid),
        );
        expect(cached.sort((a, b) => a.name.localeCompare(b.name))).toEqual(
            JSON.parse(JSON.stringify(staged)).sort(
                (a: { name: string }, b: { name: string }) =>
                    a.name.localeCompare(b.name),
            ),
        );
        await expect(
            server.models.getDeploySessionModel().getSession(sessionUuid),
        ).rejects.toThrow('not found');
        expect(server.queued).toContainEqual({
            kind: 'generateValidation',
            args: expect.objectContaining({
                userUuid: f.userUuid,
                projectUuid: f.projectUuid,
            }),
        });
    },
);

it.each([
    { caller: 'connection', action: 'batch', session: 'unchanged' },
    { caller: 'connection', action: 'finalize', session: 'unchanged' },
    {
        caller: 'person session',
        action: 'batch',
        session: 'unchanged',
    },
    { caller: 'person session', action: 'finalize', session: 'unchanged' },
])(
    '$caller cannot $action through another approved project: staged data unchanged, session $session',
    async ({ caller, action }) => {
        const f = await connectionFixture(migrated.database);
        await enableConnectionFlag(f.database, f.organizationUuid);
        const secondProjectUuid = await f.createProject();
        const capabilities = [AgentCapability.DeployUpload];
        await f
            .database('project_memberships')
            .where('user_id', f.user.user_id)
            .update({ role: ProjectMemberRole.DEVELOPER });
        await f.savePolicy({
            systemRoleMatrix: { ...matrix([]), developer: capabilities },
        });
        const connection = await f.createConnection(capabilities, [
            f.projectUuid,
            secondProjectUuid,
        ]);
        const connectionHeaders = {
            authorization: `Bearer ${connection.accessToken}`,
        };
        const route = `/api/v2/projects/${f.projectUuid}/deploy`;
        const started = await httpRequest(
            server.base,
            route,
            connectionHeaders,
            'POST',
            {},
        );
        expect(started.status).toBe(200);
        const sessionUuid = started.body.results.deploySessionUuid as string;
        const staged = {
            ...validExplore,
            name: 'preserved_staging',
            label: 'Preserved staging',
        };
        expect(
            (
                await httpRequest(
                    server.base,
                    `${route}/${sessionUuid}/batch`,
                    connectionHeaders,
                    'POST',
                    { explores: [staged], batchNumber: 1, complete: true },
                )
            ).status,
        ).toBe(200);
        const sessionModel = server.models.getDeploySessionModel();
        const stagedBefore = await sessionModel.getDeployData(sessionUuid);
        const sessionBefore = await deployRows(f.database);
        const headers: Record<string, string> =
            caller === 'connection'
                ? connectionHeaders
                : {
                      cookie: await sessionCookie(
                          f.database,
                          f.userUuid,
                          f.organizationUuid,
                      ),
                  };
        const response = await httpRequest(
            server.base,
            `/api/v2/projects/${secondProjectUuid}/deploy/${sessionUuid}/${action}`,
            headers,
            'POST',
            {
                explores: [{ ...staged, name: 'wrong_project_batch' }],
                batchNumber: 2,
                dbtModelNames: [staged.name],
            },
        );
        expect(response.status).toBe(403);
        expect(await sessionModel.getDeployData(sessionUuid)).toEqual(
            stagedBefore,
        );
        expect(await deployRows(f.database)).toEqual(sessionBefore);
        const next = { ...staged, name: 'owner_next_batch' };
        expect(
            (
                await httpRequest(
                    server.base,
                    `${route}/${sessionUuid}/batch`,
                    headers,
                    'POST',
                    { explores: [next], batchNumber: 2, complete: true },
                )
            ).status,
        ).toBe(200);
        expect(
            (
                await httpRequest(
                    server.base,
                    `${route}/${sessionUuid}/finalize`,
                    headers,
                    'POST',
                    { dbtModelNames: [staged.name, next.name] },
                )
            ).status,
        ).toBe(200);
        expect(
            Object.values(
                await f.projects.getAllExploresFromCache(f.projectUuid),
            ).sort((a, b) => a.name.localeCompare(b.name)),
        ).toEqual(JSON.parse(JSON.stringify([next, staged])));
    },
);

const firstExplore = {
    ...validExplore,
    name: 'first_staged',
    label: 'First staged explore',
};
const secondExplore = {
    ...validExplore,
    name: 'second_staged',
    label: 'Second staged explore',
};

it.each(
    [
        'developer',
        'viewer',
        'no project access',
        'another organisation',
    ].flatMap((role) =>
        (['session', 'PAT'] as const).map((credential) => ({
            role,
            credential,
        })),
    ),
)(
    'refuses another person ($role / $credential) on batch and finalize without changing staging; the owner can finish',
    async ({ role, credential }) => {
        const f = await deployFixture(migrated.database, server);
        const stranger = await connectionFixture(
            migrated.database,
            role === 'another organisation' ? undefined : f.organizationUuid,
        );
        const [project] = await f
            .database('projects')
            .where('project_uuid', f.projectUuid);
        if (role === 'developer' || role === 'viewer')
            await f.database('project_memberships').insert({
                project_id: project.project_id,
                user_id: stranger.user.user_id,
                role:
                    role === 'developer'
                        ? ProjectMemberRole.DEVELOPER
                        : ProjectMemberRole.VIEWER,
            });
        const headers = await personHeaders(server, stranger, credential);
        const uuid = await f.start();
        await f.batch(uuid, firstExplore, 1);
        await forEachInOrder(['finalize', 'batch'], async (action) => {
            const before = await deployRows(f.database);
            const response = await httpRequest(
                server.base,
                `${f.route}/${uuid}/${action}`,
                headers,
                'POST',
                { explores: [secondExplore], batchNumber: 2 },
            );
            expect(response).toEqual(
                refused('Deploy session does not belong to this user'),
            );
            expect(await deployRows(f.database)).toEqual(before);
        });
        await f.batch(uuid, secondExplore, 2);
        await f.finish(uuid, [firstExplore, secondExplore]);
    },
);

it.each([
    DeploySessionStatus.FAILED,
    DeploySessionStatus.FINALIZING,
    DeploySessionStatus.COMPLETED,
])(
    'refuses batch and finalize for a stored %s session without changing any row',
    async (status) => {
        const f = await deployFixture(migrated.database, server);
        const uuid = await f.start();
        await f.batch(uuid, firstExplore, 1);
        await server.models.getDeploySessionModel().updateStatus(uuid, status);
        await f
            .database('project_memberships')
            .where('user_id', f.user.user_id)
            .update({ role: ProjectMemberRole.VIEWER });
        const before = await deployRows(f.database);
        await forEachInOrder(['finalize', 'batch'], async (action) => {
            expect(
                await f.request(`/${uuid}/${action}`, {
                    explores: [secondExplore],
                    batchNumber: 2,
                }),
            ).toEqual(refused('Deploy session is not in uploading state'));
            expect(await deployRows(f.database)).toEqual(before);
        });
    },
);

it.each(
    ['finalized', 'unknown', 'malformed'].flatMap((kind) =>
        ['batch', 'finalize'].map((action) => ({ kind, action })),
    ),
)(
    'pins the HTTP error for a $kind session UUID on $action without writing deploy rows',
    async ({ kind, action }) => {
        const f = await deployFixture(migrated.database, server);
        let uuid = kind === 'malformed' ? 'not-a-uuid' : randomUUID();
        if (kind === 'finalized') {
            uuid = await f.start();
            await f.batch(uuid, firstExplore, 1);
            await f.finish(uuid, [firstExplore]);
        }
        const before = await deployRows(f.database);
        const response = await f.request(`/${uuid}/${action}`, {
            explores: [secondExplore],
            batchNumber: 2,
        });
        expect(response).toEqual(
            kind === 'malformed'
                ? {
                      status: 500,
                      body: {
                          status: 'error',
                          error: {
                              statusCode: 500,
                              name: 'UnexpectedServerError',
                              message: 'Something went wrong.',
                              data: {},
                          },
                      },
                  }
                : {
                      status: 404,
                      body: {
                          status: 'error',
                          error: {
                              statusCode: 404,
                              name: 'NotFoundError',
                              message: `Deploy session ${uuid} not found`,
                              data: {},
                          },
                      },
                  },
        );
        expect(await deployRows(f.database)).toEqual(before);
    },
);

it('still fails the session and rethrows a real database error inside addBatch', async () => {
    const f = await deployFixture(migrated.database, server);
    const uuid = await f.start();
    await f.batch(uuid, firstExplore, 1);
    const before = await deployRows(f.database);
    const addBatch = vi.spyOn(
        server.models.getDeploySessionModel(),
        'addBatch',
    );
    const addDeployBatch = vi.spyOn(
        server.services.getDeployService(),
        'addDeployBatch',
    );
    try {
        const response = await f.request(`/${uuid}/batch`, {
            explores: [secondExplore],
            batchNumber: null,
        });
        expect(response.status).toBe(500);
        expect(addBatch).toHaveBeenCalledTimes(1);
        await expect(addBatch.mock.results[0].value).rejects.toMatchObject({
            code: '23502',
        });
        const databaseError = await addBatch.mock.results[0].value.catch(
            (error: unknown) => error,
        );
        await expect(addDeployBatch.mock.results[0].value).rejects.toBe(
            databaseError,
        );
        const after = await deployRows(f.database);
        expect(after.batches).toEqual(before.batches);
        expect(after.sessions).toEqual(
            before.sessions.map((row) =>
                row.deploy_session_uuid === uuid
                    ? { ...row, status: DeploySessionStatus.FAILED }
                    : row,
            ),
        );
    } finally {
        addBatch.mockRestore();
        addDeployBatch.mockRestore();
    }
});

it.each(['one-shot PUT /deploy', 'start POST /deploy'])(
    'four-route permissions: %s refuses a viewer without changing deploy rows or project data',
    async (route) => {
        const f = await deployFixture(migrated.database, server);
        const uuid = await f.start();
        await f.batch(uuid, firstExplore, 1);
        await f
            .database('project_memberships')
            .where('user_id', f.user.user_id)
            .update({ role: ProjectMemberRole.VIEWER });
        const before = await deployRows(f.database);
        const visibleBefore = await databaseRows(f.database);
        expect(
            await f.request(
                '',
                {
                    explores: [secondExplore],
                    complete: true,
                    dbtModelNames: [secondExplore.name],
                },
                route.startsWith('one-shot') ? 'PUT' : 'POST',
            ),
        ).toEqual(
            refused('User does not have permission to deploy to this project'),
        );
        expect(await deployRows(f.database)).toEqual(before);
        expect(await databaseRows(f.database)).toEqual(visibleBefore);
    },
);

it('four-route permissions: one-shot PUT /deploy allows a developer and publishes the explores', async () => {
    const f = await deployFixture(migrated.database, server);
    expect(
        await f.request(
            '',
            {
                explores: [firstExplore],
                complete: true,
                dbtModelNames: [firstExplore.name],
            },
            'PUT',
        ),
    ).toMatchObject({
        status: 200,
        body: { status: 'ok', results: { exploreCount: 1 } },
    });
    expect(
        Object.values(await f.projects.getAllExploresFromCache(f.projectUuid)),
    ).toEqual(JSON.parse(JSON.stringify([firstExplore])));
});

it.each(['viewer', 'removed'])(
    'the deploy permission is checked at start and at finalize; batches rely on ownership (%s)',
    async (access) => {
        const f = await deployFixture(migrated.database, server);
        await f.request(
            '',
            {
                explores: [validExplore],
                complete: true,
                dbtModelNames: [validExplore.name],
            },
            'PUT',
        );
        const published = await f.projects.getAllExploresFromCache(
            f.projectUuid,
        );
        expect(Object.values(published)).toHaveLength(1);
        const uuid = await f.start();
        const membership = f
            .database('project_memberships')
            .where('user_id', f.user.user_id);
        const memberships = await membership.clone();
        if (access === 'viewer')
            await membership.update({ role: ProjectMemberRole.VIEWER });
        else await membership.delete();
        expect(await f.request('')).toEqual(
            refused('User does not have permission to deploy to this project'),
        );
        await f.batch(uuid, firstExplore, 1);
        await f.batch(uuid, secondExplore, 2);
        const before = await deployRows(f.database);
        const visibleBefore = await databaseRows(f.database);
        const queuedBefore = [...server.queued];
        expect(await f.request(`/${uuid}/finalize`)).toEqual(
            refused('User does not have permission to deploy to this project'),
        );
        expect(await deployRows(f.database)).toEqual(before);
        expect(await databaseRows(f.database)).toEqual(visibleBefore);
        expect(await f.projects.getAllExploresFromCache(f.projectUuid)).toEqual(
            published,
        );
        expect(server.queued).toEqual(queuedBefore);
        expect(
            await server.models.getDeploySessionModel().getSession(uuid),
        ).toMatchObject({
            status: DeploySessionStatus.UPLOADING,
            batchCount: 2,
            exploreCount: 2,
        });
        if (access === 'viewer')
            await f
                .database('project_memberships')
                .where('user_id', f.user.user_id)
                .update({ role: ProjectMemberRole.DEVELOPER });
        else await f.database('project_memberships').insert(memberships);
        await f.finish(uuid, [firstExplore, secondExplore]);
    },
);

it('start and two batches change only deploy staging, leaving every project-visible table and the catalog unchanged until finalize', async () => {
    const f = await deployFixture(migrated.database, server);
    const published = {
        ...validExplore,
        name: 'published',
        label: 'Visible before deploy',
    };
    expect(
        (
            await f.request(
                '',
                {
                    explores: [published],
                    complete: true,
                    dbtModelNames: [published.name],
                },
                'PUT',
            )
        ).status,
    ).toBe(200);
    const cacheBefore = await f.projects.getAllExploresFromCache(f.projectUuid);
    const indexed = await server.models
        .getCatalogModel()
        .indexCatalog(f.projectUuid, cacheBefore, [], f.userUuid);
    expect(indexed.catalogInserts.length).toBeGreaterThan(0);
    const before = await databaseRows(f.database);
    const queuedBefore = [...server.queued];
    const uuid = await f.start();
    await f.batch(uuid, firstExplore, 1);
    await f.batch(uuid, secondExplore, 2);
    expect(await databaseRows(f.database)).toEqual(before);
    expect(await f.projects.getAllExploresFromCache(f.projectUuid)).toEqual(
        cacheBefore,
    );
    expect(server.queued).toEqual(queuedBefore);
    expect(
        await server.models.getDeploySessionModel().getSession(uuid),
    ).toMatchObject({
        status: DeploySessionStatus.UPLOADING,
        batchCount: 2,
        exploreCount: 2,
    });
    expect(
        await server.models.getDeploySessionModel().getDeployData(uuid),
    ).toEqual({
        explores: JSON.parse(JSON.stringify([firstExplore, secondExplore])),
        complete: true,
    });
    await f.finish(uuid, [firstExplore, secondExplore]);
});

it('keeps the part 1 SQL order and HTTP answers with exactly one project summary read, and no credential read, before finalize writes', async () => {
    const f = await deployFixture(migrated.database, server);
    const trace = captureSql(f.database);
    try {
        const uuid = await f.start();
        await f.batch(uuid, firstExplore, 1);
        await f.batch(uuid, secondExplore, 2);
        expect(
            await f.request(`/${uuid}/finalize`, {
                dbtModelNames: [firstExplore.name, secondExplore.name],
            }),
        ).toEqual({
            status: 200,
            body: {
                status: 'ok',
                results: {
                    exploreCount: 2,
                    warnings: {
                        warningCount: 0,
                        warningExploreCount: 0,
                        exploresWithWarnings: [],
                    },
                    status: DeploySessionStatus.COMPLETED,
                },
            },
        });
    } finally {
        trace.stop();
    }
    expect(mainDeploySql).toHaveLength(84);
    expect(mainDeploySql[56]).toMatch(/^select .* from "projects" /);
    expect(mainDeploySql[56]).not.toMatch(
        /dbt_connection|encrypted_credentials|warehouse_credentials/,
    );
    expect(mainDeploySql[55]).toBe(
        'select * from "deploy_sessions" where "deploy_session_uuid" = $1 limit $2',
    );
    expect(mainDeploySql[57]).toBe(
        'update "deploy_sessions" set "status" = $1 where "deploy_session_uuid" = $2',
    );
    expect(mainDeploySql[58]).toBe(mainDeploySql[10]);
    expect(trace.statements).toEqual(mainDeploySql);
});

it.each(['session', 'PAT'] as const)(
    'refuses an ordinary owner batch and finalize through another deployable project (%s); the owner can still finish',
    async (credential) => {
        const f = await deployFixture(migrated.database, server, credential);
        const otherProject = await f.createProject();
        await f
            .database('project_memberships')
            .where('user_id', f.user.user_id)
            .update({ role: ProjectMemberRole.DEVELOPER });
        const uuid = await f.start();
        await f.batch(uuid, firstExplore, 1);
        const before = await deployRows(f.database);
        await forEachInOrder(['batch', 'finalize'], async (action) => {
            expect(
                await httpRequest(
                    server.base,
                    `/api/v2/projects/${otherProject}/deploy/${uuid}/${action}`,
                    f.headers,
                    'POST',
                    { explores: [secondExplore], batchNumber: 2 },
                ),
            ).toEqual(
                refused('Deploy session does not belong to this project'),
            );
            expect(await deployRows(f.database)).toEqual(before);
        });
        await f.batch(uuid, secondExplore, 2);
        await f.finish(uuid, [firstExplore, secondExplore]);
    },
);

it.each(['deactivated', 'removed from organisation'])(
    'refuses finalize for a person %s before entering the deploy service',
    async (change) => {
        const f = await deployFixture(migrated.database, server);
        const uuid = await f.start();
        await f.batch(uuid, firstExplore, 1);
        if (change === 'deactivated')
            await f
                .database('users')
                .where('user_id', f.user.user_id)
                .update({ is_active: false });
        else
            await f
                .database('organization_memberships')
                .where('user_id', f.user.user_id)
                .delete();
        const before = await deployRows(f.database);
        const visibleBefore = await databaseRows(f.database);
        const queuedBefore = [...server.queued];
        const finalize = vi.spyOn(
            server.services.getDeployService(),
            'finalizeDeploy',
        );
        try {
            expect(await f.request(`/${uuid}/finalize`)).toEqual({
                status: change === 'deactivated' ? 403 : 404,
                body: {
                    status: 'error',
                    error: {
                        statusCode: change === 'deactivated' ? 403 : 404,
                        name:
                            change === 'deactivated'
                                ? 'DeactivatedAccountError'
                                : 'InvalidUser',
                        message:
                            change === 'deactivated'
                                ? 'Your account has been deactivated. Please contact your organization administrator.'
                                : `Cannot find user with uuid ${f.userUuid} and org ${f.organizationUuid}`,
                        data: {},
                    },
                },
            });
            expect(finalize).not.toHaveBeenCalled();
            expect(await deployRows(f.database)).toEqual(before);
            expect(await databaseRows(f.database)).toEqual(visibleBefore);
            expect(server.queued).toEqual(queuedBefore);
        } finally {
            finalize.mockRestore();
        }
    },
);

it('refuses finalize after the custom role loses manage:DeployProject and permits the same session after restoration', async () => {
    const f = await deployFixture(migrated.database, server);
    const roleUuid = await assignDeployCustomRole(f, [
        'view:Project',
        'manage:DeployProject',
    ]);
    const uuid = await f.start();
    await f.batch(uuid, firstExplore, 1);
    const scope = { role_uuid: roleUuid, scope_name: 'manage:DeployProject' };
    await f.database('scoped_roles').where(scope).delete();
    const before = await deployRows(f.database);
    const visibleBefore = await databaseRows(f.database);
    const queuedBefore = [...server.queued];
    expect(await f.request(`/${uuid}/finalize`)).toEqual(
        refused('User does not have permission to deploy to this project'),
    );
    expect(await deployRows(f.database)).toEqual(before);
    expect(await databaseRows(f.database)).toEqual(visibleBefore);
    expect(server.queued).toEqual(queuedBefore);
    await f
        .database('scoped_roles')
        .insert({ ...scope, granted_by: f.userUuid });
    await f.finish(uuid, [firstExplore]);
});

it('permits preview finalize through manage:DeployProject@self and refuses a non-creator with the same scope at start', async () => {
    const f = await deployFixture(migrated.database, server);
    const upstream = await f.createProject();
    const scopes = ['view:Project', 'manage:DeployProject@self'];
    await assignDeployCustomRole(f, scopes, upstream);
    await f.database.raw(
        'update projects set project_type = ?, copied_from_project_uuid = ? where project_uuid = ?',
        [ProjectType.PREVIEW, upstream, f.projectUuid],
    );
    const [preview] = await f
        .database('projects')
        .where('project_uuid', f.projectUuid);
    await f
        .database('project_memberships')
        .where({ user_id: f.user.user_id, project_id: preview.project_id })
        .update({ role: ProjectMemberRole.VIEWER });
    const stranger = await connectionFixture(f.database, f.organizationUuid);
    await assignDeployCustomRole(stranger, scopes, upstream);
    await f.database('project_memberships').insert({
        project_id: preview.project_id,
        user_id: stranger.user.user_id,
        role: ProjectMemberRole.VIEWER,
    });
    const strangerHeaders = await personHeaders(server, stranger, 'session');
    const before = await deployRows(f.database);
    expect(
        await httpRequest(server.base, f.route, strangerHeaders, 'POST', {}),
    ).toEqual(
        refused('User does not have permission to deploy to this project'),
    );
    expect(await deployRows(f.database)).toEqual(before);
    const uuid = await f.start();
    await f.batch(uuid, firstExplore, 1);
    await f.finish(uuid, [firstExplore]);
});

it('refuses a connection finalize when its person loses the deploy role without changing staging or publishing', async () => {
    const f = await deployFixture(migrated.database, server);
    await enableConnectionFlag(f.database, f.organizationUuid);
    const capabilities = [AgentCapability.DeployUpload];
    await f.savePolicy({
        systemRoleMatrix: { ...matrix([]), developer: capabilities },
    });
    const connection = await f.createConnection(capabilities);
    const headers = { authorization: `Bearer ${connection.accessToken}` };
    const started = await httpRequest(
        server.base,
        f.route,
        headers,
        'POST',
        {},
    );
    expect(started.status).toBe(200);
    const uuid = started.body.results.deploySessionUuid as string;
    await f.batch(uuid, firstExplore, 1);
    await f
        .database('project_memberships')
        .where('user_id', f.user.user_id)
        .update({ role: ProjectMemberRole.VIEWER });
    const before = await deployRows(f.database);
    const visibleBefore = await databaseRows(f.database);
    const queuedBefore = [...server.queued];
    const finalize = vi.spyOn(
        server.services.getDeployService(),
        'finalizeDeploy',
    );
    try {
        const response = await httpRequest(
            server.base,
            `${f.route}/${uuid}/finalize`,
            headers,
            'POST',
            {},
        );
        expect(response).toMatchObject({
            status: 403,
            body: {
                status: 'error',
                error: {
                    statusCode: 403,
                    name: 'ForbiddenError',
                    message:
                        "Your organization's agent permissions do not allow Deploy and upload. Ask an admin to change Permissions on the Agents page.",
                    data: {
                        reason: 'agent_capability_denied',
                        policyLayer: 'org_ceiling',
                        capability: 'deploy_upload',
                    },
                },
            },
        });
        expect(finalize).not.toHaveBeenCalled();
        expect(await deployRows(f.database)).toEqual(before);
        expect(await databaseRows(f.database)).toEqual({
            ...visibleBefore,
            agent_action_log: expect.any(Array),
            agent_connection_grants: expect.any(Array),
        });
        expect(
            await f
                .database('agent_action_log')
                .where('organization_uuid', f.organizationUuid),
        ).toEqual([
            expect.objectContaining({
                outcome: 'denied',
                policy_layer: 'org_ceiling',
                reason_code: 'agent_capability_denied',
                capability: 'deploy_upload',
            }),
        ]);
        expect(server.queued).toEqual(queuedBefore);
    } finally {
        finalize.mockRestore();
    }
});
