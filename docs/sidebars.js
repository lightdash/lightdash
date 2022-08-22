/**
 * Creating a sidebar enables you to:
 - create an ordered group of docs
 - render a sidebar for each doc of that group
 - provide next/previous navigation

 The sidebars can be generated from the filesystem, or explicitly defined here.

 Create as many sidebars as you want.
 */

module.exports = {
  lightdash: [
    "intro",
    {
      type: "category",
      label: "🌟 Getting started tutorials",
      link: {
        type: 'doc',
        id: 'get-started/intro'
      },
      collapsed: false,
      items: [
        {
          type: "category",
          label: "🏗 Setting up a new project",
          link: {
            type: 'doc',
            id: 'get-started/setup-lightdash/intro'
          },
          items: [
            "get-started/setup-lightdash/get-project-lightdash-ready",
            "get-started/setup-lightdash/install-lightdash",
            "get-started/setup-lightdash/connect-project",
            "get-started/exploring-data/using-explores",
            "get-started/setup-lightdash/add-metrics",
            "get-started/exploring-data/sharing-insights"
          ],
        },
        {
          type: "category",
          label: "👩‍💻 Developing in Lightdash",
          link: {
            type: 'doc',
            id: 'get-started/develop-in-lightdash/intro'
          },
          items: [
            "get-started/exploring-data/using-explores",
            "guides/how-to-create-dimensions",
            "guides/how-to-create-metrics",
            "guides/formatting-your-fields",
          ],
        },
        {
          type: "category",
          label: "🔭 Learning to explore data in Lightdash",
          link: {
            type: 'doc',
            id: 'get-started/exploring-data/intro'
          },
          items: [
            "get-started/exploring-data/using-explores",
            "get-started/exploring-data/sharing-insights",
            "get-started/exploring-data/dashboards"
          ],
        },
      ],
    },
    {
      type: "category",
      label: "👩‍🔧 Installation + operation",
      items: [
        "get-started/setup-lightdash/install-lightdash",
        "get-started/setup-lightdash/connect-project",
        "guides/how-to-deploy-to-kubernetes",
        "references/update-lightdash",
        "guides/how-to-create-multiple-projects",
        "references/lightdashyaml",
        "references/personal_tokens",
      ]
    },
    {
      type: "category",
      label: "👷‍♀️ Developing your project",
      items: [
        "get-started/setup-lightdash/get-project-lightdash-ready",
        {
          type: "category",
          label: "Tables",
          items: [
            "guides/adding-tables-to-lightdash",
            "references/tables",
          ],
        },
        {
          type: "category",
          label: "The Lightdash CLI",
          link: {
            type: 'generated-index',
            title: 'The Lightdash CLI',
            description: 'The Lightdash CLI is the recommended way to develop your dbt + Lightdash project. It makes development faster and easier, as well as giving you options for building more powerful automation to manage your Lightdash instance. Here are some guides to get you started!',
            slug: '/guides/cli/intro',
            keywords: ['cli'],
          },
          items: [
            "guides/cli/how-to-install-the-lightdash-cli",
            "guides/cli/how-to-upgrade-cli",
            "guides/cli/how-to-auto-generate-schema-files",
            "guides/cli/how-to-use-lightdash-preview",
            "guides/cli/how-to-use-lightdash-deploy"
          ],
        },
        {
          type: "category",
          label: "Dimensions",
          items: [
            "guides/how-to-create-dimensions",
            "references/dimensions",
          ],
        },
        {
          type: "category",
          label: "Metrics",
          items: [
            "guides/how-to-create-metrics",
            "references/metrics",
          ],
        },
        {
          type: "category",
          label: "Joining tables",
          items: [
            "guides/how-to-join-tables",
            "references/joins",
          ],
        },
        "guides/formatting-your-fields",
        "references/syncing_your_dbt_changes"
      ]
    },
    {
      type: "category",
      label: "📈 Querying + visualizing your data",
      items: [
        "get-started/exploring-data/using-explores",
        "guides/limiting-data-using-filters",
        "guides/table-calculations/adding-table-calculations",
        {
          type: "category",
          label: "Table calculation SQL templates",
          link: {
            type: 'generated-index',
            title: 'SQL templates',
            description: 'Use our SQL templates to get started with your table calculations!',
            slug: '/guides/table-calculations/sql-templates',
            keywords: ['sql', 'templates'],
          },
          items: [
            "guides/table-calculations/table-calculation-sql-templates/percent-change-from-previous",
            "guides/table-calculations/table-calculation-sql-templates/percent-of-previous-value",
            "guides/table-calculations/table-calculation-sql-templates/percent-of-total-column",
            "guides/table-calculations/table-calculation-sql-templates/rank-in-column",
            "guides/table-calculations/table-calculation-sql-templates/running-total",
          ],
        },
        "guides/visualizing-your-results",
      ]
    },
    {
      type: "category",
      label: "🎯 Dashboards",
      items: [
        "get-started/exploring-data/dashboards",
        "guides/limiting-data-using-filters",
        "guides/interactive-dashboards",
      ]
    },
    {
      type: "category",
      label:"🔎 Finding + organizing things",
      items:[
        "guides/exploring-your-content",
        "guides/spaces",
      ]
    },
    {
      type: "category",
      label: "👪 Users",
      items: [
        "guides/how-to-reset-your-password",
      ]
    },
    {
      type: "category",
      label: "🔐 Permissions",
      items: [
        "references/roles",
      ]
    },
    {
      type: "category",
      label: "🎨 Configuring Lightdash",
      items: [
        "guides/customizing-the-appearance-of-your-project",
      ]
    },
    {
      type: "category",
      label: "🎓 Lightdash University: Best Practice",
      items: [
        "best-practice/lightdash-way",
        "best-practice/planning-your-dashboard",
      ]
    },
    {
      type: "category",
      label: "🙋‍♀️ Troubleshooting and getting help",
      items: [
        "help-and-contact/contact/contact_info",
        "help-and-contact/faqs/faqs",
      ]
    },
  ],
};
