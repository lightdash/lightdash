/* eslint-disable no-await-in-loop */
import {
    assertUnreachable,
    getErrorMessage,
    ParameterError,
    PromotionAction,
    type ContentAsCodeResourceKind,
    type ContentAsCodeUpsertAction,
} from '@lightdash/common';
import { promises as fs, type Dirent } from 'fs';
import * as yaml from 'js-yaml';
import * as path from 'path';
import { allocateContentFileNames } from './fileNames';

export type CodeResourceScope = 'project' | 'organization';

export type CodeResourceDefinition<Document> = {
    kind: ContentAsCodeResourceKind;
    displayLabel: string;
    identityLabel: string;
    scope: CodeResourceScope;
    folderName: string;
    acceptedExtensions: readonly string[];
    fileName: {
        strategy:
            | 'normalizedDisplayName'
            | 'identity'
            | 'uriEncodedIdentity'
            | 'space'
            | 'scheduledResource';
        fallbackPrefix: string;
        extension: string;
    };
    dependencies: readonly ContentAsCodeResourceKind[];
    recursive?: boolean;
    identity: (document: Document) => string;
    normalizeIdentity?: (identity: string) => string;
    displayName: (document: Document) => string;
    matches?: (value: unknown) => boolean;
    parse: (value: unknown, source: string) => Document;
    serialize?: (document: Document) => unknown;
    sort?: (left: Document, right: Document) => number;
};

export type CodeFileFailure = {
    message: string;
};

export type CodeResourceFiles<Document> = {
    files: Array<{ filePath: string; document: Document }>;
    failures: CodeFileFailure[];
};

export type CodeResourceUploadSummary = {
    created: number;
    updated: number;
    unchanged: number;
    failed: number;
    failures: CodeFileFailure[];
};

export class CodeResourcePhaseError extends ParameterError {
    readonly resource: ContentAsCodeResourceKind;

    constructor(resource: ContentAsCodeResourceKind, message: string) {
        super(message);
        this.name = 'CodeResourcePhaseError';
        this.resource = resource;
    }
}

export const isCodeResourcePhaseError = (
    error: unknown,
): error is CodeResourcePhaseError => error instanceof CodeResourcePhaseError;

const isAcceptedFile = <Document>(
    definition: CodeResourceDefinition<Document>,
    entry: Dirent,
): boolean =>
    entry.isFile() &&
    definition.acceptedExtensions.some((extension) =>
        entry.name.endsWith(extension),
    );

const normalizeIdentity = <Document>(
    definition: CodeResourceDefinition<Document>,
    identity: string,
): string => definition.normalizeIdentity?.(identity) ?? identity;

export const readCodeResourceFiles = async <Document>({
    definition,
    basePath,
}: {
    definition: CodeResourceDefinition<Document>;
    basePath: string;
}): Promise<CodeResourceFiles<Document>> => {
    const folder = path.join(basePath, definition.folderName);
    let entries: Dirent[];
    try {
        entries = await fs.readdir(folder, {
            withFileTypes: true,
            recursive: definition.recursive,
        });
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return { files: [], failures: [] };
        }
        throw error;
    }

    const parsed: CodeResourceFiles<Document> = { files: [], failures: [] };
    for (const entry of entries
        .filter((item) => isAcceptedFile(definition, item))
        .sort((left, right) => left.name.localeCompare(right.name))) {
        const filePath = path.join(entry.parentPath ?? folder, entry.name);
        try {
            const value = yaml.load(await fs.readFile(filePath, 'utf8'));
            if (!definition.matches || definition.matches(value)) {
                const document = definition.parse(value, filePath);
                parsed.files.push({ filePath, document });
            }
        } catch (error) {
            parsed.failures.push({
                message: `Invalid ${definition.displayLabel} file "${filePath}": ${getErrorMessage(error)}`,
            });
        }
    }

    const filesByIdentity = parsed.files.reduce<
        Map<string, Array<{ filePath: string; document: Document }>>
    >((result, file) => {
        const identity = normalizeIdentity(
            definition,
            definition.identity(file.document),
        );
        result.set(identity, [...(result.get(identity) ?? []), file]);
        return result;
    }, new Map());
    const duplicateIdentities = new Set(
        [...filesByIdentity.entries()]
            .filter(([, files]) => files.length > 1)
            .map(([identity]) => identity),
    );
    for (const identity of [...duplicateIdentities].sort()) {
        for (const file of filesByIdentity.get(identity) ?? []) {
            parsed.failures.push({
                message: `Duplicate ${definition.displayLabel} ${definition.identityLabel} "${identity}" in "${file.filePath}"`,
            });
        }
    }
    parsed.files = parsed.files.filter(
        ({ document }) =>
            !duplicateIdentities.has(
                normalizeIdentity(definition, definition.identity(document)),
            ),
    );
    return parsed;
};

