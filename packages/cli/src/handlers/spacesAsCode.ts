/* eslint-disable no-await-in-loop */
/* eslint-disable no-param-reassign */
import {
    ApiSpaceAsCodeListResponse,
    ApiSpaceAsCodeUpsertResponse,
    assertUnreachable,
    ContentAsCodeType as ContentAsCodeTypeEnum,
    getContentAsCodePathFromLtreePath,
    getErrorMessage,
    getLtreePathFromContentAsCodePath,
    LightdashError,
    ParameterError,
    SpaceAsCodeAction,
    SpaceMemberRole,
    validateEmail,
    type SpaceAsCode,
} from '@lightdash/common';
import { promises as fs, type Dirent } from 'fs';
import * as yaml from 'js-yaml';
import * as path from 'path';
import GlobalState from '../globalState';
import * as styles from '../styles';
import { shouldWarnAllSkipped } from './apps/appsDownload';
import {
    allocateContentFileNames,
    CODE_FILENAME_MAX_STEM_LENGTH,
    getContentFileNameStem,
    getStableCodeHash,
} from './contentAsCode/fileNames';
import { getDownloadFolder } from './contentAsCodePaths';
import { lightdashApi } from './dbt/apiClient';

type FolderScheme = 'flat' | 'nested';
type FlatSpaceLayout = 'folder' | 'root';

export type SpaceCodeFile = {
    filePath: string;
    space: SpaceAsCode;
};

type SpaceIdentity = {
    contentType: ContentAsCodeTypeEnum.SPACE;
    slug: string;
};

const SPACE_FILENAME_MAX_LENGTH = CODE_FILENAME_MAX_STEM_LENGTH;
const SPACE_FILENAME_HASH_LENGTH = 8;

const isSpaceIdentity = (value: unknown): value is SpaceIdentity =>
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    'contentType' in value &&
    value.contentType === ContentAsCodeTypeEnum.SPACE &&
    'slug' in value &&
    typeof value.slug === 'string';

const listSpaceFilePaths = async (baseDir: string): Promise<string[]> =>
    (
        await fs.readdir(baseDir, {
            recursive: true,
            withFileTypes: true,
        })
    )
        .filter((entry) => entry.isFile() && entry.name.endsWith('.space.yml'))
        .map((entry) => path.join(entry.parentPath, entry.name))
        .sort((left, right) => left.localeCompare(right));

const hasRootSpaceFile = async (baseDir: string): Promise<boolean> => {
    try {
        return (await fs.readdir(baseDir, { withFileTypes: true })).some(
            (entry) => entry.isFile() && entry.name.endsWith('.space.yml'),
        );
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
        throw error;
    }
};

const getStableSpaceHash = (
    value: string,
    length: number = SPACE_FILENAME_HASH_LENGTH,
): string => getStableCodeHash(value, length);

const getSpaceFilenameBase = (space: SpaceAsCode): string =>
    getContentFileNameStem({
        value: space.spaceName,
        fallbackPrefix: 'space',
        fallbackHashValue: space.slug,
        maxLength: SPACE_FILENAME_MAX_LENGTH,
    });

export const getFlatSpaceFileNames = (spaces: SpaceAsCode[]): string[] =>
    allocateContentFileNames({
        items: spaces.map((space) => ({
            identity: space.slug,
            displayName: space.spaceName,
        })),
        fallbackPrefix: 'space',
        extension: '.space.yml',
        maxStemLength: SPACE_FILENAME_MAX_LENGTH,
    });

const assertKnownKeys = (
    value: Record<string, unknown>,
    allowedKeys: string[],
    field: string,
    filePath: string,
): void => {
    const unknownKeys = Object.keys(value).filter(
        (key) => !allowedKeys.includes(key),
    );
    if (unknownKeys.length > 0) {
        throw new ParameterError(
            `Invalid ${field} in space file "${filePath}": unknown ${
                unknownKeys.length === 1 ? 'property' : 'properties'
            } ${unknownKeys.map((key) => `"${key}"`).join(', ')}`,
        );
    }
};

const isSpaceMemberRole = (value: unknown): value is SpaceMemberRole =>
    Object.values(SpaceMemberRole).includes(value as SpaceMemberRole);

