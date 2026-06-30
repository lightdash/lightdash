import { type DataAppTemplate } from './types';

export const currentDataAppCodeVersion = 1 as const;

export type DataAppManifest = {
    codeVersion: typeof currentDataAppCodeVersion;
    appUuid: string;
    projectUuid: string;
    version: number;
    name: string;
    description: string;
    template: Exclude<DataAppTemplate, 'custom'> | null;
    downloadedAt: string; // ISO
};

export type DataAppCodeFile = {
    path: string; // relative to the version prefix, forward slashes, no leading slash
    contentBase64: string;
};

export type DataAppCode = {
    manifest: DataAppManifest;
    files: DataAppCodeFile[];
};

const isSafeRelPath = (p: string): boolean =>
    typeof p === 'string' &&
    p.length > 0 &&
    !p.startsWith('/') &&
    !p.split('/').includes('..');

export function validateDataAppCode(value: unknown): DataAppCode {
    const v = value as Partial<DataAppCode>;
    if (!v || typeof v !== 'object')
        throw new Error('Invalid app bundle: not an object');
    if (!v.manifest || typeof v.manifest !== 'object')
        throw new Error('Invalid app bundle: missing manifest');
    if (!Array.isArray(v.files))
        throw new Error('Invalid app bundle: missing files');
    for (const f of v.files) {
        if (!isSafeRelPath(f?.path))
            throw new Error(
                `Invalid app bundle: unsafe file path "${f?.path}"`,
            );
        if (typeof f?.contentBase64 !== 'string')
            throw new Error(
                `Invalid app bundle: file "${f?.path}" missing content`,
            );
    }
    return v as DataAppCode;
}
