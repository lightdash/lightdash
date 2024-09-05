module.exports = {
    lightdash: [
        'intro',
        {
            type: 'category',
            label: 'Getting started tutorials',
            link: {
                type: 'doc',
                id: 'get-started/intro',
            },
            collapsed: false,
            items: [
                {
                    type: 'category',
                    label: 'Setting up a new project',
                    link: {
                        type: 'doc',
                        id: 'get-started/setup-lightdash/intro',
                    },
                    items: [
                        'get-started/setup-lightdash/get-project-lightdash-ready',
                        'get-started/setup-lightdash/connect-project',
                        'get-started/setup-lightdash/intro-metrics-dimensions',
                        'get-started/setup-lightdash/using-explores',
                        'get-started/setup-lightdash/how-to-create-metrics',
                        'get-started/setup-lightdash/invite-new-users',
                        'get-started/setup-lightdash/sharing-insights',
                    ],
                },
                {
                    type: 'category',
                    label: 'Developing in Lightdash',
                    link: {
                        type: 'doc',
                        id: 'get-started/develop-in-lightdash/intro',
                    },
                    items: [
                        'get-started/develop-in-lightdash/exploring-your-content',
                        'get-started/develop-in-lightdash/intro-metrics-dimensions',
                        'get-started/develop-in-lightdash/using-explores',
                        'get-started/develop-in-lightdash/how-to-create-dimensions',
                        'get-started/develop-in-lightdash/how-to-create-metrics',
                        'get-started/develop-in-lightdash/sharing-insights',
                    ],
                },
                {
                    type: 'category',
                    label: 'Learning to explore data in Lightdash',
                    link: {
                        type: 'doc',
                        id: 'get-started/exploring-data/intro',
                    },
                    items: [
                        'get-started/exploring-data/exploring-your-content',
                        'get-started/exploring-data/intro-metrics-dimensions',
                        'get-started/exploring-data/using-explores',
                        'get-started/exploring-data/sharing-insights',
                        'get-started/exploring-data/dashboards',
                    ],
                },
            ],
        },
        {
            type: 'category',
            label: 'Guides',
            items: [
                'guides/adding-tables-to-lightdash',
                'guides/how-to-create-dimensions',
                'guides/how-to-create-metrics',
                'guides/how-to-join-tables',
                {
                    type: 'category',
                    label: 'The Lightdash CLI',
                    link: {
                        type: 'generated-index',
                        title: 'The Lightdash CLI',
                        description:
                            'The Lightdash CLI is the recommended way to develop your dbt + Lightdash project. It makes development faster and easier, as well as giving you options for building more powerful automation to manage your Lightdash instance. Here are some guides to get you started!',
                        slug: '/guides/cli/intro',
                        keywords: ['cli'],
                    },
                    items: [
                        'guides/cli/how-to-install-the-lightdash-cli',
                        'guides/cli/cli-authentication',
                        'guides/cli/how-to-upgrade-cli',
                        'guides/cli/how-to-auto-generate-schema-files',
                        'guides/cli/how-to-use-lightdash-preview',
                        'guides/cli/how-to-use-lightdash-deploy',
                        'guides/cli/how-to-compile-your-lightdash-project',
                        'guides/cli/how-to-use-lightdash-validate',
                    ],
                },
                'guides/formatting-your-fields',
                'guides/limiting-data-using-filters',
                {
                    type: 'category',
                    label: 'Table calculation SQL templates',
                    link: {
                        type: 'generated-index',
                        title: 'SQL templates',
                        description:
                            'Use our SQL templates to get started with your table calculations!',
                        slug: '/guides/table-calculations/sql-templates',
                        keywords: ['sql', 'templates'],
                    },
                    items: [
                        'guides/table-calculations/table-calculation-sql-templates/percent-change-from-previous',
                        'guides/table-calculations/table-calculation-sql-templates/percent-of-previous-value',
                        'guides/table-calculations/table-calculation-sql-templates/percent-of-total-column',
                        'guides/table-calculations/table-calculation-sql-templates/percent-of-group-pivot-total',
                        'guides/table-calculations/table-calculation-sql-templates/rank-in-column',
                        'guides/table-calculations/table-calculation-sql-templates/running-total',
                        'guides/table-calculations/table-calculation-sql-templates/rolling-window',
                    ],
                },
                'guides/interactive-dashboards',
                'guides/how-to-embed-content',
                'guides/pinning',
                'guides/adding-slack-integration',
                'guides/using-slack-integration',
                'guides/how-to-create-scheduled-deliveries',
                'guides/how-to-create-alerts',
                'guides/version-history',
                'guides/how-to-create-multiple-projects',
                'guides/customizing-the-appearance-of-your-project',
                'guides/how-to-promote-content',
            ],
        },
        {
            type: 'category',
            label: 'References',
            link: {
                type: 'generated-index',
                title: 'Lightdash Reference Docs',
                description:
                    'Reference docs are broken down into the categories below.',
                slug: '/references',
            },
            items: [
                {
                    type: 'category',
                    label: 'Lightdash Development',
                    link: {
                        type: 'generated-index',
                        title: 'Lightdash Development Reference Docs',
                        description:
                            'Below are detailed reference docs about data development in Lightdash. That includes the YAML in Lightdash Semantic Layer and anywhere you need to use SQL.',
                        slug: '/references/develop',
                    },
                    items: [
                        {
                            type: 'doc',
                            id: 'references/dimensions',
                            label: 'Dimensions',
                        },
                        {
                            type: 'doc',
                            id: 'references/metrics',
                            label: 'Metrics',
                        },
                        {
                            type: 'doc',
                            id: 'references/tables',
                            label: 'Tables',
                        },
                        {
                            type: 'doc',
                            id: 'references/joins',
                            label: 'Joins',
                        },
                        {
                            type: 'doc',
                            id: 'references/validating-your-content',
                            label: 'Validator',
                        },
                        'references/sql-runner',
                        'references/sql-variables',
                    ],
                },
                {
                    type: 'category',
                    label: 'Data Exploration',
                    link: {
                        type: 'generated-index',
                        title: 'Data Exploration Reference Docs',
                        description:
                            'Below are detailed reference docs for all the ways you can explore and visualize data in Lightdash.',
                        slug: '/references/explore',
                    },
                    items: [
                        'references/chart-types',
                        {
                            type: 'doc',
                            id: 'get-started/exploring-data/dashboards',
                            label: 'Dashboards',
                        },
                        {
                            type: 'doc',
                            id: 'references/filters',
                            label: 'Filters',
                        },
                        'references/table-calculations',
                        'references/spaces',
                    ],
                },
                {
                    type: 'doc',
                    id: 'references/lightdash-cli',
                    label: 'CLI',
                },
                {
                    type: 'category',
                    label: 'Integrations',
                    link: {
                        type: 'generated-index',
                        title: 'Lightdash Integration Reference Docs',
                        description:
                            'Reference docs for all integrations available on Lightdash.',
                        slug: '/references/integrations',
                    },
                    items: [
                        'references/dbt-projects',
                        'references/dbt-semantic-layer',
                        {
                          type: 'doc',
                          id: 'references/slack-integration',
                          label: 'Slack',
                        },
                        'references/google-sheets',
                    ],
                },
                {
                    type: 'category',
                    label: 'Admin',
                    link: {
                        type: 'generated-index',
                        title: 'Lightdash Admin References',
                        description:
                            'Below are reference docs for all admin functions and features in Lightdash.',
                        slug: 'references/admin',
                    },
                    items: [
                        {
                            type: 'doc',
                            id: 'references/personal_tokens',
                            label: 'Project Settings',
                        },
                        'references/usage-analytics',
                        'references/roles',
                        'references/groups',
                        'references/user-attributes',
                    ],
                },
                'references/embedding',
            ],
        },
        {
            type: 'category',
            label: 'Self-hosting',
            items: [
                {
                    type: 'autogenerated',
                    dirName: 'self-host',
                },
            ],
        },
        {
            type: 'link',
            label: 'FAQs',
            href: 'https://lightdash-knowledge-base.help.usepylon.com/collections/9907632828-faqs',
        },
        {
            type: 'doc',
            label: 'Contact',
            id: 'contact/contact_info',
        },
    ],
};
