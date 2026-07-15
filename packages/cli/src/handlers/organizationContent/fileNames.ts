import { generateSlug } from '@lightdash/common';
import { createHash } from 'crypto';

const ORGANIZATION_CONTENT_FILENAME_MAX_LENGTH = 200;
const FILENAME_HASH_LENGTH = 8;

const getStableHash = (value: string): string =>
    createHash('sha256')
        .update(value)
        .digest('hex')
        .slice(0, FILENAME_HASH_LENGTH);

const getFilenameBase = (value: string, fallbackPrefix: string): string => {
    const normalizedValue = value
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '');
    const slug = /[a-z0-9]/i.test(normalizedValue)
        ? generateSlug(normalizedValue)
        : `${fallbackPrefix}-${getStableHash(value)}`;

    return slug.slice(0, ORGANIZATION_CONTENT_FILENAME_MAX_LENGTH);
};

export const getOrganizationContentFileNames = ({
    values,
    fallbackPrefix,
}: {
    values: string[];
    fallbackPrefix: string;
}): string[] => {
    const filenameBases = values.map((value) =>
        getFilenameBase(value, fallbackPrefix),
    );
    const baseCounts = filenameBases.reduce<Map<string, number>>(
        (counts, filenameBase) =>
            counts.set(filenameBase, (counts.get(filenameBase) ?? 0) + 1),
        new Map(),
    );

    return filenameBases.map((filenameBase, index) => {
        if ((baseCounts.get(filenameBase) ?? 0) === 1) {
            return `${filenameBase}.yml`;
        }

        const collisionSuffix = `-${getStableHash(values[index])}`;
        const uniqueFilenameBase = `${filenameBase.slice(
            0,
            ORGANIZATION_CONTENT_FILENAME_MAX_LENGTH - collisionSuffix.length,
        )}${collisionSuffix}`;
        return `${uniqueFilenameBase}.yml`;
    });
};
