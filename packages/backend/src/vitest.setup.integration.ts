import {
    ApiCreateAiAgent,
    defineUserAbility,
    LightdashUser,
    OrganizationMemberRole,
    SEED_ORG_1,
    SEED_ORG_1_ADMIN,
    SEED_ORG_1_ADMIN_EMAIL,
    SEED_PROJECT,
    SessionUser,
} from '@lightdash/common';
import { Knex } from 'knex';
import { parse } from 'pg-connection-string';
import { afterAll, beforeAll } from 'vitest';
import App from './App';
import { parseConfig } from './config/parseConfig';
import { getEnterpriseAppArguments } from './ee';
import { AiAgentModel } from './ee/models/AiAgentModel';
// Register ts-node for knex migration loading with ES module support
import { register } from 'ts-node';

// Configure ts-node to handle ES modules properly
register({
    transpileOnly: true,
    compilerOptions: {
        module: 'CommonJS',
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
    },
});

import knexConfig from './knexfile';

export interface IntegrationTestContext {
    app: App;
    db: Knex;
    testUser: SessionUser;
    testAgent: ApiCreateAiAgent;
    cleanup: () => Promise<void>;
}

let globalTestContext: IntegrationTestContext | null = null;

export const setupIntegrationTest =
    async (): Promise<IntegrationTestContext> => {
        console.log('🚀 Starting integration test setup...');

        if (!process.env.LIGHTDASH_LICENSE_KEY) {
            throw new Error(
                'LIGHTDASH_LICENSE_KEY environment variable is required for integration tests. ',
            );
        }

        const lightdashConfig = parseConfig();

        const enterpriseArgs = await getEnterpriseAppArguments();

        console.log('🏗️  Creating App instance...');

        // TODO: FIX THIS
        // Get base connection from PGCONNECTIONURI but modify database name for tests
        const getTestConnectionUri = (): string => {
            const baseConnectionUri = process.env.PGCONNECTIONURI;
            if (!baseConnectionUri) {
                throw new Error(
                    'PGCONNECTIONURI environment variable is required for tests',
                );
            }

            const connectionConfig = parse(baseConnectionUri);
            const testDatabaseName = `${
                connectionConfig.database || 'lightdash'
            }_test`;

            // Construct test database URI
            const testConnectionUri = `postgresql://${connectionConfig.user}:${
                connectionConfig.password
            }@${connectionConfig.host}:${
                connectionConfig.port || 5432
            }/${testDatabaseName}`;

            console.log(`Using test database: ${testDatabaseName}`);
            console.log(`Test connection URI: ${testConnectionUri}`);
            return testConnectionUri;
        };

        const CONNECTION = parse(getTestConnectionUri());
        console.log('CONNECTION', CONNECTION);

        const app = new App({
            lightdashConfig,
            port: 0,
            environment: 'development',
            knexConfig: {
                ...knexConfig,
                development: {
                    ...knexConfig.development,
                    // @ts-expect-error - TODO: fix this
                    connection: CONNECTION,
                },
            },
            ...enterpriseArgs,
        });

        const db = app.getDatabase();

        // Run migrations to ensure database schema is up to date
        console.log('🔧 Running database migrations...');
        await db.migrate.latest();
        console.log('✅ Database migrations completed');

        // Run seeds to populate test data
        console.log('🌱 Running database seeds...');
        await db.seed.run();
        console.log('✅ Database seeds completed');

        // TODO: get first user from db that is an admin and active
        // Create a test user with appropriate permissions
        const testUserData: LightdashUser = {
            userUuid: SEED_ORG_1_ADMIN.user_uuid,
            email: SEED_ORG_1_ADMIN_EMAIL.email,
            firstName: SEED_ORG_1_ADMIN.first_name,
            lastName: SEED_ORG_1_ADMIN.last_name,
            organizationUuid: SEED_ORG_1.organization_uuid,
            organizationName: SEED_ORG_1.organization_name,
            organizationCreatedAt: new Date(),
            isTrackingAnonymized: false,
            isMarketingOptedIn: SEED_ORG_1_ADMIN.is_marketing_opted_in,
            isSetupComplete: SEED_ORG_1_ADMIN.is_setup_complete,
            userId: 1,
            role: OrganizationMemberRole.ADMIN,
            isActive: SEED_ORG_1_ADMIN.is_active,
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        const testUser: SessionUser = {
            ...testUserData,
            ability: defineUserAbility(testUserData, []),
            isTrackingAnonymized: false,
            userId: 1,
            abilityRules: [],
        };

        const testAgent: ApiCreateAiAgent = {
            name: 'Integration Test Agent',
            projectUuid: SEED_PROJECT.project_uuid,
            tags: null,
            integrations: [],
            instruction: 'You are a helpful AI assistant for testing purposes.',
            groupAccess: [],
            imageUrl: null,
        };

        const cleanup = async () => {
            console.log('🧹 Cleaning up test environment...');

            // Clean up test data - rollback migrations to ensure clean state
            console.log('↶ Rolling back migrations...');
            await db.migrate.rollback({}, true); // rollback all migrations

            await app.stop();
            console.log('✅ Cleanup completed');
        };

        return {
            app,
            db,
            testUser,
            testAgent,
            cleanup,
        };
    };

/**
 * Get services from the App's factory system
 */
export const getServices = (app: App) => {
    console.log('🔧 Getting services from App factory...');
    const serviceRepository = app.getServiceRepository();

    const services = {
        aiAgentService: serviceRepository.getAiAgentService(),
        projectService: serviceRepository.getProjectService(),
        catalogService: serviceRepository.getCatalogService(),
    };

    console.log('✅ Services retrieved:', Object.keys(services).join(', '));
    return services;
};

/**
 * Get models from the App's factory system
 */
export const getModels = (app: App) => {
    console.log('📊 Getting models from App factory...');

    const models = {
        aiAgentModel: app.getModels().getAiAgentModel() as AiAgentModel,
        projectModel: app.getModels().getProjectModel(),
        userModel: app.getModels().getUserModel(),
    };

    console.log('✅ Models retrieved:', Object.keys(models).join(', '));
    return models;
};

/**
 * Get the global test context - useful for tests that need access to shared setup
 */
export const getTestContext = (): IntegrationTestContext => {
    if (!globalTestContext) {
        throw new Error(
            'Integration test context not initialized. Run setupIntegrationTest() first.',
        );
    }
    return globalTestContext;
};

beforeAll(async () => {
    globalTestContext = await setupIntegrationTest();
});

afterAll(async () => {
    if (globalTestContext) {
        await globalTestContext.cleanup();
        globalTestContext = null;
    }
    console.log('✅ Vitest integration tests completed');
});
