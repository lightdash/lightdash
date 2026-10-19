import { type QueryResultProducer } from '@lightdash/common';
import { z } from 'zod';
import { type S3ResultsFileStorageClient } from '../../../clients/ResultsFileStorageClients/S3ResultsFileStorageClient';

const materializationProducerSchema = z.object({
    version: z.literal(1),
    authMethod: z.enum(['session', 'pat', 'oauth', 'service-account', 'jwt']),
    projectUuid: z.string(),
    queryUuid: z.string(),
    warehouseConnectionUuid: z.string().nullable(),
    identityFingerprint: z.string().min(1),
});

export const writeMaterializationProducer = async (
    storage: S3ResultsFileStorageClient,
    args: {
        projectUuid: string;
        queryUuid: string;
        resultsFileName: string;
        producer: QueryResultProducer | null;
    },
): Promise<void> => {
    const { producer } = args;
    if (
        producer?.authMethod == null ||
        producer.credentialOwner.kind !== 'shared_connection' ||
        producer.agentIdentity !== null ||
        producer.credentialOwner.identityFingerprint == null
    )
        return;
    await storage.uploadResults(
        `${args.resultsFileName}.producer`,
        JSON.stringify({
            version: 1,
            authMethod: producer.authMethod,
            projectUuid: args.projectUuid,
            queryUuid: args.queryUuid,
            warehouseConnectionUuid: producer.warehouseConnectionUuid,
            identityFingerprint: producer.credentialOwner.identityFingerprint,
        }),
        undefined,
    );
};

export const readMaterializationProducer = async (
    storage: S3ResultsFileStorageClient,
    args: {
        projectUuid: string;
        queryUuid: string;
        materializationUri: string;
    },
): Promise<QueryResultProducer | null> => {
    try {
        const fileName = new URL(args.materializationUri).pathname
            .slice(1)
            .replace(/\.(jsonl|parquet)$/, '');
        const response = await storage.getResults(`${fileName}.producer`);
        const body = await response.Body?.transformToString();
        if (!body) return null;
        const parsed = materializationProducerSchema.safeParse(
            JSON.parse(body),
        );
        if (
            !parsed.success ||
            parsed.data.projectUuid !== args.projectUuid ||
            parsed.data.queryUuid !== args.queryUuid
        )
            return null;
        return {
            version: 1,
            authMethod: parsed.data.authMethod,
            warehouseConnectionUuid: parsed.data.warehouseConnectionUuid,
            credentialOwner: {
                kind: 'shared_connection',
                identityFingerprint: parsed.data.identityFingerprint,
            },
            agentIdentity: null,
        };
    } catch {
        return null;
    }
};
