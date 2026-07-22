import { NotFoundError, OnbordingRecord } from '@lightdash/common';
import { Knex } from 'knex';
import { OnboardingTableName } from '../../database/entities/onboarding';
import { OrganizationTableName } from '../../database/entities/organizations';

type OnboardingModelArguments = {
    database: Knex;
};

const PLAYGROUND_PROVISIONING_LOCK_NAMESPACE = 19350428;

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
