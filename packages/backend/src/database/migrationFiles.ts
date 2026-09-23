import { readdir } from 'node:fs/promises';
import path from 'node:path';

export const BACKEND_ROOT = path.resolve(__dirname, '../..');

const MIGRATION_DIRECTORIES = [
    path.join(BACKEND_ROOT, 'src/database/migrations'),
    path.join(BACKEND_ROOT, 'src/ee/database/migrations'),
];

export const MIGRATION_RUN_ENVIRONMENT: Record<string, string> = {
    NODE_ENV: 'development',
    LIGHTDASH_SECRET: 'real-schema-test-secret',
    LIGHTDASH_LICENSE_KEY: 'real-schema-test-license',
    SITE_URL: 'http://localhost:3000',
    S3_ENDPOINT: 'http://localhost:9000',
    S3_BUCKET: 'real-schema-test',
    S3_REGION: 'us-east-1',
    S3_ACCESS_KEY: 'real-schema-test',
    S3_SECRET_KEY: 'real-schema-test',
};

export type MigrationFile = {
    name: string;
    filePath: string;
};

const isMigrationFile = (fileName: string) =>
    fileName.endsWith('.ts') && !/\.(test|integration)\.ts$/.test(fileName);

export const listMigrationFiles = async (): Promise<MigrationFile[]> => {
    const files = await Promise.all(
        MIGRATION_DIRECTORIES.map(async (directory) =>
            (await readdir(directory)).filter(isMigrationFile).map((name) => ({
                name,
                filePath: path.join(directory, name),
            })),
        ),
    );
    return files
        .flat()
        .sort((left, right) => (left.name < right.name ? -1 : 1));
};
