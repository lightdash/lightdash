import * as path from 'path';

export type ContentFileType = 'chart' | 'dashboard';

export const getContentFileType = (
    filePath: string,
): ContentFileType | undefined => {
    if (
        !filePath.endsWith('.yml') ||
        filePath.endsWith('.space.yml') ||
        filePath.endsWith('.language.map.yml')
    ) {
        return undefined;
    }

    const parentFolder = path.basename(path.dirname(filePath));
    if (parentFolder === 'charts') return 'chart';
    if (parentFolder === 'dashboards') return 'dashboard';
    return undefined;
};

export const isLooseContentFilePath = (filePath: string): boolean => {
    const parentFolder = path.basename(path.dirname(filePath));
    return (
        filePath.endsWith('.yml') &&
        !filePath.endsWith('.language.map.yml') &&
        parentFolder !== 'charts' &&
        parentFolder !== 'dashboards'
    );
};
