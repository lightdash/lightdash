import {
    ApiCreateAiAgent,
    defineUserAbility,
    LightdashUser,
    OrganizationMemberRole,
    SEED_ORG_1,
    SEED_ORG_1_ADMIN,
    SEED_ORG_1_ADMIN_EMAIL,
    SEED_PROJECT,
    SessionAccount,
    SessionUser,
} from '@lightdash/common';
import { Knex } from 'knex';
import path from 'path';
import { parse } from 'pg-connection-string';
import { afterAll, beforeAll } from 'vitest';
import App from './App';
import { parseConfig } from './config/parseConfig';
import { getEnterpriseAppArguments } from './ee';
import { AiAgentModel } from './ee/models/AiAgentModel';
import { AiAgentService } from './ee/services/AiAgentService';
import knexConfig from './knexfile';

export interface IntegrationTestContext {
    app: App;
    db: Knex;
    testUser: SessionUser;
    testUserSessionAccount: SessionAccount;
    testAgent: ApiCreateAiAgent;
    cleanup: () => Promise<void>;
}

let globalTestContext: IntegrationTestContext | null = null;

export const setupIntegrationTest =
    async (): Promise<IntegrationTestContext> => {
        console.info('🚀 Starting integration test setup...');

        if (!process.env.LIGHTDASH_LICENSE_KEY) {
            throw new Error(
                'LIGHTDASH_LICENSE_KEY environment variable is required for integration tests. ',
            );
        }

        const lightdashConfig = parseConfig();

        const enterpriseArgs = await getEnterpriseAppArguments();

        console.info('🏗️  Creating App instance...');

        // Get base connection from PGCONNECTIONURI but modify database name for tests
        const getTestConnection = () => {
            const baseUri = process.env.PGCONNECTIONURI;
            if (!baseUri) {
                throw new Error(
                    'PGCONNECTIONURI environment variable is required for tests',
                );
            }

            const connection = parse(baseUri);
            connection.database = `${connection.database || 'lightdash'}_test`;

            console.info('Using test database:', connection.database);
            return connection;
        };

        const app = new App({
            lightdashConfig,
            port: 0,
            environment: 'development',
            knexConfig: {
                ...knexConfig,
                development: {
                    ...knexConfig.development,
                    // @ts-expect-error - TODO: fix this
                    connection: getTestConnection(),
                    migrations: {
                        ...knexConfig.development.migrations,
                        // For vitest environment, use compiled JS files instead of TS
                        loadExtensions: ['.js'],
                        directory: [
                            path.join(__dirname, '../dist/database/migrations'),
                            ...(lightdashConfig.license.licenseKey
                                ? [
                                      path.join(
                                          __dirname,
                                          '../dist/ee/database/migrations',
                                      ),
                                  ]
                                : []),
                        ],
                    },
                    seeds: {
                        ...knexConfig.development.seeds,
                        // For vitest environment, use compiled JS files instead of TS
                        loadExtensions: ['.js'],
                        directory: [
                            path.join(
                                __dirname,
                                '../dist/database/seeds/development',
                            ),
                            ...(lightdashConfig.license.licenseKey
                                ? [
                                      path.join(
                                          __dirname,
                                          '../dist/ee/database/seeds/development',
                                      ),
                                  ]
                                : []),
                        ],
                    },
                },
            },
            ...enterpriseArgs,
        });

        const db = app.getDatabase();

        // Run migrations to ensure database schema is up to date
        console.info('🔧 Running database migrations...');
        await db.migrate.latest();
        console.info('✅ Database migrations completed');

        // Run seeds to populate test data
        console.info('🌱 Running database seeds...');
        await db.seed.run();
        console.info('✅ Database seeds completed');

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

        const testUserSessionAccount: SessionAccount = {
            user: {
                ...testUser,
                id: '1',
                type: 'registered',
            },
            organization: {
                organizationUuid: testUser.organizationUuid!,
                name: testUser.organizationName!,
                createdAt: testUser.organizationCreatedAt!,
            },
            authentication: {
                type: 'session',
                source: 'test-session',
            },
            isAuthenticated: () => true,
            isRegisteredUser: () => true,
            isAnonymousUser: () => false,
            isSessionUser: () => true,
            isJwtUser: () => false,
            isServiceAccount: () => false,
            isPatUser: () => false,
        };

        const testAgent: ApiCreateAiAgent = {
            name: 'Integration Test Agent',
            projectUuid: SEED_PROJECT.project_uuid,
            tags: ['ai'],
            integrations: [],
            instruction: 'You are a helpful AI assistant for testing purposes.',
            groupAccess: [],
            imageUrl: null,
        };

        const catalogService = app.getServiceRepository().getCatalogService();

        await catalogService.indexCatalog(
            SEED_PROJECT.project_uuid,
            testUser.userUuid,
        );

        const cleanup = async () => {
            console.info('🧹 Cleaning up test environment...');

            // Clean up test data - rollback migrations to ensure clean state
            console.info('↶ Rolling back migrations...');
            await db.migrate.rollback({}, true); // rollback all migrations

            await app.stop();
            console.info('✅ Cleanup completed');
        };

        return {
            app,
            db,
            testUser,
            testUserSessionAccount,
            testAgent,
            cleanup,
        };
    };

/**
 * Get services from the App's factory system
 */
export const getServices = (app: App) => {
    console.info('🔧 Getting services from App factory...');
    const serviceRepository = app.getServiceRepository();

    const services = {
        aiAgentService: serviceRepository.getAiAgentService<AiAgentService>(),
        projectService: serviceRepository.getProjectService(),
    };

    console.info('✅ Services retrieved:', Object.keys(services).join(', '));
    return services;
};

/**
 * Get models from the App's factory system
 */
export const getModels = (app: App) => {
    console.info('📊 Getting models from App factory...');

    const models = {
        aiAgentModel: app.getModels().getAiAgentModel() as AiAgentModel,
        projectModel: app.getModels().getProjectModel(),
        userModel: app.getModels().getUserModel(),
    };

    console.info('✅ Models retrieved:', Object.keys(models).join(', '));
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
    console.info('✅ Vitest integration tests completed');
});
