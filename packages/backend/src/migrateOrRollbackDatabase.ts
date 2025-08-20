import * as fs from 'fs';
import * as https from 'https';
import knex from 'knex';
import * as path from 'path';
import knexConfig from './knexfile';

// Determine the environment
const environment =
    process.env.NODE_ENV === 'development' ? 'development' : 'production';

// GitHub configuration for downloading missing migration files
const GITHUB_CONFIG = {
    owner: 'lightdash',
    repo: 'lightdash',
    branch: 'main',
    baseUrl: 'https://raw.githubusercontent.com',
};

// Temporary directory for downloaded files
const MIGRATIONS_TEMP_DIR = path.join(__dirname, '..', '..', 'temp_migrations');

/**
 * Utility function to make HTTPS requests
 */
function httpsGet(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
        https
            .get(url, (res) => {
                let data = '';
                res.on('data', (chunk) => {
                    data += chunk;
                });
                res.on('end', () => {
                    if (res.statusCode === 200) {
                        resolve(data);
                    } else {
                        reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                    }
                });
            })
            .on('error', reject);
    });
}

/**
 * Download a migration file from GitHub
 * Tries both regular and EE migration paths automatically
 */
async function downloadMigrationFile(
    migrationName: string,
    isEE: boolean = false,
): Promise<string> {
    // Define both possible base paths
    const basePaths = [
        'packages/backend/src/database/migrations',
        'packages/backend/src/ee/database/migrations',
    ];

    const regularBasePath = basePaths[isEE ? 1 : 0];
    const regularUrl = `${GITHUB_CONFIG.baseUrl}/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/refs/heads/${GITHUB_CONFIG.branch}/${regularBasePath}/${migrationName}`;
    console.log(`📥 Downloading from ${regularUrl}`);
    try {
        const content = await httpsGet(regularUrl);

        // Ensure temp directory exists
        if (!fs.existsSync(MIGRATIONS_TEMP_DIR)) {
            fs.mkdirSync(MIGRATIONS_TEMP_DIR, { recursive: true });
        }

        const localPath = path.join(MIGRATIONS_TEMP_DIR, migrationName);
        fs.writeFileSync(localPath, content);

        return localPath;
    } catch (error) {
        if (!isEE) {
            // Try EE migrations directory if regular path fails
            console.log(`📥 Not found. Trying EE migrations directory...`);
            return downloadMigrationFile(migrationName, true);
        }
        throw error;
    }
}

function cleanup() {
    console.log('🧹 Cleaning up...');
    // Delete downloaded files
    if (fs.existsSync(MIGRATIONS_TEMP_DIR)) {
        fs.rmSync(MIGRATIONS_TEMP_DIR, { recursive: true, force: true });
        console.log('🧹 Deleted temporary migration files');
    }
    console.log('✅ Cleaned up.');
}

async function main(): Promise<void> {
    const database = knex(
        environment === 'production'
            ? knexConfig.production
            : knexConfig.development,
    );
    try {
        console.log('ℹ️ Checking database status...');
        const migrationStatus = await database.migrate.status();
        if (migrationStatus === 0) {
            console.log('✅ Database is up to date. No action required.');
        } else if (migrationStatus < 0) {
            console.log('⚠️ Database behind. Running migrations...');
            await database.migrate.latest();
            console.log('✅ Database migrations completed.');
        } else if (migrationStatus > 0) {
            console.log(`⚠️ Database is ahead ${migrationStatus} migrations.`);
            const migrationsToRollback: string[] = [];
            // The only way to get the list of missing migrations is by forcing an error.
            // Error example: The migration directory is corrupt, the following files are missing: 20250811180000_create_mcp_context_table.ts, 20250807212731_add_custom_roles.ts
            await database.migrate.list().catch((error) => {
                if (error instanceof Error) {
                    // Extract the missing migration names from the error message
                    const fileNameRegex =
                        environment === 'production'
                            ? /[\w-]+\.js/g
                            : /[\w-]+\.ts/g;
                    const missingMigrationNames =
                        error.message.match(fileNameRegex);
                    if (missingMigrationNames) {
                        console.log(
                            'ℹ️ Migrations to rollback:',
                            missingMigrationNames,
                        );
                        migrationsToRollback.push(...missingMigrationNames);
                    } else {
                        throw new Error(
                            `Error parsing missing migration names in error message: ${error.message}`,
                        );
                    }
                    // Avoid throwing the error, as we only need the list of missing migrations
                    return;
                }
                // Unexpected error, rethrow
                throw error;
            });

            const downloadResults: string[] = [];
            for (let i = 0; i < migrationsToRollback.length; i += 1) {
                const migrationName = migrationsToRollback[i];
                try {
                    console.log(
                        `📥 Downloading ${migrationName} (${i + 1}/${
                            migrationsToRollback.length
                        })`,
                    );
                    // eslint-disable-next-line no-await-in-loop
                    const downloadedFile = await downloadMigrationFile(
                        migrationName,
                    );
                    downloadResults.push(downloadedFile);
                } catch (error) {
                    const errorMessage =
                        error instanceof Error ? error.message : String(error);
                    console.error(
                        `❌ Failed to download ${migrationName}: ${errorMessage}`,
                    );
                    throw new Error(
                        `Failed to download ${migrationName}: ${errorMessage}`,
                    );
                }
            }
            console.log('ℹ️ Starting rollback process...');
            await database.migrate.rollback(
                {
                    directory: MIGRATIONS_TEMP_DIR,
                    disableMigrationsListValidation: true,
                },
                true, // rollback all migrations
            );
            console.log('✅ Database rollback completed.');
        } else {
            throw new Error(`Unknown status: ${migrationStatus}`);
        }
        // clean up after the process is done
        cleanup();
    } finally {
        // Always close the database connection
        await database.destroy();
    }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n\n⚠️  Process interrupted');
    cleanup();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n\n⚠️  Process terminated');
    cleanup();
    process.exit(0);
});

// Run the script
if (require.main === module) {
    main().catch((error) => {
        const errorMessage =
            error instanceof Error ? error.message : String(error);
        console.error('\n\n💥 Fatal error:', errorMessage);
        cleanup();
        process.exit(1);
    });
}
