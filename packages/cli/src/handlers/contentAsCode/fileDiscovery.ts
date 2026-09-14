import {
    classifyContentAsCodeFilePath,
    isSqlChartContent,
    type ContentAsCodeFileClassification,
    type ContentAsCodeFileType,
} from '@lightdash/common';
import * as path from 'path';

export type ContentFileType = ContentAsCodeFileType;

export type ContentFileClassification = ContentAsCodeFileClassification;

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
    return classifyContentAsCodeFilePath(filePath.split(path.sep).join('/'));
};

export { isSqlChartContent };
