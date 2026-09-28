import { backgroundWork, runner } from './io';
import { garbageCollect } from './lifecycle';
import type { Instance } from './model';

type QueueOperations = {
    background?: (args: string[], name: string) => Promise<number>;
};

type SweepOperations = {
    backgroundWork?: typeof backgroundWork;
    garbageCollect?: typeof garbageCollect;
};

function message(error: unknown): string {
    return runner.redact(
        error instanceof Error ? error.message : String(error),
    );
}

export async function queueReadyGc(
    instance: Instance,
    operations: QueueOperations = {},
): Promise<void> {
    try {
        const background =
            operations.background ??
            (await import('./processes.js')).background;
        await background(
            ['gc-stale', '--exclude-instance', instance.id],
            `${instance.id}-gc`,
        );
    } catch (error) {
        process.stderr.write(
            `GC QUEUE SKIPPED ${instance.id}: ${message(error)}\n`,
        );
    }
}

export async function sweepStaleInstances(
    root: string,
    protectedId?: string,
    operations: SweepOperations = {},
): Promise<void> {
    try {
        await (operations.backgroundWork ?? backgroundWork)(() =>
            (operations.garbageCollect ?? garbageCollect)(
                root,
                false,
                undefined,
                protectedId,
            ),
        );
    } catch (error) {
        process.stderr.write(`GC SWEEP SKIPPED: ${message(error)}\n`);
    }
}
