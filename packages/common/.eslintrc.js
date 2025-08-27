module.exports = {
    parserOptions: {
        project: './tsconfig.json',
        createDefaultProgram: true,
    },
    extends: [
        './../../.eslintrc.js',
        'eslint:recommended',
        'airbnb-base',
        'airbnb-typescript/base',
        'prettier',
        'plugin:json/recommended',
    ],
    rules: {
        'no-restricted-syntax': 'off',
        'no-case-declarations': 'off',
        'no-template-curly-in-string': 'off',
        'import/prefer-default-export': 'off',
        '@typescript-eslint/consistent-type-imports': [
            'error',
            {
                prefer: 'type-imports',
                fixStyle: 'inline-type-imports',
            },
        ],
        '@typescript-eslint/no-unused-vars': [
            'error',
            {
                argsIgnorePattern: '^_',
                varsIgnorePattern: '^_',
                ignoreRestSiblings: true,
            },
        ],
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
                'src/compiler/exploreCompiler.ts',
                'src/compiler/translator.ts',
                'src/index.ts',
                'src/pivot/pivotQueryResults.ts',
                'src/types/dbt.ts',
                'src/types/field.ts',
                'src/types/filter.ts',
                'src/types/filterGrammar.ts',
                'src/types/metricQuery.ts',
                'src/types/user.ts',
                'src/utils/accessors.ts',
                'src/utils/convertToDbt.ts',
                'src/utils/filters.ts',
                'src/visualizations/CartesianChartDataModel.ts',
                'src/visualizations/TableDataModel.ts',
                'src/types/filterGrammarConversion.ts',
            ],
            rules: {
                '@typescript-eslint/no-unsafe-member-access': 'off',
                '@typescript-eslint/no-unsafe-assignment': 'off',
                '@typescript-eslint/no-unsafe-call': 'off',
            },
        },
        {
            files: ['*.mock.ts', '*.test.ts', '*.spec.ts'],
            rules: {
                '@typescript-eslint/no-unsafe-member-access': 'off',
                '@typescript-eslint/no-unsafe-assignment': 'off',
                '@typescript-eslint/no-unsafe-call': 'off',
            },
        },
    ],
};
