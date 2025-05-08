/* eslint-disable no-await-in-loop */
import {
    CreateSpace,
    generateSlug,
    OrganizationMemberRole,
    SEED_ORG_1_ADMIN,
    SEED_ORG_1_EDITOR,
    SEED_ORG_1_VIEWER,
    SEED_PROJECT,
    SpaceMemberRole,
} from '@lightdash/common';
import { Knex } from 'knex';
import { SpaceModel } from '../../../models/SpaceModel';

type TreeCreateSpace = CreateSpace & {
    children?: TreeCreateSpace[];
};

const tree: TreeCreateSpace[] = [
    {
        name: 'Parent Space 1',
        children: [
            {
                name: 'Child Space 1.1',
                children: [
                    {
                        name: 'Grandchild Space 1.1.1',
                    },
                    {
                        name: 'Grandchild Space 1.1.2',
                    },
                ],
            },
            {
                name: 'Child Space 1.2',
                children: [
                    {
                        name: 'Grandchild Space 1.2.1',
                    },
                    {
                        name: 'Grandchild Space 1.2.2',
                        children: [
                            {
                                name: 'Great Grandchild Space 1.2.2.1',
                            },
                        ],
                    },
                ],
            },
            {
                name: 'Child Space 1.3',
                children: [
                    {
                        name: 'Grandchild Space 1.3.1',
                        children: [
                            {
                                name: 'Great Grandchild Space 1.3.1.1',
                            },
                        ],
                    },
                ],
            },
        ],
    },
    {
        name: 'Parent Space 2',
        isPrivate: true,
        children: [
            {
                name: 'Child Space 2.1',
                children: [
                    {
                        name: 'Grandchild Space 2.1.1',
                    },
                ],
            },
        ],
    },
    {
        name: 'Parent Space 3',
        isPrivate: true,
        access: [
            // Admin will automatically be added, we only seed editor
            {
                userUuid: SEED_ORG_1_EDITOR.user_uuid,
                role: SpaceMemberRole.EDITOR,
            },
        ],
        children: [
            {
                name: 'Child Space 3.1',
            },
        ],
    },
] as const;

const tree2: TreeCreateSpace[] = [
    {
        name: 'Parent Space 4',
        isPrivate: true,
        access: [],
        children: [
            {
                name: 'Child Space 4.1',
            },
        ],
    },
] as const;

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

    await createSpaceTree(spaceModel, tree, null, {
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

    await createSpaceTree(spaceModel, tree2, null, {
        projectUuid: SEED_PROJECT.project_uuid,
        userId: editorUser.user_id,
        userUuid: editorUser.user_uuid,
    });
}