export const validateSpaceIdentity = (
    parsed: unknown,
    filePath: string,
): SpaceAsCode => {
    if (
        typeof parsed !== 'object' ||
        parsed === null ||
        Array.isArray(parsed)
    ) {
        throw new ParameterError(
            `Invalid space file "${filePath}": expected a YAML object`,
        );
    }

    assertKnownKeys(
        parsed as Record<string, unknown>,
        ['contentType', 'version', 'spaceName', 'slug', 'access'],
        'space document',
        filePath,
    );

    if (
        !('contentType' in parsed) ||
        parsed.contentType !== ContentAsCodeTypeEnum.SPACE
    ) {
        throw new ParameterError(
            `Invalid contentType in space file "${filePath}": expected "${ContentAsCodeTypeEnum.SPACE}"`,
        );
    }
    if (
        !('spaceName' in parsed) ||
        typeof parsed.spaceName !== 'string' ||
        parsed.spaceName.trim().length === 0
    ) {
        throw new ParameterError(
            `Invalid spaceName in space file "${filePath}": expected a non-empty string`,
        );
    }
    if (
        !('slug' in parsed) ||
        typeof parsed.slug !== 'string' ||
        parsed.slug.trim().length === 0 ||
        parsed.slug !== parsed.slug.trim() ||
        !/^[a-z0-9-]+(?:\/[a-z0-9-]+)*$/.test(parsed.slug) ||
        getContentAsCodePathFromLtreePath(
            getLtreePathFromContentAsCodePath(parsed.slug),
        ) !== parsed.slug ||
        parsed.slug
            .split('/')
            .some((part) => part.length === 0 || part === '.' || part === '..')
    ) {
        throw new ParameterError(
            `Invalid slug in space file "${filePath}": expected a canonical lowercase slash-separated path`,
        );
    }

    if ('version' in parsed && parsed.version !== 1) {
        throw new ParameterError(
            `Invalid version in space file "${filePath}": expected 1`,
        );
    }

    if ('access' in parsed && parsed.access !== undefined) {
        if (!('version' in parsed) || parsed.version !== 1) {
            throw new ParameterError(
                `Invalid version in space file "${filePath}": version 1 is required when access is present`,
            );
        }
        if (
            typeof parsed.access !== 'object' ||
            parsed.access === null ||
            Array.isArray(parsed.access)
        ) {
            throw new ParameterError(
                `Invalid access in space file "${filePath}": expected an object`,
            );
        }

        const access = parsed.access as Record<string, unknown>;
        assertKnownKeys(
            access,
            [
                'inheritParentPermissions',
                'projectMemberAccessRole',
                'users',
                'groups',
            ],
            'access',
            filePath,
        );
        if (typeof access.inheritParentPermissions !== 'boolean') {
            throw new ParameterError(
                `Invalid access.inheritParentPermissions in space file "${filePath}": expected a boolean`,
            );
        }
        if (
            access.projectMemberAccessRole !== null &&
            !isSpaceMemberRole(access.projectMemberAccessRole)
        ) {
            throw new ParameterError(
                `Invalid access.projectMemberAccessRole in space file "${filePath}": expected viewer, editor, admin, or null`,
            );
        }
        if (!Array.isArray(access.users) || !Array.isArray(access.groups)) {
            throw new ParameterError(
                `Invalid access in space file "${filePath}": users and groups must be arrays`,
            );
        }

        const userEmails = new Set<string>();
        const users = access.users.map((item, index) => {
            if (
                typeof item !== 'object' ||
                item === null ||
                Array.isArray(item)
            ) {
                throw new ParameterError(
                    `Invalid access.users[${index}] in space file "${filePath}": expected an object`,
                );
            }
            const user = item as Record<string, unknown>;
            assertKnownKeys(
                user,
                ['email', 'role'],
                `access.users[${index}]`,
                filePath,
            );
            if (
                typeof user.email !== 'string' ||
                user.email.trim().length === 0 ||
                !validateEmail(user.email.trim()) ||
                !isSpaceMemberRole(user.role)
            ) {
                throw new ParameterError(
                    `Invalid access.users[${index}] in space file "${filePath}": expected a valid email and a viewer, editor, or admin role`,
                );
            }
            const email = user.email.trim().toLowerCase();
            if (userEmails.has(email)) {
                throw new ParameterError(
                    `Duplicate user email "${email}" in space file "${filePath}"`,
                );
            }
            userEmails.add(email);
            return { email, role: user.role };
        });

        const groupNames = new Set<string>();
        const groups = access.groups.map((item, index) => {
            if (
                typeof item !== 'object' ||
                item === null ||
                Array.isArray(item)
            ) {
                throw new ParameterError(
                    `Invalid access.groups[${index}] in space file "${filePath}": expected an object`,
                );
            }
            const group = item as Record<string, unknown>;
            assertKnownKeys(
                group,
                ['name', 'role'],
                `access.groups[${index}]`,
                filePath,
            );
            if (
                typeof group.name !== 'string' ||
                group.name.trim().length === 0 ||
                !isSpaceMemberRole(group.role)
            ) {
                throw new ParameterError(
                    `Invalid access.groups[${index}] in space file "${filePath}": expected a non-empty name and a viewer, editor, or admin role`,
                );
            }
            if (groupNames.has(group.name)) {
                throw new ParameterError(
                    `Duplicate group name "${group.name}" in space file "${filePath}"`,
                );
            }
            groupNames.add(group.name);
            return { name: group.name, role: group.role };
        });

        return {
            ...(parsed as SpaceAsCode),
            access: {
                inheritParentPermissions: access.inheritParentPermissions,
                projectMemberAccessRole: access.projectMemberAccessRole,
                users,
                groups,
            },
        } as SpaceAsCode;
    }

    return parsed as SpaceAsCode;
};

