import { validateUserName } from '@lightdash/common';

type UserNames = {
    firstName?: string | null;
    lastName?: string | null;
};

export type MissingUserNames = {
    firstName?: string;
    lastName?: string;
};

const getMissingName = (
    savedName: string | null | undefined,
    providedName: string | null | undefined,
): string | undefined => {
    const name = providedName?.trim();
    if (savedName?.trim() || !name || !validateUserName(name)) {
        return undefined;
    }
    return name;
};

/**
 * Names an identity provider may fill in: only the fields the user left blank,
 * never one they already set, so a typed or custom name always wins.
 */
export const getMissingUserNames = (
    saved: UserNames,
    provided: UserNames,
): MissingUserNames | undefined => {
    const firstName = getMissingName(saved.firstName, provided.firstName);
    const lastName = getMissingName(saved.lastName, provided.lastName);
    if (!firstName && !lastName) {
        return undefined;
    }
    return {
        ...(firstName && { firstName }),
        ...(lastName && { lastName }),
    };
};
