import { z } from 'zod';
import { natsWorkerStreamSchema, type NatsWorkerStream } from './natsConfig';

/** Streams older deployments may still pass to `--stream`; they no longer exist. */
const retiredNatsWorkerStreamSchema = z.enum(['duckdb']);
export type RetiredNatsWorkerStream = z.infer<
    typeof retiredNatsWorkerStreamSchema
>;

const streamArgSchema = z.union([
    natsWorkerStreamSchema,
    retiredNatsWorkerStreamSchema,
]);

export const parseNatsWorkerStreams = (
    args: string[],
    registeredStreams: NatsWorkerStream[],
): {
    streams: NatsWorkerStream[];
    retiredStreams: RetiredNatsWorkerStream[];
} => {
    const requested = args.flatMap((arg, i) =>
        arg === '--stream' && args[i + 1]
            ? [streamArgSchema.parse(args[i + 1])]
            : [],
    );
    if (requested.length === 0) {
        return { streams: registeredStreams, retiredStreams: [] };
    }
    return {
        streams: requested.filter(
            (s): s is NatsWorkerStream =>
                natsWorkerStreamSchema.safeParse(s).success,
        ),
        retiredStreams: requested.filter(
            (s): s is RetiredNatsWorkerStream =>
                retiredNatsWorkerStreamSchema.safeParse(s).success,
        ),
    };
};
