/** @type {import('@docusaurus/types').DocusaurusConfig} */
const path = require('path');

module.exports = {
    title: 'Documentation | Lightdash',
    tagline:
        'Documentation. Learn how to use Lightdash and setup the BI tool for the modern data stack.',
    url: 'https://docs.lightdash.com',
    baseUrl: '/',
    onBrokenLinks: 'throw',
    onBrokenMarkdownLinks: 'warn',
    favicon: 'img/favicon-32x32.png', // TODO update
    organizationName: 'lightdash', // Usually your GitHub org/user name.
    projectName: 'lightdash', // Usually your repo name.
    plugins: [
        [
            path.resolve(__dirname, 'docusaurus-rudderstack-plugin'),
            {
                dataplaneUrl: process.env.RUDDERSTACK_DATAPLANE_URL,
                writeKey: process.env.RUDDERSTACK_WRITE_KEY,
            },
        ],
    ],
    themes: [
        [
            require.resolve('@easyops-cn/docusaurus-search-local'),
            {
                indexDocs: true,
                indexBlog: false,
                indexPages: true,
            },
        ],
    ],
    themeConfig: {
        navbar: {
            title: 'Lightdash',
            logo: {
                alt: 'lightdash logo',
                src: 'img/logo.png',
            },
            items: [
                {
                    type: 'doc',
                    docId: 'intro',
                    position: 'left',
                    label: 'Docs',
                },
                {
                    to: '/api/v1',
                    position: 'left',
                    label: 'API',
                },
                {
                    label: 'Live demo',
                    href: 'https://demo.lightdash.com/',
                    position: 'left',
                },
                {
                    href: 'https://github.com/lightdash/lightdash',
                    position: 'right',
                    className: 'header-github-link',
                    'aria-label': 'GitHub repository',
                },
            ],
        },
        footer: {
            style: 'dark',
            logo: {
                alt: 'Lightdash Logo',
                src: 'img/lightdash-full-darkbg.png',
                href: 'https://lightdash.com',
                width: 570,
            },
            links: [
                {
                    label: 'Community',
                    href: 'https://github.com/lightdash/lightdash/discussions',
                },
                {
                    label: 'Blog',
                    href: 'https://www.lightdash.com/blog',
                },
                {
                    label: 'Company',
                    href: 'https://www.lightdash.com/company',
                },
                {
                    label: 'Careers',
                    href: 'https://www.notion.so/lightdash/Lightdash-Job-Board-a2c7d872794b45deb7b76ad68701d750',
                },
                {
                    label: 'Media kit',
                    href: 'https://www.notion.so/lightdash/Lightdash-Media-kit-f4424136bb5a4c8891c0d535dd5e5911',
                },
            ],
            copyright: `Copyright © ${new Date().getFullYear()} Lightdash. Built with Docusaurus.`,
        },
    },
    presets: [
        [
            '@docusaurus/preset-classic',
            {
                docs: {
                    sidebarPath: require.resolve('./sidebars.js'),
                    routeBasePath: '/',
                    // Please change this to your repo.
                    editUrl:
                        'https://github.com/lightdash/lightdash/edit/main/docs/',
                },
                theme: {
                    customCss: require.resolve('./src/css/custom.css'),
                },
            },
        ],
        [
            'redocusaurus',
            {
                specs: [
                    {
                        id: 'api-v1',
                        spec: '../packages/backend/src/swagger.json',
                        route: '/api/v1/',
                    },
                ],
                theme: {
                    primaryColor: '#7262FF',
                    options: {
                        // see all options here: https://github.com/Redocly/redoc#redoc-options-object
                        disableSearch: true,
                        hideHostname: true,
                        hideDownloadButton: true,
                    },
                },
            },
        ],
    ],
};
