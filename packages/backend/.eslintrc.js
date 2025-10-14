module.exports = {
    parserOptions: {
        project: './tsconfig.json',
        createDefaultProgram: true,
    },
    extends: [
        './../../.eslintrc.js',
        'eslint:recommended',
        'plugin:json/recommended',
        'airbnb-base',
        'airbnb-typescript/base',
        'prettier',
    ],
    settings: {
        'import/resolver': {
            node: {
                extensions: ['.js', '.jsx', '.ts', '.tsx']
            }
        }
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
        '@typescript-eslint/no-floating-promises': 'error'
    },
    overrides: [
        
        {
            files: ['*.ts'], 
            rules: {
                "@typescript-eslint/no-unsafe-member-access": "error",
                "@typescript-eslint/no-unsafe-assignment": "error",
                "@typescript-eslint/no-unsafe-call": "error"
            }
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
            ], 
            rules: {
                "@typescript-eslint/no-unsafe-member-access": "off",
                "@typescript-eslint/no-unsafe-assignment": "off",
                "@typescript-eslint/no-unsafe-call": "off"
            }
        },
        {
            files: ['src/database/migrations/*.ts',
                'src/routers/*.ts',
                '*.mock.ts',
                '*.test.ts',
                '*.spec.ts',
            ],
            rules: {
                "@typescript-eslint/no-unsafe-member-access": "off",
                "@typescript-eslint/no-unsafe-assignment": "off",
                "@typescript-eslint/no-unsafe-call": "off"
            }
        },
       
    ]

};
