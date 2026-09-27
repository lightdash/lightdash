import { spawn, type ChildProcess } from 'node:child_process';

export class BundleChild {
    private child: ChildProcess | null = null;
    private expected = new WeakSet<ChildProcess>();

    constructor(
        private readonly options: {
            executable: string;
            args: string[];
            cwd: string;
            env: NodeJS.ProcessEnv;
            onExit: (code: number | null, signal: string | null) => void;
            stopTimeout?: number;
        },
    ) {}

    get pid(): number | null {
        return this.child?.pid ?? null;
    }

    async start(): Promise<void> {
        if (this.child) throw new Error('The owned API is already running');
        const child = spawn(this.options.executable, this.options.args, {
            cwd: this.options.cwd,
            env: this.options.env,
            detached: true,
            stdio: 'inherit',
        });
        this.child = child;
        child.once('exit', (code, signal) => {
            if (this.child === child) this.child = null;
            if (!this.expected.has(child)) this.options.onExit(code, signal);
        });
        await new Promise<void>((resolve, reject) => {
            child.once('spawn', resolve);
            child.once('error', (error) => {
                if (this.child === child) this.child = null;
                reject(error);
            });
        });
    }

    async stop(): Promise<void> {
        const child = this.child;
        if (!child?.pid) return;
        this.expected.add(child);
        const signal = (value: NodeJS.Signals) => {
            try {
                process.kill(-child.pid!, value);
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== 'ESRCH')
                    throw error;
            }
        };
        const exited = new Promise<void>((resolve) =>
            child.once('exit', () => resolve()),
        );
        const force = setTimeout(
            () => signal('SIGKILL'),
            this.options.stopTimeout ?? 5000,
        );
        try {
            signal('SIGINT');
            await exited;
        } finally {
            clearTimeout(force);
        }
    }
}
