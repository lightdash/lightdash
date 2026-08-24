import * as path from 'path';

export type ContentFileType = 'chart' | 'dashboard';

export type ContentFileClassification =
    | {
          kind: 'content';
          contentType: ContentFileType;
          supportedExtension: boolean;
      }
    | { kind: 'loose'; supportedExtension: boolean };

const isWithinRoot = (filePath: string, rootPath: string): boolean => {
    const relativePath = path.relative(rootPath, filePath);
    return (
        relativePath === '' ||
        (!relativePath.startsWith(`..${path.sep}`) &&
            relativePath !== '..' &&
            !path.isAbsolute(relativePath))
    );
};

export const classifyContentFilePath = (
    filePath: string,
    rootPath?: string,
): ContentFileClassification | undefined => {
    if (rootPath && !isWithinRoot(filePath, rootPath)) return undefined;

    const supportedExtension = filePath.endsWith('.yml');
    if (!supportedExtension && !filePath.endsWith('.yaml')) return undefined;

    if (
        filePath.endsWith('.space.yml') ||
        filePath.endsWith('.language.map.yml')
    ) {
        return undefined;
    }

    const parentFolder = path.basename(path.dirname(filePath));
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