export const writeCodeResourceDocuments = async <Document>({
    definition,
    basePath,
    documents,
}: {
    definition: CodeResourceDefinition<Document>;
    basePath: string;
    documents: Document[];
}): Promise<void> => {
    const sortedDocuments = definition.sort
        ? [...documents].sort(definition.sort)
        : documents;
    const folder = path.join(basePath, definition.folderName);
    await fs.mkdir(folder, { recursive: true });

    const current = await readCodeResourceFiles({ definition, basePath });
    const existingFileNameByIdentity = new Map(
        current.files.map(({ filePath, document }) => [
            definition.identity(document),
            path.basename(filePath),
        ]),
    );
    const reservedFileNames = (
        await fs.readdir(folder, { withFileTypes: true })
    )
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name);
    const preferredFileName = (document: Document): string | undefined => {
        switch (definition.fileName.strategy) {
            case 'identity':
                return `${definition.identity(document)}${definition.fileName.extension}`;
            case 'uriEncodedIdentity':
                return `${encodeURIComponent(definition.identity(document))}${definition.fileName.extension}`;
            default:
                return undefined;
        }
    };
    const fileNames = allocateContentFileNames({
        items: sortedDocuments.map((document) => ({
            identity: definition.identity(document),
            displayName: definition.displayName(document),
            preferredFileName: preferredFileName(document),
        })),
        fallbackPrefix: definition.fileName.fallbackPrefix,
        extension: definition.fileName.extension,
        existingFileNameByIdentity,
        reservedFileNames,
    });

    await Promise.all(
        sortedDocuments.map((document, index) =>
            fs.writeFile(
                path.join(folder, fileNames[index]),
                yaml.dump(definition.serialize?.(document) ?? document, {
                    quotingType: '"',
                    sortKeys: true,
                }),
            ),
        ),
    );

    const downloadedIdentities = new Set(
        sortedDocuments.map((document) =>
            normalizeIdentity(definition, definition.identity(document)),
        ),
    );
    await Promise.all(
        current.files
            .filter(
                ({ document }) =>
                    !downloadedIdentities.has(
                        normalizeIdentity(
                            definition,
                            definition.identity(document),
                        ),
                    ),
            )
            .map(({ filePath }) => fs.unlink(filePath)),
    );
};

export const downloadCodeResource = async <Document>({
    definition,
    basePath,
    list,
}: {
    definition: CodeResourceDefinition<Document>;
    basePath: string;
    list: () => Promise<Document[]>;
}): Promise<number> => {
    const documents = await list();
    await writeCodeResourceDocuments({ definition, basePath, documents });
    return documents.length;
};

const getActionCountKey = (
    action: ContentAsCodeUpsertAction,
): 'created' | 'updated' | 'unchanged' => {
    switch (action) {
        case PromotionAction.CREATE:
            return 'created';
        case PromotionAction.UPDATE:
            return 'updated';
        case PromotionAction.NO_CHANGES:
            return 'unchanged';
        default:
            return assertUnreachable(
                action,
                'Unsupported content-as-code action',
            );
    }
};

export const uploadCodeResource = async <Document>({
    definition,
    basePath,
    upsert,
}: {
    definition: CodeResourceDefinition<Document>;
    basePath: string;
    upsert: (document: Document) => Promise<ContentAsCodeUpsertAction>;
}): Promise<CodeResourceUploadSummary> => {
    const { files, failures } = await readCodeResourceFiles({
        definition,
        basePath,
    });
    const summary: CodeResourceUploadSummary = {
        created: 0,
        updated: 0,
        unchanged: 0,
        failed: 0,
        failures,
    };
    for (const { filePath, document } of files) {
        try {
            summary[getActionCountKey(await upsert(document))] += 1;
        } catch (error) {
            summary.failures.push({
                message: `Invalid ${definition.displayLabel} file "${filePath}": ${getErrorMessage(error)}`,
            });
        }
    }
    summary.failed = summary.failures.length;
    return summary;
};

export const assertCodeResourceFilesValid = <Document>(
    result: CodeResourceFiles<Document>,
): void => {
    if (result.failures.length > 0) {
        throw new ParameterError(
            result.failures.map(({ message }) => message).join('\n'),
        );
    }
};
