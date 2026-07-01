import { type ApiSuccess } from '../../types/api/success';
import { type DataAppTemplate } from './types';

export const currentDataAppCodeVersion = 1 as const;

export type DataAppManifest = {
    codeVersion: 1;
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

export type ApiGetAppCodeResponse = ApiSuccess<DataAppCode>;

export type ImportAppCodeRequestBody = {
    code: DataAppCode;
    // when present and the app exists in the target project -> append a version; otherwise create a new app
    targetAppUuid?: string;
    spaceUuid?: string;
};

export type ApiImportAppCodeResponse = ApiSuccess<{
    appUuid: string;
    version: number;
    action: 'create' | 'append';
}>;

const isSafeRelPath = (p: string): boolean => {
    if (typeof p !== 'string' || p.length === 0 || p.startsWith('/'))
        return false;
    // Every segment must be a real filename: no empty segments (leading,
    // trailing, or double slashes) and no '.'/'..' directory references.
    return p
        .split('/')
        .every(
            (segment) =>
                segment.length > 0 && segment !== '.' && segment !== '..',
        );
};

export function validateDataAppCode(value: unknown): DataAppCode {
    const v = value as Partial<DataAppCode>;
    if (!v || typeof v !== 'object')
        throw new Error('Invalid app bundle: not an object');
    if (!v.manifest || typeof v.manifest !== 'object')
        throw new Error('Invalid app bundle: missing manifest');
    if (!Array.isArray(v.files))
        throw new Error('Invalid app bundle: missing files');
    for (const f of v.files) {
        if (!f || typeof f !== 'object')
            throw new Error('Invalid app bundle: file entry is not an object');
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
