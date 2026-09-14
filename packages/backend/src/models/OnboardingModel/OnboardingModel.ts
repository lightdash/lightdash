import { NotFoundError, OnbordingRecord } from '@lightdash/common';
import { Knex } from 'knex';
import { OnboardingTableName } from '../../database/entities/onboarding';
import { OrganizationTableName } from '../../database/entities/organizations';

type OnboardingModelArguments = {
    database: Knex;
};

const PLAYGROUND_PROVISIONING_LOCK_NAMESPACE = 19350428;
// Distinct from the playground's, so enabling Learn and provisioning a
// playground for the same org never wait on each other.
const TRAINING_PROVISIONING_LOCK_NAMESPACE = 19350429;
// One training copy at a time per learner: parallel requests would each
// delete the others' copy and leave several live.
const TRAINING_COPY_LOCK_NAMESPACE = 19350430;

export class OnboardingModel {
    private database: Knex;

    constructor(args: OnboardingModelArguments) {
        this.database = args.database;
    }

    async runInPlaygroundProvisioningLock<T>(
        organizationUuid: string,
        callback: (trx: Knex.Transaction) => Promise<T>,
    ): Promise<T> {
        return this.database.transaction(async (trx) => {
            const organization = await trx(OrganizationTableName)
                .where('organization_uuid', organizationUuid)
                .select('organization_id')
                .first();
            if (!organization) {
                throw new NotFoundError('Cannot find organization');
            }

            await trx.raw('SELECT pg_advisory_xact_lock(?, ?)', [
                PLAYGROUND_PROVISIONING_LOCK_NAMESPACE,
                organization.organization_id,
            ]);
            return callback(trx);
        });
    }

    /**
     * Serialises training project creation per organization (CS-257): two
     * admins clicking Enable Learn at once make one project.
     */
    async runInTrainingProvisioningLock<T>(
        organizationUuid: string,
        callback: (trx: Knex.Transaction) => Promise<T>,
    ): Promise<T> {
        return this.database.transaction(async (trx) => {
            const organization = await trx(OrganizationTableName)
                .where('organization_uuid', organizationUuid)
                .select('organization_id')
                .first();
            if (!organization) {
                throw new NotFoundError('Cannot find organization');
            }

            await trx.raw('SELECT pg_advisory_xact_lock(?, ?)', [
                TRAINING_PROVISIONING_LOCK_NAMESPACE,
                organization.organization_id,
            ]);
            return callback(trx);
        });
    }

    /**
     * Serialises training copy creation per learner (see
     * ProjectService.createTrainingPreview).
     */
    async runInTrainingCopyLock<T>(
        userUuid: string,
        callback: () => Promise<T>,
    ): Promise<T> {
        return this.database.transaction(async (trx) => {
            const user = await trx('users')
                .where('user_uuid', userUuid)
                .select('user_id')
                .first();
            if (!user) {
                throw new NotFoundError('Cannot find user');
            }
            await trx.raw('SELECT pg_advisory_xact_lock(?, ?)', [
                TRAINING_COPY_LOCK_NAMESPACE,
                user.user_id,
            ]);
            return callback();
        });
    }

    async getByOrganizationUuid(
        organizationUuid: string,
        transaction?: Knex.Transaction,
    ): Promise<OnbordingRecord> {
        const database = transaction ?? this.database;
        const orgs = await database(OrganizationTableName)
            .where('organization_uuid', organizationUuid)
            .select('organization_id');
        if (orgs.length === 0) {
            throw new NotFoundError('Cannot find organization');
        }
        await database(OnboardingTableName)
            .insert({
                organization_id: orgs[0].organization_id,
                ranQuery_at: null,
                shownSuccess_at: null,
                playground_project_deleted_at: null,
            })
            .onConflict('organization_id')
            .ignore();
        const onboarding = await database(OnboardingTableName)
            .select(
                'shownSuccess_at',
                'ranQuery_at',
                'playground_project_deleted_at',
            )
            .where('organization_id', orgs[0].organization_id)
            .first();
        if (!onboarding) {
            throw new NotFoundError('Cannot find onboarding');
        }

        return {
            ranQueryAt: onboarding.ranQuery_at,
            shownSuccessAt: onboarding.shownSuccess_at,
            playgroundProjectDeletedAt:
                onboarding.playground_project_deleted_at,
        };
    }

    async getPlaygroundContentSeedVersion(
        organizationUuid: string,
        transaction?: Knex.Transaction,
    ): Promise<number | null> {
        const database = transaction ?? this.database;
        await this.getByOrganizationUuid(organizationUuid, transaction);
        const onboarding = await database(OnboardingTableName)
            .innerJoin(
                OrganizationTableName,
                `${OrganizationTableName}.organization_id`,
                `${OnboardingTableName}.organization_id`,
            )
            .where(
                `${OrganizationTableName}.organization_uuid`,
                organizationUuid,
            )
            .select(`${OnboardingTableName}.playground_content_seed_version`)
            .first();

        return onboarding?.playground_content_seed_version ?? null;
    }

    async setPlaygroundContentSeedVersion(
        organizationUuid: string,
        version: number,
        transaction?: Knex.Transaction,
    ): Promise<void> {
        const database = transaction ?? this.database;
        await this.getByOrganizationUuid(organizationUuid, transaction);
        await database(OnboardingTableName)
            .where(
                'organization_id',
                database(OrganizationTableName)
                    .where('organization_uuid', organizationUuid)
                    .select('organization_id')
                    .first(),
            )
            .update({ playground_content_seed_version: version });
    }

    async update(
        organizationUuid: string,
        data: Partial<OnbordingRecord>,
        transaction?: Knex.Transaction,
    ): Promise<void> {
        const database = transaction ?? this.database;
        const orgs = await database(OrganizationTableName)
            .where('organization_uuid', organizationUuid)
            .select('organization_id');
        if (orgs.length === 0) {
            throw new NotFoundError('Cannot find organization');
        }

        await database(OnboardingTableName)
            .update({
                ranQuery_at: data.ranQueryAt,
                shownSuccess_at: data.shownSuccessAt,
                playground_project_deleted_at: data.playgroundProjectDeletedAt,
            })
            .where('organization_id', orgs[0].organization_id);
    }
}
