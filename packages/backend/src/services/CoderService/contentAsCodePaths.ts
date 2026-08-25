const CONTENT_AS_CODE_ROOT_FOLDER = 'lightdash'; // pragma: allowlist secret
const CONTENT_AS_CODE_CHARTS_FOLDER = 'charts';

export const getContentAsCodeChartRelativePath = (slug: string): string =>
    `${CONTENT_AS_CODE_ROOT_FOLDER}/${CONTENT_AS_CODE_CHARTS_FOLDER}/${slug}.yml`;
