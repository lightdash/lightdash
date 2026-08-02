import * as path from 'path';

export const getDownloadFolder = (customPath?: string): string => {
    if (customPath) {
        return path.isAbsolute(customPath)
            ? customPath
            : path.join(process.cwd(), customPath);
    }
    return path.join(process.cwd(), 'lightdash');
};
