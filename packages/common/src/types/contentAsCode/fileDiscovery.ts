export type ContentAsCodeFileType = 'chart' | 'dashboard';

export type ContentAsCodeFileClassification =
    | {
          kind: 'content';
          contentType: ContentAsCodeFileType;
          supportedExtension: boolean;
      }
    | { kind: 'loose'; supportedExtension: boolean };

// Joins repo path segments, dropping empty ones and stray slashes
export const joinContentAsCodePath = (...segments: string[]): string =>
    segments
        .map((segment) => segment.replace(/^\/+|\/+$/g, ''))
        .filter((segment) => segment !== '')
        .join('/');

// Same rules as `lightdash upload`: YAML under a charts/ or dashboards/
// folder is that content type, other YAML is classified by its contentType
export const classifyContentAsCodeFilePath = (
    posixPath: string,
): ContentAsCodeFileClassification | undefined => {
    const supportedExtension = posixPath.endsWith('.yml');
    if (!supportedExtension && !posixPath.endsWith('.yaml')) return undefined;
    if (
        posixPath.endsWith('.space.yml') ||
        posixPath.endsWith('.language.map.yml')
    ) {
        return undefined;
    }
    const segments = posixPath.split('/');
    const parentFolder =
        segments.length > 1 ? segments[segments.length - 2] : '';
    if (parentFolder === 'charts') {
        return { kind: 'content', contentType: 'chart', supportedExtension };
    }
    if (parentFolder === 'dashboards') {
        return {
            kind: 'content',
            contentType: 'dashboard',
            supportedExtension,
        };
    }
    return { kind: 'loose', supportedExtension };
};

export const isSqlChartContent = (item: object): boolean =>
    'sql' in item && !('tableName' in item);
