import { NotExistsError, OnbordingRecord } from '@lightdash/common';
import { Knex } from 'knex';
import { OnboardingTableName } from '../../database/entities/onboarding';
import { OrganizationTableName } from '../../database/entities/organizations';

type OnboardingModelArguments = {
    database: Knex;
};

export class OnboardingModel {
    private database: Knex;

    constructor(args: OnboardingModelArguments) {
        this.database = args.database;
    }

    async getByOrganizationUuid(
        organizationUuid: string,
    ): Promise<OnbordingRecord> {
        const orgs = await this.database(OrganizationTableName)
            .where('organization_uuid', organizationUuid)
            .select('organization_id');
        if (orgs.length === 0) {
            throw new NotExistsError('Cannot find organization');
        }
        const onboardings = await this.database(OnboardingTableName)
            .select('shownSuccess_at', 'ranQuery_at')
            .where('organization_id', orgs[0].organization_id)
            .limit(1);
        if (onboardings.length === 0) {
            await this.database(OnboardingTableName).insert({
                organization_id: orgs[0].organization_id,
                ranQuery_at: null,
                shownSuccess_at: null,
            });
            return {
                ranQueryAt: null,
                shownSuccessAt: null,
            };
        }
        return {
            ranQueryAt: onboardings[0].ranQuery_at,
            shownSuccessAt: onboardings[0].shownSuccess_at,
        };
    }

    async update(
        organizationUuid: string,
        data: Partial<OnbordingRecord>,
    ): Promise<void> {
        const orgs = await this.database(OrganizationTableName)
            .where('organization_uuid', organizationUuid)
            .select('organization_id');
        if (orgs.length === 0) {
            throw new NotExistsError('Cannot find organization');
        }

        await this.database(OnboardingTableName)
            .update({
                ranQuery_at: data.ranQueryAt,
                shownSuccess_at: data.shownSuccessAt,
            })
            .where('organization_id', orgs[0].organization_id);
    }
}
