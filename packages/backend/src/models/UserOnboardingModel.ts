import { UserOnboardingTour } from '@lightdash/common';
import { Knex } from 'knex';
import { UserOnboardingTableName } from '../database/entities/userOnboarding';

type UserOnboardingModelArguments = {
    database: Knex;
};

export class UserOnboardingModel {
    private readonly database: Knex;

    constructor({ database }: UserOnboardingModelArguments) {
        this.database = database;
    }

    async findCompletedTours(
        userUuid: string,
    ): Promise<Record<string, boolean>> {
        const row = await this.database(UserOnboardingTableName)
            .select('completed_tours')
            .where('user_uuid', userUuid)
            .first();
        return row?.completed_tours ?? {};
    }

    async completeTour(
        userUuid: string,
        tour: UserOnboardingTour,
    ): Promise<void> {
        await this.database(UserOnboardingTableName)
            .insert({
                user_uuid: userUuid,
                completed_tours: { [tour]: true },
            })
            .onConflict('user_uuid')
            .merge({
                completed_tours: this.database.raw(
                    `${UserOnboardingTableName}.completed_tours || excluded.completed_tours`,
                ),
                updated_at: this.database.fn.now(),
            });
    }
}
