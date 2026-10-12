import {
    AgentCapability,
    DeploySessionStatus,
    ProjectMemberRole,
} from '@lightdash/common';
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

// Known defect: a refused batch from the person marks the session failed. The fix flips that row.
it.each([
    { caller: 'connection', action: 'batch', session: 'unchanged' },
    { caller: 'connection', action: 'finalize', session: 'unchanged' },
    { caller: 'person session', action: 'batch', session: 'failed' },
    { caller: 'person session', action: 'finalize', session: 'unchanged' },
])(
    '$caller cannot $action through another approved project: staged data unchanged, session $session',
    async ({ caller, action, session }) => {
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
        const sessionBefore = await sessionModel.getSession(sessionUuid);
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
        const sessionAfter = await sessionModel.getSession(sessionUuid);
        if (session === 'unchanged')
            expect(sessionAfter).toEqual(sessionBefore);
        else {
            expect(sessionBefore.status).toBe(DeploySessionStatus.UPLOADING);
            expect(sessionAfter.status).toBe(DeploySessionStatus.FAILED);
        }
    },
);
