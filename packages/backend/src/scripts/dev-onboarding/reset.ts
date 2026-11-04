import { OrganizationMemberRole } from '@lightdash/common';
import bcrypt from 'bcrypt';
import { type Knex } from 'knex';
import { type DbOrganization } from '../../database/entities/organizations';
import { type DbUser, type DbUserIn } from '../../database/entities/users';
import {
    TEST_EMAIL,
    TEST_ORG_UUID,
    TEST_PASSWORD,
    TEST_USER_UUID,
} from './config';

export const resetOnboardingFixture = async (database: Knex) => {
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);
    await database.transaction(async (trx) => {
        await trx.raw('SELECT pg_advisory_xact_lock(hashtext(?))', [
            TEST_ORG_UUID,
        ]);
        const email = await trx('emails')
            .where({ email: TEST_EMAIL })
            .first<{ user_id: number }>();
        const user = await trx<DbUser>('users')
            .where({ user_uuid: TEST_USER_UUID })
            .first();
        const org = await trx<DbOrganization>('organizations')
            .where({ organization_uuid: TEST_ORG_UUID })
            .first();
        if (email && email.user_id !== user?.user_id) {
            throw new Error(
                'The test email belongs to another user; refusing to replace it.',
            );
        }
        if (user) {
            const memberships = await trx('organization_memberships')
                .where({ user_id: user.user_id })
                .select<{ organization_id: number }[]>('organization_id');
            if (
                memberships.some(
                    ({ organization_id: id }) => id !== org?.organization_id,
                )
            ) {
                throw new Error(
                    'The test user belongs to another organization; refusing to reset it.',
                );
            }
        }
        const activeRun = await trx('agent_onboarding_runs')
            .join(
                'projects',
                'projects.project_uuid',
                'agent_onboarding_runs.project_uuid',
            )
            .join(
                'organizations',
                'organizations.organization_id',
                'projects.organization_id',
            )
            .where('organizations.organization_uuid', TEST_ORG_UUID)
            .whereIn('agent_onboarding_runs.status', ['queued', 'running'])
            .select('agent_onboarding_runs.agent_onboarding_run_uuid')
            .first<{ agent_onboarding_run_uuid: string }>();
        if (activeRun) {
            throw new Error(
                'Cancel the active onboarding run before restarting the test journey.',
            );
        }
        if (user)
            await trx('users').where({ user_uuid: TEST_USER_UUID }).delete();
        if (org)
            await trx('organizations')
                .where({ organization_uuid: TEST_ORG_UUID })
                .delete();
        const [newOrg] = await trx<DbOrganization>('organizations')
            .insert({ organization_uuid: TEST_ORG_UUID, organization_name: '' })
            .returning('organization_id');
        const [newUser] = await trx<DbUser>('users')
            .insert({
                user_uuid: TEST_USER_UUID,
                first_name: '',
                last_name: '',
                is_setup_complete: false,
                is_active: true,
                is_marketing_opted_in: false,
                is_tracking_anonymized: true,
            } satisfies DbUserIn)
            .returning('user_id');
        await trx('emails').insert({
            user_id: newUser.user_id,
            email: TEST_EMAIL,
            is_primary: true,
        });
        await trx('emails')
            .where({ user_id: newUser.user_id })
            .update({ is_verified: true });
        await trx('password_logins').insert({
            user_id: newUser.user_id,
            password_hash: passwordHash,
        });
        await trx('organization_memberships').insert({
            user_id: newUser.user_id,
            organization_id: newOrg.organization_id,
            role: OrganizationMemberRole.ADMIN,
        });
        await trx('organization_homepage_settings').insert({
            organization_uuid: TEST_ORG_UUID,
            enabled: true,
            opening: null,
        });
    });
};
