import { promises as fs } from 'fs';
import * as path from 'path';

export const METADATA_FILENAME = '.lightdash-metadata.json';

export type LightdashMetadata = {
    version: 1;
    charts: Record<string, string>; // slug -> ISO timestamp
    dashboards: Record<string, string>; // slug -> ISO timestamp
};

const emptyMetadata = (): LightdashMetadata => ({
    version: 1,
    charts: {},
    dashboards: {},
});

export const readMetadataFile = async (
    baseDir: string,
): Promise<LightdashMetadata> => {
    const filePath = path.join(baseDir, METADATA_FILENAME);
    try {
        const content = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(content) as LightdashMetadata;
    } catch {
        return emptyMetadata();
    }
};

export const writeMetadataFile = async (
    baseDir: string,
    metadata: LightdashMetadata,
): Promise<void> => {
    const existing = await readMetadataFile(baseDir);
    const merged: LightdashMetadata = {
        version: 1,
        charts: { ...existing.charts, ...metadata.charts },
        dashboards: { ...existing.dashboards, ...metadata.dashboards },
    };
    const filePath = path.join(baseDir, METADATA_FILENAME);
    await fs.writeFile(filePath, JSON.stringify(merged, null, 2));
};
