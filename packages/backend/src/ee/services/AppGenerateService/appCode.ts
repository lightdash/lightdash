import { type DataAppManifest } from '@lightdash/common';

export const versionPrefix = (appUuid: string, version: number): string =>
    `apps/${appUuid}/versions/${version}/`;

export const s3KeyToRelPath = (key: string, prefix: string): string =>
    key.slice(prefix.length);

export const relPathToS3Key = (relPath: string, prefix: string): string =>
    `${prefix}${relPath}`;

// Deliberately no appUuid: identity is the slug, and uuid-free manifests are
// portable across projects (matching charts-as-code).
export const buildManifest = (args: {
    slug: string;
    projectUuid: string;
    version: number;
    name: string;
    description: string;
    template: DataAppManifest['template'];
    vizSchema?: DataAppManifest['vizSchema'];
    externalConnections?: DataAppManifest['externalConnections'];
    downloadedAt: string;
}): DataAppManifest => ({ codeVersion: 1, ...args });

const MIME: Record<string, string> = {
    html: 'text/html',
    js: 'application/javascript',
    css: 'text/css',
    json: 'application/json',
    svg: 'image/svg+xml',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    woff: 'font/woff',
    woff2: 'font/woff2',
    ttf: 'font/ttf',
    eot: 'application/vnd.ms-fontobject',
    ico: 'image/x-icon',
    tar: 'application/x-tar',
    map: 'application/json',
};

export const contentTypeForPath = (relPath: string): string => {
    const ext = relPath.split('.').pop()?.toLowerCase() ?? '';
    return MIME[ext] ?? 'application/octet-stream';
};
