import { extract } from 'tar-stream';
import { type SandboxManager, type SandboxManagerPort } from './SandboxManager';
import { type SandboxGit, type SandboxHandle } from './types';

const extractTar = (
    archive: Buffer,
    destination: string,
    files: Map<string, Buffer>,
): Promise<void> =>
    new Promise((resolve, reject) => {
        const unpack = extract();
        unpack.on('entry', (header, stream, next) => {
            const chunks: Buffer[] = [];
            stream.on('data', (chunk: Buffer) => chunks.push(chunk));
            stream.on('end', () => {
                files.set(
                    `${destination}/${header.name}`,
                    Buffer.concat(chunks),
                );
                next();
            });
            stream.on('error', reject);
            stream.resume();
        });
        unpack.on('finish', resolve);
        unpack.on('error', reject);
        unpack.end(archive);
    });

const unsupportedGit =
    (method: keyof SandboxGit) => async (): Promise<never> => {
        throw new Error(`MockSandbox does not support git.${method}`);
    };

export class MockSandbox implements SandboxHandle {
    readonly contents: Map<string, Buffer>;

    readonly files: SandboxHandle['files'];

    readonly commands: SandboxHandle['commands'];

    readonly git: SandboxGit = {
        clone: unsupportedGit('clone'),
        status: unsupportedGit('status'),
        createBranch: unsupportedGit('createBranch'),
        add: unsupportedGit('add'),
        commit: unsupportedGit('commit'),
        push: unsupportedGit('push'),
    };

    constructor(
        readonly sandboxId: string,
        initialFiles: Record<string, string> = {},
    ) {
        this.contents = new Map([
            ['/app/skill.md', Buffer.from('test skill')],
            ...Object.entries(initialFiles).map(
                ([path, value]) => [path, Buffer.from(value)] as const,
            ),
        ]);
        this.files = {
            read: async (path) => {
                const value = this.contents.get(path);
                if (!value) throw new Error(`Missing file: ${path}`);
                return value.toString();
            },
            readBytes: async (path) => {
                const value = this.contents.get(path);
                if (!value) throw new Error(`Missing file: ${path}`);
                return value;
            },
            write: async (path, value) => {
                this.contents.set(path, Buffer.from(value));
            },
            remove: async (path) => {
                this.contents.delete(path);
            },
        };
        this.commands = {
            run: async (command) => {
                const extractMatch = command.match(/^tar -xf (\S+) -C (\S+)$/);
                if (extractMatch) {
                    const [, archivePath, destination] = extractMatch;
                    const archive = this.contents.get(archivePath);
                    if (!archive) {
                        throw new Error(`Missing archive: ${archivePath}`);
                    }
                    await extractTar(archive, destination, this.contents);
                }
                return { exitCode: 0, stdout: '', stderr: '' };
            },
        };
    }
}

export class MockSandboxManager implements SandboxManagerPort {
    private readonly sandboxes = new Map<string, MockSandbox>();

    private activeSandbox: MockSandbox | undefined;

    destroyError: Error | null = null;

    constructor(
        resumable: { sandboxUuid: string; sandbox: MockSandbox } | null = null,
    ) {
        if (resumable) {
            this.sandboxes.set(resumable.sandboxUuid, resumable.sandbox);
        }
    }

    async acquire(): ReturnType<SandboxManager['acquire']> {
        const sandboxUuid = 'fresh-sandbox';
        const sandbox = new MockSandbox('fresh-provider');
        this.sandboxes.set(sandboxUuid, sandbox);
        this.activeSandbox = sandbox;
        return { sandboxUuid, handle: sandbox };
    }

    async resume(
        input: Parameters<SandboxManager['resume']>[0],
    ): ReturnType<SandboxManager['resume']> {
        const sandbox = this.sandboxes.get(input.sandboxUuid);
        if (!sandbox) throw new Error(`Missing sandbox: ${input.sandboxUuid}`);
        this.activeSandbox = sandbox;
        return sandbox;
    }

    async suspend(): ReturnType<SandboxManager['suspend']> {}

    async suspendByUuid(): ReturnType<SandboxManager['suspendByUuid']> {}

    async destroy(
        input: Parameters<SandboxManager['destroy']>[0],
    ): ReturnType<SandboxManager['destroy']> {
        if (this.destroyError) throw this.destroyError;
        this.sandboxes.delete(input.sandboxUuid);
    }

    has(sandboxUuid: string): boolean {
        return this.sandboxes.has(sandboxUuid);
    }

    getActiveSandbox(): MockSandbox {
        if (!this.activeSandbox) throw new Error('Sandbox was not acquired');
        return this.activeSandbox;
    }
}
