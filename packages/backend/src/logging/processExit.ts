import fs from 'fs';

export const UNCAUGHT_EXCEPTION_PREFIX = 'lightdash.process.uncaughtException';
export const SIGNAL_PREFIX = 'lightdash.process.signal';
export const UNCAUGHT_EXCEPTION_EXIT_CODE = 1;

export type LoggedSignal = 'SIGTERM' | 'SIGINT';

export const LOGGED_SIGNALS: LoggedSignal[] = ['SIGTERM', 'SIGINT'];

export type ProcessExitWriters = {
    write: (line: string) => void;
    exit: (code: number) => void;
};

const writeToStderrSync = (line: string) => {
    fs.writeSync(2, line);
};

const exitProcess = (code: number) => {
    process.exit(code);
};

const defaultWriters: ProcessExitWriters = {
    write: writeToStderrSync,
    exit: exitProcess,
};

const toSingleLine = (value: string): string => value.replace(/\r?\n/g, '\\n');

type DescribedError = {
    name: string;
    message: string;
    stack: string;
};

const describeError = (error: unknown): DescribedError => {
    if (error instanceof Error) {
        return {
            name: error.name,
            message: error.message,
            stack: error.stack ?? '<no stack>',
        };
    }
    try {
        return {
            name: typeof error,
            message: String(error),
            stack: '<no stack>',
        };
    } catch {
        return {
            name: typeof error,
            message: '<unprintable>',
            stack: '<no stack>',
        };
    }
};

export const formatUncaughtExceptionLine = (error: unknown): string => {
    const { name, message, stack } = describeError(error);
    return `${UNCAUGHT_EXCEPTION_PREFIX} name=${toSingleLine(
        name,
    )} message=${toSingleLine(message)} stack=${toSingleLine(stack)}\n`;
};

export const formatSignalLine = (signal: LoggedSignal): string =>
    `${SIGNAL_PREFIX} signal=${signal}\n`;

export const createUncaughtExceptionHandler =
    (writers: ProcessExitWriters) =>
    (error: unknown): void => {
        writers.write(formatUncaughtExceptionLine(error));
        writers.exit(UNCAUGHT_EXCEPTION_EXIT_CODE);
    };

export const createSignalHandler =
    (writers: ProcessExitWriters, signal: LoggedSignal) => (): void => {
        writers.write(formatSignalLine(signal));
    };

/**
 * Writes the reason a process died to stderr synchronously, before any exit.
 * Winston writes asynchronously to a pipe, so its line is lost when the
 * process exits first. Signal handlers only log: the entry points already
 * shut down gracefully on SIGTERM and SIGINT and own the exit.
 */
export const installProcessExitLogging = (
    writers: ProcessExitWriters = defaultWriters,
): void => {
    process.on('uncaughtException', createUncaughtExceptionHandler(writers));
    LOGGED_SIGNALS.forEach((signal) => {
        process.on(signal, createSignalHandler(writers, signal));
    });
};
