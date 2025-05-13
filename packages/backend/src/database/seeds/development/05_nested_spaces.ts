/* eslint-disable no-await-in-loop */
import {
    SEED_ORG_1_ADMIN,
    SEED_ORG_1_EDITOR,
    SEED_PROJECT,
    SPACE_TREE_1,
    SPACE_TREE_2,
    SpaceMemberRole,
    TreeCreateSpace,
} from '@lightdash/common';
import { Knex } from 'knex';
import { SpaceModel } from '../../../models/SpaceModel';

async function createSpaceTree(
    spaceModel: SpaceModel,
    spaces: TreeCreateSpace[],
    parentSpaceUuid: string | null,
    opts: {
        projectUuid: string;
        userId: number;
        userUuid: string;
    },
) {
    const ids: string[] = [];
    for (const space of spaces) {
        const createdSpace = await spaceModel.createSpace(
            {
                name: space.name,
                isPrivate: space.isPrivate === true,
                parentSpaceUuid,
            },
            {
                projectUuid: opts.projectUuid,
                userId: opts.userId,
            },
        );

        if (space.access)
            await Promise.all(
                space.access.map((access) =>
                    spaceModel.addSpaceAccess(
                        createdSpace.uuid,
                        access.userUuid,
                        access.role,
                    ),
                ),
            );

        if (space.groupAccess)
            await Promise.all(
                space.groupAccess.map((groupAccess) =>
                    spaceModel.addSpaceGroupAccess(
                        createdSpace.uuid,
                        groupAccess.groupUuid,
                        groupAccess.role,
                    ),
                ),
            );

        await spaceModel.addSpaceAccess(
            createdSpace.uuid,
            opts.userUuid,
            SpaceMemberRole.ADMIN,
        ); // user who created the space by default would be set to space admin

        if (space.children) {
            const childIds = await createSpaceTree(
                spaceModel,
                space.children,
                createdSpace.uuid,
                opts,
            );
            ids.push(createdSpace.uuid, ...childIds);
        } else {
            ids.push(createdSpace.uuid);
        }
    }

    return ids;
}

export async function seed(knex: Knex): Promise<void> {
    const spaceModel = new SpaceModel({
        database: knex,
    });

    const [user] = await knex('users').where(
        'user_uuid',
        SEED_ORG_1_ADMIN.user_uuid,
    );

    if (!user) {
        throw new Error(`User ${SEED_ORG_1_ADMIN.user_uuid} not found`);
    }

    await createSpaceTree(spaceModel, SPACE_TREE_1, null, {
        projectUuid: SEED_PROJECT.project_uuid,
        userId: user.user_id,
        userUuid: user.user_uuid,
    });

    const [editorUser] = await knex('users').where(
        'user_uuid',
        SEED_ORG_1_EDITOR.user_uuid,
    );

    if (!editorUser) {
        throw new Error(`User ${SEED_ORG_1_EDITOR.user_uuid} not found`);
    }

    await createSpaceTree(spaceModel, SPACE_TREE_2, null, {
        projectUuid: SEED_PROJECT.project_uuid,
        userId: editorUser.user_id,
        userUuid: editorUser.user_uuid,
    });
}
