import { z } from 'zod';

type NatsContractShape = Record<
    string,
    {
        streamName: string;
        durableName: string;
        jobs: Record<
            string,
            {
                subject: string;
                payloadSchema: z.ZodTypeAny;
                telemetry?: {
                    capturePayloadKeys?: readonly string[];
                };
            }
        >;
    }
>;

const queryHistoryPayloadSchema = z.object({
    queryUuid: z.string().min(1),
});

export const NATS_CONTRACT = {
    warehouse: {
        streamName: 'WAREHOUSE_QUERY_JOBS',
        durableName: 'worker-warehouse',
        jobs: {
            query: {
                subject: 'warehouse.query.jobs',
                payloadSchema: queryHistoryPayloadSchema,
                telemetry: {
                    capturePayloadKeys: ['queryUuid'],
                },
            },
        },
    },
    'pre-aggregate': {
        streamName: 'PRE_AGGREGATE_QUERY_JOBS',
        durableName: 'worker-pre-aggregate',
        jobs: {
            query: {
                subject: 'pre_aggregate.query.jobs',
                payloadSchema: queryHistoryPayloadSchema,
                telemetry: {
                    capturePayloadKeys: ['queryUuid'],
                },
            },
            materialization: {
                subject: 'pre_aggregate.materialization.jobs',
                payloadSchema: queryHistoryPayloadSchema,
                telemetry: {
                    capturePayloadKeys: ['queryUuid'],
                },
            },
        },
    },
} as const satisfies NatsContractShape;

type NatsContract = typeof NATS_CONTRACT;

export type NatsStreamKey = keyof NatsContract;

export type NatsContractJob = {
    [TStreamKey in NatsStreamKey]: {
        [TJobKey in keyof NatsContract[TStreamKey]['jobs']]: NatsContract[TStreamKey]['jobs'][TJobKey] & {
            streamKey: TStreamKey;
            jobKey: TJobKey;
        };
    }[keyof NatsContract[TStreamKey]['jobs']];
}[NatsStreamKey];

export type NatsSubject = NatsContractJob['subject'];

export type PayloadForSubject<TSubject extends NatsSubject> = z.infer<
    Extract<NatsContractJob, { subject: TSubject }>['payloadSchema']
>;

export type NatsEnqueueArgs<TSubject extends NatsSubject = NatsSubject> = {
    subject: TSubject;
    payload: PayloadForSubject<TSubject>;
};

export type NatsManagedStream = {
    streamName: string;
    durableName: string;
    subjects: readonly NatsSubject[];
};

const getTypedEntries = <T extends Record<string, unknown>>(
    value: T,
): Array<[keyof T, T[keyof T]]> =>
    Object.entries(value) as Array<[keyof T, T[keyof T]]>;

const CONTRACT_JOBS = getTypedEntries(NATS_CONTRACT).flatMap(
    ([streamKey, stream]) =>
        getTypedEntries(stream.jobs).map(([jobKey, job]) => ({
            ...job,
            streamKey,
            jobKey,
        })),
) as NatsContractJob[];

const CONTRACT_JOBS_BY_SUBJECT = new Map<NatsSubject, NatsContractJob>(
    CONTRACT_JOBS.map((job) => [job.subject, job]),
);

const KNOWN_NATS_SUBJECTS = new Set<string>(
    CONTRACT_JOBS.map((job) => job.subject),
);

export const getNatsStreamConfig = <TStreamKey extends NatsStreamKey>(
    streamKey: TStreamKey,
): NatsManagedStream => {
    const stream = NATS_CONTRACT[streamKey];

    return {
        streamName: stream.streamName,
        durableName: stream.durableName,
        subjects: getTypedEntries(stream.jobs).map(([, job]) => job.subject),
    };
};

export type NatsTraceProperties = {
    traceHeader?: string;
    baggageHeader?: string;
    sentryMessageId?: string;
};

export type NatsEnvelope<TPayload> = NatsTraceProperties & {
    jobId: string;
    payload: TPayload;
};

export const natsEnvelopeSchema = z.object({
    jobId: z.string().min(1),
    payload: z.unknown(),
    traceHeader: z.string().optional(),
    baggageHeader: z.string().optional(),
    sentryMessageId: z.string().optional(),
});

export const isKnownNatsSubject = (subject: string): subject is NatsSubject =>
    KNOWN_NATS_SUBJECTS.has(subject);

export const getNatsJobContract = <TSubject extends NatsSubject>(
    subject: TSubject,
): Extract<NatsContractJob, { subject: TSubject }> => {
    const job = CONTRACT_JOBS_BY_SUBJECT.get(subject);
    if (!job) {
        throw new Error(`Unknown NATS subject "${subject}"`);
    }

    return job as Extract<NatsContractJob, { subject: TSubject }>;
};
