const draftKey = (projectUuid: string) =>
    `lightdash.sshPublicKeyDraft.${projectUuid}`;

// Generated public keys only live in form state until the project is saved;
// drafting them in localStorage keeps them across reloads and new tabs.
export const readSshPublicKeyDraft = (projectUuid: string): string | null => {
    try {
        return window.localStorage.getItem(draftKey(projectUuid)) || null;
    } catch {
        return null;
    }
};

export const writeSshPublicKeyDraft = (
    projectUuid: string,
    publicKey: string,
): void => {
    try {
        window.localStorage.setItem(draftKey(projectUuid), publicKey);
    } catch {
        // storage unavailable; the key still lives in form state
    }
};

export const clearSshPublicKeyDraft = (projectUuid: string): void => {
    try {
        window.localStorage.removeItem(draftKey(projectUuid));
    } catch {
        // nothing to clear
    }
};
