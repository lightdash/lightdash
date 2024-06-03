import { Knex } from 'knex';

type MigrationModelArguments = {
    database: Knex;
};

export class MigrationModel {
    private database: Knex;

    constructor(args: MigrationModelArguments) {
        this.database = args.database;
    }

    public async getMigrationStatus() {
        const migrationStatus = await this.database.migrate.status();
        const migrationCurrentVersion =
            await this.database.migrate.currentVersion();
        return {
            status: migrationStatus,
            currentVersion: migrationCurrentVersion,
        };
    }
}
