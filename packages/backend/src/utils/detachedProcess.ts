import type { ExecaChildProcess, ExecaReturnValue } from 'execa';
import Logger from '../logging/logger';

const liveProcessGroups = new Set<number>();
let exitHookRegistered = false;

const killProcessGroup = (pid: number, signal: NodeJS.Signals) => {
    try {
        process.kill(-pid, signal);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
    }
};

export const awaitDetachedProcess = async (
    subprocess: ExecaChildProcess,
    signal: AbortSignal,
): Promise<ExecaReturnValue> => {
    const { pid } = subprocess;
    const grouped = process.platform === 'linux' && pid !== undefined;
    const kill = (killSignal: NodeJS.Signals) => {
        if (grouped) killProcessGroup(pid, killSignal);
        else subprocess.kill(killSignal);
    };
    if (grouped) {
        if (!exitHookRegistered) {
            process.once('exit', () => {
                for (const pgid of liveProcessGroups) {
                    try {
                        killProcessGroup(pgid, 'SIGKILL');
                    } catch (error) {
                        Logger.error(
                            'Failed to kill detached process group',
                            error,
                        );
                    }
                }
            });
            exitHookRegistered = true;
        }
        liveProcessGroups.add(pid);
        void subprocess.once('exit', () => {
            try {
                kill('SIGKILL');
            } finally {
                liveProcessGroups.delete(pid);
            }
        });
    }
    let timer: NodeJS.Timeout | null = null;
    const abort = () => {
        kill('SIGTERM');
        timer = setTimeout(() => kill('SIGKILL'), 5000);
    };
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    try {
        return await subprocess;
    } finally {
        signal.removeEventListener('abort', abort);
        if (timer) clearTimeout(timer);
        if (grouped && liveProcessGroups.has(pid)) {
            try {
                kill('SIGKILL');
            } finally {
                liveProcessGroups.delete(pid);
            }
        }
    }
};