export const assertUniqueSpacePaths = (files: SpaceCodeFile[]): void => {
    const exactPaths = new Map<string, string>();
    const normalizedPaths = new Map<
        string,
        { slug: string; filePath: string }
    >();

    files.forEach(({ filePath, space }) => {
        const existingExact = exactPaths.get(space.slug);
        if (existingExact) {
            throw new ParameterError(
                `Duplicate space slug "${space.slug}" in "${existingExact}" and "${filePath}"`,
            );
        }
        exactPaths.set(space.slug, filePath);

        const normalizedPath = getLtreePathFromContentAsCodePath(space.slug);
        const existingNormalized = normalizedPaths.get(normalizedPath);
        if (existingNormalized) {
            throw new ParameterError(
                `Space paths "${existingNormalized.slug}" (${existingNormalized.filePath}) and "${space.slug}" (${filePath}) resolve to the same normalized path "${normalizedPath}"`,
            );
        }
        normalizedPaths.set(normalizedPath, { slug: space.slug, filePath });
    });
};

export const sortSpaceFilesParentFirst = (
    files: SpaceCodeFile[],
): SpaceCodeFile[] =>
    [...files].sort((left, right) => {
        const depthDifference =
            left.space.slug.split('/').length -
            right.space.slug.split('/').length;
        return (
            depthDifference || left.space.slug.localeCompare(right.space.slug)
        );
    });

const getExistingSpaceFileNames = async (
    outputDir: string,
): Promise<Map<string, string[]>> => {
    let entries: Dirent[];
    try {
        entries = await fs.readdir(outputDir, { withFileTypes: true });
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return new Map();
        }
        throw error;
    }

    const filesBySlug = new Map<string, string[]>();
    for (const entry of entries.filter(({ name }) =>
        name.endsWith('.space.yml'),
    )) {
        let slug: string | null = null;
        if (entry.isFile()) {
            try {
                const parsed = yaml.load(
                    await fs.readFile(
                        path.join(outputDir, entry.name),
                        'utf-8',
                    ),
                );
                if (isSpaceIdentity(parsed)) {
                    slug = parsed.slug;
                }
            } catch {
                // An unreadable existing file still reserves its filename.
            }
        }

        const ownerKey = slug ?? `\0${entry.name}`;
        filesBySlug.set(ownerKey, [
            ...(filesBySlug.get(ownerKey) ?? []),
            entry.name,
        ]);
    }
    return filesBySlug;
};

const getExistingSpaceFilePathsBySlug = async (
    baseDir: string,
): Promise<Map<string, string[]>> => {
    let filePaths: string[];
    try {
        filePaths = await listSpaceFilePaths(baseDir);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return new Map();
        }
        throw error;
    }

    const filesBySlug = new Map<string, string[]>();
    for (const filePath of filePaths) {
        try {
            const parsed = yaml.load(await fs.readFile(filePath, 'utf-8'));
            if (isSpaceIdentity(parsed)) {
                filesBySlug.set(parsed.slug, [
                    ...(filesBySlug.get(parsed.slug) ?? []),
                    filePath,
                ]);
            }
        } catch {
            // Filename allocation still reserves unreadable files in their directory.
        }
    }

    return filesBySlug;
};

