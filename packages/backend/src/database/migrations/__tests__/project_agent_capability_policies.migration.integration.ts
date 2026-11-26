import { AgentCapability } from '@lightdash/common';
import { AgentCapabilityPolicyModel } from '../../../models/AgentCapabilityPolicyModel';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';
import {
    down,
    up,
} from '../20261125130000_add_project_agent_capability_policies';

let migrated: MigratedDatabase;
beforeAll(async () => {
    migrated = await createMigratedDatabase();
});
afterAll(async () => {
    await migrated?.destroy();
});

const table = 'project_agent_capability_policies';

test('creates the project restrictions table and reverses it', async () => {
    await migrated.database.transaction(async (trx) => {
        await down(trx);
        expect(await trx.schema.hasTable(table)).toBe(false);
        await up(trx);
        expect(await trx.schema.hasTable(table)).toBe(true);
    });
});

test('stores one set of restrictions per project, scoped to its organization', async () => {
    const { database } = migrated;
    const model = new AgentCapabilityPolicyModel({ database });
    const [org, other] = await database('organizations')
        .insert([
            { organization_name: 'Project restrictions' },
            { organization_name: 'Another organization' },
        ])
        .returning(['organization_id', 'organization_uuid']);
    const projects = await database('projects')
        .insert(
            [
                { name: 'B restricted', organization_id: org.organization_id },
                { name: 'A open', organization_id: org.organization_id },
                { name: 'Elsewhere', organization_id: other.organization_id },
            ].map((project) => ({
                ...project,
                dbt_connection: null,
            })) as never,
        )
        .returning(['project_uuid', 'name']);
    const uuid = (name: string) =>
        projects.find((project) => project.name === name)!.project_uuid;

    await model.saveProjectPolicy({
        projectUuid: uuid('B restricted'),
        allowedCapabilities: [AgentCapability.Query, AgentCapability.RawSql],
        updatedByUserUuid: null,
    });
    await model.saveProjectPolicy({
        projectUuid: uuid('B restricted'),
        allowedCapabilities: [AgentCapability.Query],
        updatedByUserUuid: null,
    });
    await model.saveProjectPolicy({
        projectUuid: uuid('A open'),
        allowedCapabilities: null,
        updatedByUserUuid: null,
    });
    await model.saveProjectPolicy({
        projectUuid: uuid('Elsewhere'),
        allowedCapabilities: [],
        updatedByUserUuid: null,
    });

    expect(await model.getProjectPolicies(org.organization_uuid)).toEqual([
        { projectUuid: uuid('A open'), allowedCapabilities: null },
        {
            projectUuid: uuid('B restricted'),
            allowedCapabilities: [AgentCapability.Query],
        },
    ]);

    await model.deleteProjectPolicy(uuid('B restricted'));
    await database('projects').where('project_uuid', uuid('A open')).delete();
    expect(await model.getProjectPolicies(org.organization_uuid)).toEqual([]);
    expect(await model.getProjectPolicies(other.organization_uuid)).toEqual([
        { projectUuid: uuid('Elsewhere'), allowedCapabilities: [] },
    ]);
});
