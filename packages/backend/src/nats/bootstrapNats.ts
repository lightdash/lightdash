import {
    AckPolicy,
    NatsError,
    RetentionPolicy,
    type NatsConnection,
} from 'nats';
import Logger from '../logging/logger';
import type { StreamConfig } from './NatsWorker';

/**
 * Idempotent bootstrap: ensures JetStream streams and durable consumers exist.
 * Safe to call on every worker startup.
 */
export const bootstrapStreams = async (
    connection: NatsConnection,
    configs: StreamConfig[],
): Promise<void> => {
    const jsm = await connection.jetstreamManager();

    for (const config of configs) {
        try {
            // eslint-disable-next-line no-await-in-loop
            await jsm.streams.info(config.streamName);
            Logger.info(`NATS stream exists: ${config.streamName}`);
        } catch (err) {
            if (err instanceof NatsError && err.code === '404') {
                // eslint-disable-next-line no-await-in-loop
                await jsm.streams.add({
                    name: config.streamName,
                    subjects: [config.subject],
                    retention: RetentionPolicy.Workqueue,
                    num_replicas: 1,
                });
                Logger.info(
                    `NATS stream created: ${config.streamName} (${config.subject})`,
                );
            } else {
                throw err;
            }
        }

        try {
            // eslint-disable-next-line no-await-in-loop
            await jsm.consumers.info(config.streamName, config.durableName);
            Logger.info(`NATS consumer exists: ${config.durableName}`);
        } catch (err) {
            if (err instanceof NatsError && err.code === '404') {
                // eslint-disable-next-line no-await-in-loop
                await jsm.consumers.add(config.streamName, {
                    durable_name: config.durableName,
                    filter_subject: config.subject,
                    ack_policy: AckPolicy.Explicit,
                });
                Logger.info(
                    `NATS consumer created: ${config.durableName} (${config.subject})`,
                );
            } else {
                throw err;
            }
        }
    }
};