export const getUniqueExistingSpaceFilePathsBySlug = async (
    baseDir: string,
): Promise<Map<string, string[]>> => {
    const filesBySlug = await getExistingSpaceFilePathsBySlug(baseDir);
    for (const [slug, filePaths] of filesBySlug) {
        if (filePaths.length > 1) {
            throw new ParameterError(
                `Multiple existing space files use slug "${slug}": ${filePaths
                    .map((filePath) => path.relative(baseDir, filePath))
                    .join(', ')}`,
            );
        }
    }
    return filesBySlug;
};

const getCollisionSafeSpaceFileName = (
    space: SpaceAsCode,
    usedFileNames: Set<string>,
): string => {
    const base = getSpaceFilenameBase(space);
    const getCandidate = (suffix: string) =>
        `${base.slice(
            0,
            SPACE_FILENAME_MAX_LENGTH - suffix.length,
        )}${suffix}.space.yml`;

    for (const hashLength of [8, 12, 16, 24, 32, 64]) {
        const candidate = getCandidate(
            `-${getStableSpaceHash(space.slug, hashLength)}`,
        );
        if (!usedFileNames.has(candidate.toLowerCase())) return candidate;
    }

    for (let index = 1; index <= 100; index += 1) {
        const candidate = getCandidate(
            `-${getStableSpaceHash(space.slug, 64)}-${index}`,
        );
        if (!usedFileNames.has(candidate.toLowerCase())) return candidate;
    }

    throw new ParameterError(
        `Could not allocate a safe filename for space "${space.slug}"`,
    );
};

const allocateSpaceFileNames = async (
    spaces: SpaceAsCode[],
    outputDir: string,
    preferredFileNames: string[],
): Promise<string[]> => {
    const existingFilesBySlug = await getExistingSpaceFileNames(outputDir);
    const usedFileNames = new Set(
        [...existingFilesBySlug.values()]
            .flat()
            .map((fileName) => fileName.toLowerCase()),
    );

    return spaces.map((space, index) => {
        const existingFileName = existingFilesBySlug.get(space.slug)?.[0];
        if (existingFileName !== undefined) return existingFileName;

        const preferredFileName = preferredFileNames[index];
        const fileName = !usedFileNames.has(preferredFileName.toLowerCase())
            ? preferredFileName
            : getCollisionSafeSpaceFileName(space, usedFileNames);
        usedFileNames.add(fileName.toLowerCase());
        return fileName;
    });
};

