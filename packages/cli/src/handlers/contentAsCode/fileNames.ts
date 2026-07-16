import { generateSlug, ParameterError } from '@lightdash/common';
import { createHash } from 'crypto';
import * as path from 'path';

export const CODE_FILENAME_MAX_STEM_LENGTH = 200;
export const CODE_FILENAME_HASH_LENGTH = 8;

export const getStableCodeHash = (
    value: string,
    length: number = CODE_FILENAME_HASH_LENGTH,
): string => createHash('sha256').update(value).digest('hex').slice(0, length);

export const getContentFileNameStem = ({
    value,
    fallbackPrefix,
    fallbackHashValue = value,
    maxLength = CODE_FILENAME_MAX_STEM_LENGTH,
}: {
    value: string;
    fallbackPrefix: string;
    fallbackHashValue?: string;
    maxLength?: number;
}): string => {
    const normalizedValue = value
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '');
    const stem = /[a-z0-9]/i.test(normalizedValue)
        ? generateSlug(normalizedValue)
        : `${fallbackPrefix}-${getStableCodeHash(fallbackHashValue)}`;

    return stem.slice(0, maxLength);
};

export type ContentFileNameInput = {
    identity: string;
    displayName: string;
    preferredFileName?: string;
};

export const allocateContentFileNames = ({
    items,
    fallbackPrefix,
    extension = '.yml',
    maxStemLength = CODE_FILENAME_MAX_STEM_LENGTH,
    existingFileNameByIdentity = new Map(),
    reservedFileNames = [],
}: {
    items: ContentFileNameInput[];
    fallbackPrefix: string;
    extension?: string;
    maxStemLength?: number;
    existingFileNameByIdentity?: ReadonlyMap<string, string>;
    reservedFileNames?: Iterable<string>;
}): string[] => {
    const stems = items.map(({ identity, displayName, preferredFileName }) =>
        preferredFileName
            ? preferredFileName.slice(
                  0,
                  Math.max(0, preferredFileName.length - extension.length),
              )
            : getContentFileNameStem({
                  value: displayName,
                  fallbackPrefix,
                  fallbackHashValue: identity,
                  maxLength: maxStemLength,
              }),
    );
    const counts = stems.reduce<Map<string, number>>(
        (result, stem) =>
            result.set(
                stem.toLowerCase(),
                (result.get(stem.toLowerCase()) ?? 0) + 1,
            ),
        new Map(),
    );

    const usedFileNames = new Set(
        [...reservedFileNames].map((fileName) => fileName.toLowerCase()),
    );

    return items.map(({ identity, preferredFileName }, index) => {
        const existingFileName = existingFileNameByIdentity.get(identity);
        if (existingFileName !== undefined) {
            usedFileNames.add(existingFileName.toLowerCase());
            return existingFileName;
        }

        const stem = stems[index];
        const candidateFileName =
            preferredFileName ??
            ((counts.get(stem.toLowerCase()) ?? 0) === 1
                ? `${stem}${extension}`
                : `${stem.slice(
                      0,
                      maxStemLength - CODE_FILENAME_HASH_LENGTH - 1,
                  )}-${getStableCodeHash(identity)}${extension}`);
        if (!usedFileNames.has(candidateFileName.toLowerCase())) {
            usedFileNames.add(candidateFileName.toLowerCase());
            return candidateFileName;
        }

        for (const hashLength of [8, 12, 16, 24, 32, 64]) {
            const suffix = `-${getStableCodeHash(identity, hashLength)}`;
            const candidate = `${stem.slice(
                0,
                maxStemLength - suffix.length,
            )}${suffix}${extension}`;
            if (!usedFileNames.has(candidate.toLowerCase())) {
                usedFileNames.add(candidate.toLowerCase());
                return candidate;
            }
        }

        throw new ParameterError(
            `Could not allocate a safe filename for content "${identity}"`,
        );
    });
};

export const assertSafeContentFilePath = (relativePath: string): void => {
    if (
        relativePath.length === 0 ||
        path.isAbsolute(relativePath) ||
        relativePath.split(/[\\/]/).some((segment) => segment === '..')
    ) {
        throw new ParameterError(
            `Unsafe content-as-code file path "${relativePath}"`,
        );
    }
};
