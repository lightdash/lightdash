import {
    InlineErrorType,
    ProjectType,
    SupportedDbtVersions,
    type ExploreError,
} from '@lightdash/common';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../../testing/migratedDatabase';
import { SemanticStudioWorkspaceModel } from '../../../models/SemanticStudioWorkspaceModel';
import {
    down,
    up,
} from '../20261118200000_create_semantic_studio_branch_compiles';

const explore = (name: string): ExploreError => ({
    name,
    label: name,
    errors: [{ type: InlineErrorType.METADATA_PARSE_ERROR, message: name }],
});

let migrated: MigratedDatabase;
beforeAll(async () => {
    migrated = await createMigratedDatabase();
});
afterAll(async () => {
    await migrated?.destroy();
});

it('keeps only the latest request, keeps good explores through a failure, and drops finished changes', async () => {
    const { database } = migrated;
    const [org] = await database('organizations')
        .insert({ organization_name: 'Branch compile test' })
        .returning('*');
    const [project] = await database('projects')
        .insert({
            name: 'Project',
            organization_id: org.organization_id,
            project_type: ProjectType.DEFAULT,
            dbt_connection: null,
            dbt_connection_type: null,
            dbt_version: SupportedDbtVersions.V1_7,
            copied_from_project_uuid: null,
            created_by_user_uuid: null,
            organization_warehouse_credentials_uuid: null,
        })
        .returning('*');
    const [workspace] = await database('semantic_studio_workspaces')
        .insert({
            organization_uuid: org.organization_uuid,
            project_uuid: project.project_uuid,
            created_by_user_uuid: null,
            ai_thread_uuid: null,
            name: 'A change',
            is_active: true,
        })
        .returning('*');
    const workspaceUuid = workspace.semantic_studio_workspace_uuid;
    const model = new SemanticStudioWorkspaceModel({ database });

    const first = await model.requestBranchCompile(workspaceUuid, false);
    const second = await model.requestBranchCompile(workspaceUuid, false);
    expect(
        await model.finishBranchCompile(workspaceUuid, first, {
            status: 'ready',
            branch: 'old',
            explores: [explore('old')],
        }),
    ).toBe(false);
    expect(
        await model.finishBranchCompile(workspaceUuid, second, {
            status: 'ready',
            branch: 'change',
            explores: [explore('orders')],
        }),
    ).toBe(true);

    const third = await model.requestBranchCompile(workspaceUuid, true);
    expect(await model.findBranchCompile(workspaceUuid)).toMatchObject({
        status: 'compiling',
        error: null,
        explores: [explore('orders')],
    });
    await model.finishBranchCompile(workspaceUuid, third, {
        status: 'failed',
        branch: 'change',
        error: 'Compilation Error',
    });
    expect(await model.findBranchCompile(workspaceUuid)).toMatchObject({
        status: 'failed',
        branch: 'change',
        error: 'Compilation Error',
        explores: [explore('orders')],
    });
    expect(await model.claimBranchCompileFollowUp(workspaceUuid, second)).toBe(
        false,
    );
    expect(await model.claimBranchCompileFollowUp(workspaceUuid, third)).toBe(
        true,
    );
    expect(await model.claimBranchCompileFollowUp(workspaceUuid, third)).toBe(
        false,
    );
    await model.requestBranchCompile(workspaceUuid, true);
    expect(await model.findBranchCompile(workspaceUuid)).toMatchObject({
        requestedByAgent: true,
    });
    expect(
        await database('semantic_studio_branch_compiles')
            .where('semantic_studio_workspace_uuid', workspaceUuid)
            .first(),
    ).toMatchObject({ follow_up_claimed_at: null });

    await model.deleteFinishedBranchCompiles(project.project_uuid);
    expect(await model.findBranchCompile(workspaceUuid)).not.toBeNull();
    await database('semantic_studio_workspaces')
        .where('semantic_studio_workspace_uuid', workspaceUuid)
        .update({ finished_at: database.fn.now(), is_active: false });
    await model.deleteFinishedBranchCompiles(project.project_uuid);
    expect(await model.findBranchCompile(workspaceUuid)).toBeNull();
});

it('rolls back and forward', async () => {
    const { database } = migrated;
    await database.transaction((trx) => down(trx));
    expect(
        await database.schema.hasTable('semantic_studio_branch_compiles'),
    ).toBe(false);
    await database.transaction((trx) => up(trx));
    expect(
        await database.schema.hasTable('semantic_studio_branch_compiles'),
    ).toBe(true);
});
