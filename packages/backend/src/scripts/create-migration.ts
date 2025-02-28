import execa from 'execa';
import path from 'path';
import * as process from 'process';
import * as readline from 'readline';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

const migrationName = process.argv[2];

if (!migrationName) {
    console.error(
        'Error: Migration name is required, e.g create-migration add_user_role',
    );
    console.error('Usage: pnpm create-migration <migration-name>');
    process.exit(1);
}

// Prompt user to choose between OSS and EE migrations
const promptUser = (): Promise<'ee' | 'oss'> =>
    new Promise<'ee' | 'oss'>((resolve) => {
        rl.question(
            'Create migration in (1) OSS or (2) EE? [1/2]: ',
            (answer: string) => {
                rl.close();

                const normalizedAnswer = answer.trim().toLowerCase();

                if (normalizedAnswer === '1' || normalizedAnswer === 'oss') {
                    resolve('oss');
                } else if (
                    normalizedAnswer === '2' ||
                    normalizedAnswer === 'ee'
                ) {
                    resolve('ee');
                } else {
                    console.log('Invalid choice. Defaulting to OSS.');
                    resolve('oss');
                }
            },
        );
    });

const createMigration = async (): Promise<void> => {
    const migrationType = await promptUser();

    try {
        // Define the migration directory based on user choice
        let migrationDir: string;

        if (migrationType === 'ee') {
            // Check if license key exists and is valid
            const licenseKey = process.env.LIGHTDASH_LICENSE_KEY;
            if (!licenseKey || licenseKey.trim() === '') {
                console.error(
                    'Error: LIGHTDASH_LICENSE_KEY is required for EE migrations.',
                );
                console.error(
                    'Please set the environment variable and try again.',
                );
                process.exit(1);
            }

            migrationDir = 'ee/database/migrations';
            console.log('Creating EE migration...');
        } else {
            migrationDir = 'database/migrations';
            console.log('Creating OSS migration...');
        }

        let migrationPath: string;
        try {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            const srcPath = path.join(__dirname, '..');
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            migrationPath = path.join(srcPath, migrationDir);
        } catch (error) {
            console.error('Error getting source path:', error);
            process.exit(1);
        }

        // Run migration
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
        const { stdout } = await execa('knex', [
            'migrate:make',
            migrationName,
            '--knexfile',
            'src/knexfile.ts',
            '--migrations-directory',
            migrationPath,
        ]);

        if (stdout) console.log(stdout);
    } catch (error) {
        console.error(
            'Error creating migration:',
            error instanceof Error ? error.message : String(error),
        );
        process.exit(1);
    }
};

// Execute the function
void createMigration();
