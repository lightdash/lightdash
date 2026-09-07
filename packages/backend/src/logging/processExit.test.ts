import { describe, expect, it, vi } from 'vitest';
import {
    createSignalHandler,
    createUncaughtExceptionHandler,
    formatUncaughtExceptionLine,
    SIGNAL_PREFIX,
    UNCAUGHT_EXCEPTION_PREFIX,
    type ProcessExitWriters,
} from './processExit';

const createWriters = () => {
    const calls: string[] = [];
    const writers: ProcessExitWriters = {
        write: vi.fn((line: string) => {
            calls.push(`write:${line}`);
        }),
        exit: vi.fn((code: number) => {
            calls.push(`exit:${code}`);
        }),
    };
    return { writers, calls };
};

describe('processExit', () => {
    it('writes the exception line before it calls exit', () => {
        const { writers, calls } = createWriters();

        createUncaughtExceptionHandler(writers)(new Error('boom'));

        expect(calls).toHaveLength(2);
        expect(calls[0]).toContain(
            `${UNCAUGHT_EXCEPTION_PREFIX} name=Error message=boom stack=`,
        );
        expect(calls[1]).toBe('exit:1');
    });

    it('writes the name, the message and the stack on one line', () => {
        const error = new TypeError('two words');
        error.stack = 'TypeError: two words\n    at frameOne\n    at frameTwo';

        const line = formatUncaughtExceptionLine(error);

        expect(line).toBe(
            `${UNCAUGHT_EXCEPTION_PREFIX} name=TypeError message=two words stack=TypeError: two words\\n    at frameOne\\n    at frameTwo\n`,
        );
        expect(line.trimEnd()).not.toContain('\n');
    });

    it('describes a thrown value that is not an error', () => {
        const { writers } = createWriters();

        createUncaughtExceptionHandler(writers)('a plain string');

        expect(writers.write).toHaveBeenCalledWith(
            `${UNCAUGHT_EXCEPTION_PREFIX} name=string message=a plain string stack=<no stack>\n`,
        );
        expect(writers.exit).toHaveBeenCalledWith(1);
    });

    it('names the signal and leaves the exit to the graceful handler', () => {
        const { writers } = createWriters();

        createSignalHandler(writers, 'SIGTERM')();
        createSignalHandler(writers, 'SIGINT')();

        expect(writers.write).toHaveBeenNthCalledWith(
            1,
            `${SIGNAL_PREFIX} signal=SIGTERM\n`,
        );
        expect(writers.write).toHaveBeenNthCalledWith(
            2,
            `${SIGNAL_PREFIX} signal=SIGINT\n`,
        );
        expect(writers.exit).not.toHaveBeenCalled();
    });
});
