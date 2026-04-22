module.exports = {
    ignorePatterns: [
        'src/ee/services/McpService/mcp-chart-app/**',
        'src/ee/sandboxes/**',
        'src/generated/**',
    ],
    parserOptions: {
        project: './tsconfig.json',
    },
    extends: [
        './../../.eslintrc.js',
        'eslint:recommended',
        'plugin:json/recommended',
        'airbnb-base',
        'airbnb-typescript/base',
        'prettier',
    ],
    plugins: ['jsdoc'],
    settings: {
        'import/resolver': {
            node: {
                extensions: ['.js', '.jsx', '.ts', '.tsx'],
            },
        },
    },
    rules: {
        'import/prefer-default-export': 'off',
        '@typescript-eslint/no-unused-vars': 'off',
        'no-console': 'off',
        'no-underscore-dangle': 'off',
        'max-classes-per-file': 'off',
        'no-case-declarations': 'off',
        'no-template-curly-in-string': 'off',
        'no-restricted-syntax': 'off',
        eqeqeq: 'error',
        '@typescript-eslint/no-floating-promises': 'error',
        '@typescript-eslint/no-throw-literal': 'off',
        // no-throw-literal replaced with only-throw-error
        '@typescript-eslint/only-throw-error': 'off',
    },
    overrides: [
        {
            files: ['*.ts'],
            rules: {
                '@typescript-eslint/no-unsafe-member-access': 'error',
                '@typescript-eslint/no-unsafe-assignment': 'error',
                '@typescript-eslint/no-unsafe-call': 'error',
            },
        },

        {
            // Do not check this rule for existing files, new files should be error
            files: [
                'src/*.ts',
                'src/analytics/**/*.ts', // TODO fix these folders
                'src/clients/**/*.ts',
                'src/controllers/**/*.ts',
                'src/database/**/*.ts',
                'src/dbt/**/*.ts',
                'src/ee/**/*.ts',
                'src/models/**/*.ts',
                'src/services/**/*.ts',
                'src/utils/**/*.ts',
                'src/logging/**/*.ts',
                'src/scheduler/**/*.ts',
                'src/config/**/*.ts',
                'src/projectAdapters/**/*.ts',
                'src/prometheus/**/*.ts',
            ],
            rules: {
                '@typescript-eslint/no-unsafe-member-access': 'off',
                '@typescript-eslint/no-unsafe-assignment': 'off',
                '@typescript-eslint/no-unsafe-call': 'off',
            },
        },
        {
            files: [
                'src/database/migrations/*.ts',
                'src/routers/*.ts',
                '*.mock.ts',
                '*.test.ts',
                '*.spec.ts',
            ],
            rules: {
                '@typescript-eslint/no-unsafe-member-access': 'off',
                '@typescript-eslint/no-unsafe-assignment': 'off',
                '@typescript-eslint/no-unsafe-call': 'off',
            },
        },
        {
            // Warn on direct ability checks in services - use createAuditedAbility() instead
            files: [
                'src/services/**/*.ts',
                'src/ee/services/**/*.ts',
            ],
            rules: {
                'no-direct-ability-check': 'warn',
            },
        },
        {
            // Error on direct ability checks in fully migrated services
            files: [
                'src/ee/services/McpService/**/*.ts',
                'src/ee/services/AiAgentService/**/*.ts',
                'src/services/AnalyticsService/**/*.ts',
                'src/services/AsyncQueryService/**/*.ts',
                'src/services/CatalogService/**/*.ts',
                'src/services/ContentService/**/*.ts',
                'src/services/CsvService/**/*.ts',
                'src/services/DashboardService/**/*.ts',
                'src/services/GdriveService/**/*.ts',
                'src/services/GithubAppService/**/*.ts',
                'src/services/ProjectCompileLogService/**/*.ts',
                'src/services/SavedChartsService/**/*.ts',
                'src/services/SavedSqlService/**/*.ts',
                'src/services/SchedulerService/**/*.ts',
                'src/services/SearchService/**/*.ts',
                'src/services/SpaceService/**/*.ts',
                'src/services/SpotlightService/**/*.ts',
                'src/services/FavoritesService/**/*.ts',
                'src/services/PinningService/**/*.ts',
                'src/services/RolesService/**/*.ts',
                'src/services/DeployService.ts',
                'src/services/FunnelService/**/*.ts',
                'src/services/GitlabAppService/**/*.ts',
                'src/services/ProjectParametersService.ts',
                'src/services/SavedChartsService/**/*.ts',
                'src/services/SavedSqlService/**/*.ts',
                'src/services/SchedulerService/**/*.ts',
                'src/services/ShareService/**/*.ts',
                'src/services/SlackIntegrationService/**/*.ts',
                'src/services/SpaceService/**/*.ts',
                'src/services/UnfurlService/**/*.ts',
            ],
            rules: {
                'no-direct-ability-check': 'error',
            },
        },
        {
            // Require @summary tag in JSDoc comments for controller API endpoints
            // This ensures API documentation has human-readable names
            // Only applies to methods with decorators (API endpoints have @Get, @Post, etc.)
            files: [
                'src/controllers/**/*Controller.ts',
                'src/ee/controllers/**/*Controller.ts',
            ],
            rules: {
                'jsdoc/no-restricted-syntax': [
                    'error',
                    {
                        contexts: [
                            {
                                // Match JSDoc blocks on decorated methods that are missing @summary
                                // Methods with decorators are API endpoints (@Get, @Post, @OperationId, etc.)
                                comment:
                                    'JsdocBlock:not(*:has(JsdocTag[tag="summary"]))',
                                context: 'MethodDefinition:has(Decorator)',
                                message:
                                    '@summary tag is required for API endpoint documentation. Add it like: /** @summary Human readable name */',
                            },
                        ],
                    },
                ],
            },
        },
    ],
};
