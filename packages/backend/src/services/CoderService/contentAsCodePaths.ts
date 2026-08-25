const CONTENT_AS_CODE_ROOT_FOLDER = 'lightdash'; // pragma: allowlist secret
const CONTENT_AS_CODE_CHARTS_FOLDER = 'charts';
const CONTENT_AS_CODE_DASHBOARDS_FOLDER = 'dashboards';

export const getContentAsCodeChartRelativePath = (slug: string): string =>
    `${CONTENT_AS_CODE_ROOT_FOLDER}/${CONTENT_AS_CODE_CHARTS_FOLDER}/${slug}.yml`;

export const getContentAsCodeDashboardRelativePath = (slug: string): string =>
    `${CONTENT_AS_CODE_ROOT_FOLDER}/${CONTENT_AS_CODE_DASHBOARDS_FOLDER}/${slug}.yml`;