/** Writes first-class space YAML files returned by GET /code/spaces. */
export const writeSpaceFiles = async (
    spaces: SpaceAsCode[],
    projectName: string,
    customPath?: string,
    folderScheme: FolderScheme = 'flat',
    flatSpaceLayout: FlatSpaceLayout = 'folder',
    preserveExistingPolicy: boolean = false,
): Promise<void> => {
    const baseDir = getDownloadFolder(customPath);
    if (spaces.length === 0) return;
    const existingFilesBySlug = preserveExistingPolicy
        ? await getExistingSpaceFilePathsBySlug(baseDir)
        : await getUniqueExistingSpaceFilePathsBySlug(baseDir);
    if (preserveExistingPolicy) {
        spaces.forEach(({ slug }) => {
            const existingPaths = existingFilesBySlug.get(slug) ?? [];
            if (existingPaths.length > 1) {
                throw new ParameterError(
                    `Multiple existing space files use slug "${slug}": ${existingPaths
                        .map((filePath) => path.relative(baseDir, filePath))
                        .join(', ')}`,
                );
            }
        });
    }

    const files = spaces.map((space) => ({
        filePath: `downloaded space "${space.slug}"`,
        space,
    }));
    assertUniqueSpacePaths(files);

    const useRootFlatLayout =
        flatSpaceLayout === 'root' ||
        (folderScheme === 'flat' && (await hasRootSpaceFile(baseDir)));

    const plannedPathsBySlug = new Map<string, string>();
    const newSpacesByDirectory = new Map<string, SpaceAsCode[]>();
    for (const space of spaces) {
        const existingFilePath = existingFilesBySlug.get(space.slug)?.[0];
        if (existingFilePath !== undefined) {
            plannedPathsBySlug.set(space.slug, existingFilePath);
        } else {
            let outputDir: string;
            if (folderScheme === 'nested') {
                outputDir = path.join(baseDir, projectName, space.slug);
            } else if (useRootFlatLayout) {
                outputDir = baseDir;
            } else {
                outputDir = path.join(baseDir, 'spaces');
            }
            newSpacesByDirectory.set(outputDir, [
                ...(newSpacesByDirectory.get(outputDir) ?? []),
                space,
            ]);
        }
    }

    for (const [outputDir, newSpaces] of [...newSpacesByDirectory].sort(
        ([left], [right]) => left.localeCompare(right),
    )) {
        const fileNames = await allocateSpaceFileNames(
            newSpaces,
            outputDir,
            getFlatSpaceFileNames(newSpaces),
        );
        newSpaces.forEach((space, index) => {
            plannedPathsBySlug.set(
                space.slug,
                path.join(outputDir, fileNames[index]),
            );
        });
    }

    const plannedPaths = [...plannedPathsBySlug.values()].map((filePath) =>
        filePath.toLowerCase(),
    );
    if (new Set(plannedPaths).size !== plannedPaths.length) {
        throw new ParameterError(
            'Multiple spaces would be written to the same file path',
        );
    }

    for (const space of spaces) {
        const filePath = plannedPathsBySlug.get(space.slug);
        if (filePath === undefined) {
            throw new ParameterError(
                `Could not determine a filename for space "${space.slug}"`,
            );
        }
        let spaceToWrite = space;
        if (
            preserveExistingPolicy &&
            space.access === undefined &&
            existingFilesBySlug.has(space.slug)
        ) {
            const existing = yaml.load(await fs.readFile(filePath, 'utf-8'));
            if (
                typeof existing !== 'object' ||
                existing === null ||
                Array.isArray(existing) ||
                !('contentType' in existing) ||
                existing.contentType !== ContentAsCodeTypeEnum.SPACE ||
                !('slug' in existing) ||
                existing.slug !== space.slug
            ) {
                throw new ParameterError(
                    `Existing space file "${filePath}" changed while downloading`,
                );
            }
            spaceToWrite = {
                ...space,
                ...('version' in existing ? { version: existing.version } : {}),
                ...('access' in existing ? { access: existing.access } : {}),
            } as SpaceAsCode;
        }
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(
            filePath,
            yaml.dump(spaceToWrite, { quotingType: '"', sortKeys: true }),
        );
        GlobalState.debug(`Wrote space file: ${filePath}`);
    }
};

export const readSpaceFiles = async (
    customPath?: string,
): Promise<SpaceCodeFile[]> => {
    const baseDir = getDownloadFolder(customPath);

    try {
        const files: SpaceCodeFile[] = [];
        for (const filePath of await listSpaceFilePaths(baseDir)) {
            let parsed: unknown;
            try {
                parsed = yaml.load(await fs.readFile(filePath, 'utf-8'));
            } catch (error) {
                throw new ParameterError(
                    `Invalid YAML in space file "${filePath}": ${getErrorMessage(error)}`,
                );
            }
            files.push({
                filePath,
                space: validateSpaceIdentity(parsed, filePath),
            });
        }

        assertUniqueSpacePaths(files);
        return sortSpaceFilesParentFirst(files);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
        throw error;
    }
};

/** Reads legacy identity fields without validating unrelated access policy. */
export const readSpaceNames = async (
    customPath?: string,
): Promise<Record<string, string>> => {
    const baseDir = getDownloadFolder(customPath);
    const spaceNames: Array<[string, string]> = [];

    try {
        for (const filePath of await listSpaceFilePaths(baseDir)) {
            try {
                const parsed = yaml.load(await fs.readFile(filePath, 'utf-8'));
                if (
                    isSpaceIdentity(parsed) &&
                    'spaceName' in parsed &&
                    typeof parsed.spaceName === 'string'
                ) {
                    spaceNames.push([parsed.slug, parsed.spaceName]);
                }
            } catch (error) {
                GlobalState.debug(
                    `Skipping space file ${path.basename(filePath)}: ${getErrorMessage(error)}`,
                );
            }
        }
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            GlobalState.debug(
                `Skipping space names in ${baseDir}: ${getErrorMessage(error)}`,
            );
        }
    }

    return Object.fromEntries(spaceNames);
};

