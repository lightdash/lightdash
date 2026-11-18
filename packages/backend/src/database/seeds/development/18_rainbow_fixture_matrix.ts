import {
    DashboardTileTypes,
    generateSlug,
    SEED_ORG_1,
    SEED_ORG_1_ADMIN,
    SEED_ORG_1_EDITOR_PASSWORD,
    SEED_PROJECT,
    SpaceMemberRole,
} from '@lightdash/common';
import { Knex } from 'knex';
import { lightdashConfig } from '../../../config/lightdashConfig';
import { DashboardModel } from '../../../models/DashboardModel/DashboardModel';
import { EmailModel } from '../../../models/EmailModel';
import { FeatureFlagModel } from '../../../models/FeatureFlagModel/FeatureFlagModel';
import { OrganizationAllowedEmailDomainsModel } from '../../../models/OrganizationAllowedEmailDomainsModel';
import { SpaceModel } from '../../../models/SpaceModel';
import { UserModel } from '../../../models/UserModel';
import {
    RAINBOW_JOIN_MEMBER,
    RAINBOW_PRIVATE_SPACE,
    RAINBOW_SECOND_ORG,
    RAINBOW_SECOND_ORG_ADMIN,
    RAINBOW_SECOND_PROJECT,
} from '../rainbowFixtureMatrix';

async function ensureDashboard(
    database: Knex,
    name: string,
    projectUuid: string,
    spaceUuid: string,
    userUuid: string,
) {
    const dashboards = new DashboardModel({ database });
    const slug = generateSlug(name);
    const [existing] = await dashboards.find({ projectUuid, slug });
    if (existing) return;
    await dashboards.create(
        spaceUuid,
        {
            name,
            slug,
            tabs: [],
            tiles: [
                {
                    type: DashboardTileTypes.MARKDOWN,
                    x: 0,
                    y: 0,
                    h: 4,
                    w: 12,
                    tabUuid: null,
                    properties: {
                        title: name,
                        content: `Content for ${name}.`,
                    },
                },
            ],
        },
        { userUuid },
        projectUuid,
    );
}

async function seedPrivateSpace(database: Knex) {
    const spaces = new SpaceModel({ database });
    const admin = await database('users')
        .where('user_uuid', SEED_ORG_1_ADMIN.user_uuid)
        .first('user_id');
    if (!admin) throw new Error('Missing primary seed admin');
    const [existing] = await spaces.find({
        projectUuid: SEED_PROJECT.project_uuid,
        slug: generateSlug(RAINBOW_PRIVATE_SPACE.name),
    });
    const privateSpace =
        existing ??
        (await spaces.createSpace(
            {
                name: RAINBOW_PRIVATE_SPACE.name,
                inheritParentPermissions: false,
                parentSpaceUuid: null,
            },
            { projectUuid: SEED_PROJECT.project_uuid, userId: admin.user_id },
        ));
    await spaces.addSpaceAccess(
        privateSpace.uuid,
        SEED_ORG_1_ADMIN.user_uuid,
        SpaceMemberRole.ADMIN,
    );
    await ensureDashboard(
        database,
        RAINBOW_PRIVATE_SPACE.dashboardName,
        SEED_PROJECT.project_uuid,
        privateSpace.uuid,
        SEED_ORG_1_ADMIN.user_uuid,
    );
}

async function seedSecondShopDashboard(database: Knex) {
    const secondProject = await database('projects')
        .join(
            'organizations',
            'organizations.organization_id',
            'projects.organization_id',
        )
        .where(
            'organizations.organization_uuid',
            RAINBOW_SECOND_ORG.organization_uuid,
        )
        .where('projects.slug', RAINBOW_SECOND_PROJECT.slug)
        .first('projects.project_uuid');
    if (!secondProject) throw new Error('Missing second shop project');
    const [shared] = await new SpaceModel({ database }).find({
        projectUuid: secondProject.project_uuid,
        slug: RAINBOW_SECOND_PROJECT.sharedSpaceSlug,
    });
    if (!shared) throw new Error('Missing second shop shared space');
    await ensureDashboard(
        database,
        RAINBOW_SECOND_PROJECT.dashboardName,
        secondProject.project_uuid,
        shared.uuid,
        RAINBOW_SECOND_ORG_ADMIN.user.user_uuid,
    );
}

async function seedJoinableMember(database: Knex) {
    const { email, domain, role } = RAINBOW_JOIN_MEMBER;
    const existing = await database('emails')
        .join('users', 'users.user_id', 'emails.user_id')
        .where('emails.email', email)
        .first('users.user_uuid');
    const userUuid =
        existing?.user_uuid ??
        (
            await new UserModel({
                database,
                lightdashConfig,
                featureFlagModel: new FeatureFlagModel({
                    database,
                    lightdashConfig,
                }),
            }).createUser(
                {
                    firstName: 'Rainbow',
                    lastName: 'Member',
                    email,
                    password: SEED_ORG_1_EDITOR_PASSWORD.password,
                },
                true,
                true,
            )
        ).userUuid;
    await new EmailModel({ database }).verifyUserEmailIfExists(userUuid, email);
    await new OrganizationAllowedEmailDomainsModel({
        database,
    }).upsertAllowedEmailDomains({
        organizationUuid: SEED_ORG_1.organization_uuid,
        emailDomains: [domain],
        role,
        projects: [],
    });
}

export async function seed(knex: Knex): Promise<void> {
    await knex.transaction(async (database) => {
        await seedPrivateSpace(database);
        await seedSecondShopDashboard(database);
        await seedJoinableMember(database);
    });
}
