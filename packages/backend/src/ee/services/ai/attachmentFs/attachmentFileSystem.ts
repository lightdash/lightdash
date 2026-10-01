import { AI_THREAD_FILE_MOUNT_PATH } from '@lightdash/common';
import { InMemoryFs } from 'just-bash';
import { runShellCommandOnFs } from '../repoFs/bashShell';

export type AttachmentFile = {
    fileName: string;
    content: string;
};

/**
 * Build the read-only virtual filesystem the `readAttachments` tool runs over:
 * every file the thread owns, mounted at `/attachments/<file name>`. Two files
 * with the same name get a numeric suffix so neither is hidden.
 */
export const createAttachmentFileSystem = (
    files: AttachmentFile[],
): InMemoryFs => {
    const fs = new InMemoryFs();
    fs.mkdirSync(AI_THREAD_FILE_MOUNT_PATH, { recursive: true });
    const used = new Set<string>();
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
        fs.writeFileSync(`${AI_THREAD_FILE_MOUNT_PATH}/${name}`, file.content);
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