export const getSpaceNames = (files: SpaceCodeFile[]): Record<string, string> =>
    Object.fromEntries(files.map(({ space }) => [space.slug, space.spaceName]));
const getSpacePromoteAction = (
    action: ApiSpaceAsCodeUpsertResponse['results']['action'],
): 'created' | 'updated' | 'unchanged' => {
    switch (action) {
        case SpaceAsCodeAction.CREATE:
            return 'created';
        case SpaceAsCodeAction.UPDATE:
            return 'updated';
        case SpaceAsCodeAction.NO_CHANGES:
            return 'unchanged';
        default:
            return assertUnreachable(
                action,
                `Unknown space promotion action: ${action}`,
            );
    }
};

const SPACE_AS_CODE_DOWNLOAD_ERROR_NAME = 'SpaceAsCodeDownloadError';

export const createSpaceAsCodeDownloadError = (
    message: string,
): ParameterError => {
    const error = new ParameterError(message);
    error.name = SPACE_AS_CODE_DOWNLOAD_ERROR_NAME;
    return error;
};

export const isSpaceAsCodeDownloadError = (error: unknown): error is Error =>
    error instanceof Error && error.name === SPACE_AS_CODE_DOWNLOAD_ERROR_NAME;

const SPACE_AS_CODE_FETCH_ERROR_NAME = 'SpaceAsCodeFetchError';

const createSpaceAsCodeFetchError = (message: string): ParameterError => {
    const error = new ParameterError(message);
    error.name = SPACE_AS_CODE_FETCH_ERROR_NAME;
    return error;
};

export const isSpaceAsCodeFetchError = (error: unknown): error is Error =>
    error instanceof Error && error.name === SPACE_AS_CODE_FETCH_ERROR_NAME;

export const shouldFallBackToEmbeddedSpaces = (
    error: unknown,
    spacesOnly: boolean | undefined,
): boolean => isSpaceAsCodeFetchError(error) && spacesOnly !== true;

export const downloadSpaces = async (
    projectId: string,
    projectName: string,
    customPath?: string,
    nested: boolean = false,
    rootSpaces: boolean = false,
): Promise<number> => {
    try {
        await getUniqueExistingSpaceFilePathsBySlug(
            getDownloadFolder(customPath),
        );
        let results: ApiSpaceAsCodeListResponse['results'];
        try {
            results = await lightdashApi<ApiSpaceAsCodeListResponse['results']>(
                {
                    method: 'GET',
                    url: `/api/v1/projects/${projectId}/code/spaces`,
                    body: undefined,
                },
            );
        } catch (error) {
            throw createSpaceAsCodeFetchError(getErrorMessage(error));
        }

        const downloadedWithoutAccessSlugs = new Set(
            results.spaces
                .filter((space) => space.access === undefined)
                .map((space) => space.slug),
        );
        results.skipped.forEach((skipped) =>
            GlobalState.log(
                styles.warning(
                    downloadedWithoutAccessSlugs.has(skipped.slug)
                        ? `Downloaded space "${skipped.slug}" without access: ${skipped.reason}`
                        : `Skipped space "${skipped.slug}": ${skipped.reason}`,
                ),
            ),
        );
        const spaces = sortSpaceFilesParentFirst(
            results.spaces.map((space) => ({
                filePath: `downloaded space "${space.slug}"`,
                space,
            })),
        ).map(({ space }) => space);
        await writeSpaceFiles(
            spaces,
            projectName,
            customPath,
            nested ? 'nested' : 'flat',
            rootSpaces ? 'root' : 'folder',
        );

        return spaces.length;
    } catch (error) {
        if (isSpaceAsCodeFetchError(error)) throw error;
        throw createSpaceAsCodeDownloadError(getErrorMessage(error));
    }
};

const SPACE_AS_CODE_UPLOAD_ERROR_NAME = 'SpaceAsCodeUploadError';

export const createSpaceAsCodeUploadError = (
    message: string,
): ParameterError => {
    const error = new ParameterError(message);
    error.name = SPACE_AS_CODE_UPLOAD_ERROR_NAME;
    return error;
};

