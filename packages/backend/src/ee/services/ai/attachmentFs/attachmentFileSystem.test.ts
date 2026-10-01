import { ShellError } from '../repoFs/bashShell';
import { runAttachmentShellCommand } from './attachmentFileSystem';

const files = [
    { fileName: 'notes.md', content: '# Notes\nconversion lifted 12%\n' },
    { fileName: 'log.txt', content: 'day 1\nday 2\nday 3\n' },
];

describe('runAttachmentShellCommand', () => {
    it('mounts every file under /attachments and starts there', async () => {
        const output = await runAttachmentShellCommand(files, 'ls');
        expect(output.split('\n').filter(Boolean).sort()).toEqual([
            'log.txt',
            'notes.md',
        ]);
    });

    it('reads and searches file content', async () => {
        await expect(
            runAttachmentShellCommand(files, 'cat /attachments/notes.md'),
        ).resolves.toContain('conversion lifted 12%');
        await expect(
            runAttachmentShellCommand(
                files,
                'grep -c day /attachments/log.txt',
            ),
        ).resolves.toContain('3');
    });

    it('suffixes duplicate file names instead of hiding one', async () => {
        const output = await runAttachmentShellCommand(
            [
                { fileName: 'a.md', content: 'first' },
                { fileName: 'a.md', content: 'second' },
            ],
            'cat /attachments/a.md /attachments/a-1.md',
        );
        expect(output).toContain('first');
        expect(output).toContain('second');
    });

    it('rejects commands outside the read-only allowlist', async () => {
        await expect(
            runAttachmentShellCommand(files, 'rm /attachments/notes.md'),
        ).rejects.toThrow(ShellError);
    });

    it('mounts only the attachments outside the shell shims', async () => {
        // just-bash seeds /bin, /dev and /proc stubs; nothing else may exist.
        const output = await runAttachmentShellCommand(
            files,
            'find / -type f -not -path "/bin/*" -not -path "/usr/*" -not -path "/dev/*" -not -path "/proc/*" | sort',
        );
        expect(output.split('\n').filter(Boolean)).toEqual([
            '/attachments/log.txt',
            '/attachments/notes.md',
        ]);
    });
});
