import { AI_THREAD_FILE_MOUNT_PATH } from '@lightdash/common';
import { InMemoryFs } from 'just-bash';
import { runShellCommandOnFs } from '../repoFs/bashShell';

export type AttachmentFile = {
    uuid: string;
    fileName: string;
    content: string;
};

/**
 * Mount path per file, in input order. Two files with the same name get a
 * numeric suffix so neither is hidden; callers must advertise these exact
 * paths to the agent.
 */
export const resolveAttachmentPaths = (
    files: Pick<AttachmentFile, 'uuid' | 'fileName'>[],
): Map<string, string> => {
    const used = new Set<string>();
    const paths = new Map<string, string>();
    files.forEach((file) => {
        let name = file.fileName;
        let suffix = 1;
        while (used.has(name)) {
            const dot = file.fileName.lastIndexOf('.');
            name =
                dot > 0
                    ? `${file.fileName.slice(0, dot)}-${suffix}${file.fileName.slice(dot)}`
                    : `${file.fileName}-${suffix}`;
            suffix += 1;
        }
        used.add(name);
        paths.set(file.uuid, `${AI_THREAD_FILE_MOUNT_PATH}/${name}`);
    });
    return paths;
};

/** The read-only virtual filesystem the `readAttachments` tool runs over. */
export const createAttachmentFileSystem = (
    files: AttachmentFile[],
): InMemoryFs => {
    const fs = new InMemoryFs();
    fs.mkdirSync(AI_THREAD_FILE_MOUNT_PATH, { recursive: true });
    const paths = resolveAttachmentPaths(files);
    files.forEach((file) => {
        fs.writeFileSync(paths.get(file.uuid)!, file.content);
    });
    return fs;
};

export const runAttachmentShellCommand = (
    files: AttachmentFile[],
    command: string,
): Promise<string> =>
    runShellCommandOnFs(createAttachmentFileSystem(files), command, {
        cwd: AI_THREAD_FILE_MOUNT_PATH,
    });