export const isSpaceAsCodeUploadError = (error: unknown): error is Error =>
    error instanceof Error && error.name === SPACE_AS_CODE_UPLOAD_ERROR_NAME;

export const logUploadChanges = (changes: Record<string, number>) => {
    Object.entries(changes).forEach(([key, value]) => {
        console.info(`Total ${key}: ${value} `);
    });

    if (shouldWarnAllSkipped(changes)) {
        console.warn(
            styles.warning(
                `\nAll content was skipped (no local changes detected). Use --force to upload all content, e.g. when uploading to a new project.`,
            ),
        );
    }
};

export const upsertSpaces = async (
    projectId: string,
    files: SpaceCodeFile[],
    changes: Record<string, number>,
    skipSpaceCreate: boolean,
    publicSpaceCreate: boolean,
): Promise<Record<string, number>> => {
    if (files.length === 0) return changes;

    const failedPaths = new Set<string>();
    const skippedPaths = new Set<string>();

    for (const { filePath, space } of sortSpaceFilesParentFirst(files)) {
        const failedParent = [...failedPaths].find((failedPath) =>
            space.slug.startsWith(`${failedPath}/`),
        );
        const skippedParent = [...skippedPaths].find((skippedPath) =>
            space.slug.startsWith(`${skippedPath}/`),
        );
        if (failedParent !== undefined) {
            changes['spaces dependency skipped'] =
                (changes['spaces dependency skipped'] ?? 0) + 1;
            failedPaths.add(space.slug);
            GlobalState.log(
                styles.warning(
                    `Skipped space "${space.slug}" (${filePath}) because parent "${failedParent}" failed`,
                ),
            );
        } else if (skippedParent !== undefined) {
            changes['spaces skipped'] = (changes['spaces skipped'] ?? 0) + 1;
            skippedPaths.add(space.slug);
            GlobalState.log(
                styles.warning(
                    `Skipped space "${space.slug}" (${filePath}) because parent "${skippedParent}" does not exist and --skip-space-create is true`,
                ),
            );
        } else {
            try {
                const params = new URLSearchParams({
                    skipSpaceCreate: String(skipSpaceCreate),
                    publicSpaceCreate: String(
                        publicSpaceCreate && space.access === undefined,
                    ),
                });
                const result = await lightdashApi<
                    ApiSpaceAsCodeUpsertResponse['results']
                >({
                    method: 'POST',
                    url: `/api/v1/projects/${projectId}/code/spaces?${params.toString()}`,
                    body: JSON.stringify(space),
                });
                const action = getSpacePromoteAction(result.action);
                const key = `spaces ${action}`;
                changes[key] = (changes[key] ?? 0) + 1;
                result.warnings?.forEach((warning) =>
                    GlobalState.log(
                        styles.warning(
                            `Space "${space.slug}" (${filePath}): ${warning}`,
                        ),
                    ),
                );
                GlobalState.debug(
                    `Space "${space.slug}" (${filePath}): ${result.action}`,
                );
            } catch (error) {
                if (
                    skipSpaceCreate &&
                    error instanceof LightdashError &&
                    error.name === 'NotFoundError'
                ) {
                    skippedPaths.add(space.slug);
                    changes['spaces skipped'] =
                        (changes['spaces skipped'] ?? 0) + 1;
                    GlobalState.log(
                        styles.warning(
                            `Skipped space "${space.slug}" (${filePath}) because it does not exist and --skip-space-create is true`,
                        ),
                    );
                } else {
                    failedPaths.add(space.slug);
                    changes['spaces with errors'] =
                        (changes['spaces with errors'] ?? 0) + 1;
                    GlobalState.log(
                        styles.error(
                            `Error upserting space "${space.slug}" (${filePath}): ${getErrorMessage(error)}`,
                        ),
                    );
                }
            }
        }
    }

    const failed = changes['spaces with errors'] ?? 0;
    const dependencySkipped = changes['spaces dependency skipped'] ?? 0;
    if (failed > 0 || dependencySkipped > 0) {
        logUploadChanges(changes);
        throw createSpaceAsCodeUploadError(
            `${failed} space definition(s) failed and ${dependencySkipped} dependent definition(s) were skipped; content upload was not started`,
        );
    }

    return changes;
};
