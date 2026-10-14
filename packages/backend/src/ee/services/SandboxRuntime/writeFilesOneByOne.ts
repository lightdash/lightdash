import { type SandboxFileEntry } from './types';

/** `writeMany` for providers without a batch upload: sequential single writes. */
export const writeFilesOneByOne = async (
    write: (path: string, contents: string | Uint8Array) => Promise<void>,
    entries: SandboxFileEntry[],
): Promise<void> => {
    for (const entry of entries) {
        // eslint-disable-next-line no-await-in-loop -- one request at a time against the sandbox agent
        await write(entry.path, entry.contents);
    }
};
