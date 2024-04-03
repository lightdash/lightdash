import { ParameterError, SshKeyPair, validateEmail } from '@lightdash/common';
import { Attributes, Span, SpanStatusCode } from '@opentelemetry/api';
import * as Sentry from '@sentry/node';
import { CustomSamplingContext } from '@sentry/types';
import { generateKeyPair } from 'crypto';
import { parseKey } from 'sshpk';
import { Worker } from 'worker_threads';
import {
    DbPinnedChart,
    DbPinnedDashboard,
    DbPinnedItem,
    DBPinnedSpace,
} from './database/entities/pinnedList';
import Logger from './logging/logger';
import { serverTracer } from './otel';

export const sanitizeStringParam = (value: any) => {
    if (!value || typeof value !== 'string') {
        throw new ParameterError();
    }
    const trimmedValue = value.trim();
    if (trimmedValue.length <= 0) {
        throw new ParameterError();
    }
    return trimmedValue;
};

export const sanitizeEmailParam = (value: any) => {
    const email = sanitizeStringParam(value);
    if (!validateEmail(email)) {
        throw new ParameterError();
    }
    return email;
};

export const isDbPinnedChart = (data: DbPinnedItem): data is DbPinnedChart =>
    'saved_chart_uuid' in data && !!data.saved_chart_uuid;

export const isDbPinnedDashboard = (
    data: DbPinnedItem,
): data is DbPinnedDashboard =>
    'dashboard_uuid' in data && !!data.dashboard_uuid;

export const isDbPinnedSpace = (data: DbPinnedItem): data is DBPinnedSpace =>
    'space_uuid' in data && !!data.space_uuid;

export const wrapOtelSpan = async <T>(
    name: string,
    attributes: Attributes,
    f: (span: Span) => Promise<T>,
): Promise<T> =>
    serverTracer.startActiveSpan(name, async (span) => {
        span.setAttributes(attributes);
        try {
            return await f(span);
        } catch (error) {
            span.recordException(error);
            span.setStatus({ code: SpanStatusCode.ERROR });
            throw error;
        } finally {
            span.end();
        }
    });

export const wrapSentryTransaction = async <T>(
    name: string,
    context: CustomSamplingContext,
    funct: () => Promise<T>,
): Promise<T> => {
    const startTime = Date.now();
    const transaction = Sentry.getCurrentHub()?.getScope()?.getTransaction();

    Logger.debug(
        `Starting sentry transaction ${
            transaction?.spanId
        } "${name}" with context: ${JSON.stringify(context)}`,
    );

    const span =
        transaction &&
        transaction.startChild({
            op: name,
            data: context,
        });
    try {
        return await funct();
    } catch (error) {
        Logger.error(
            `Error in wrapped sentry transaction ${transaction?.spanId} "${name}": ${error}`,
        );
        Sentry.captureException(error);
        throw error;
    } finally {
        Logger.debug(
            `End sentry transaction ${transaction?.spanId} "${name}", took: ${
                Date.now() - startTime
            }ms`,
        );
        if (span) span.finish();
    }
};

export function runWorkerThread<T>(worker: Worker): Promise<T> {
    return wrapOtelSpan(
        'Utils.runWorkerThread',
        {},
        async () =>
            new Promise((resolve, reject) => {
                worker.on('message', resolve);
                worker.on('error', reject);
                worker.on('exit', (code) => {
                    if (code !== 0) {
                        Logger.error(
                            `Worker thread stopped with exit code ${code}`,
                        );
                        reject(
                            new Error(`Worker stopped with exit code ${code}`),
                        );
                    }
                });
            }),
    );
}

export const generateOpenSshKeyPair = async (): Promise<SshKeyPair> =>
    new Promise<SshKeyPair>((resolve, reject) => {
        generateKeyPair(
            'rsa',
            {
                modulusLength: 4096,
                publicKeyEncoding: {
                    type: 'pkcs1',
                    format: 'pem',
                },
                privateKeyEncoding: {
                    type: 'pkcs1',
                    format: 'pem',
                },
            },
            (err, publicKey, privateKey) => {
                if (err) {
                    reject(err);
                } else {
                    const parsedPublicKey = parseKey(publicKey, 'pem');
                    parsedPublicKey.comment = `(generated_by_lightdash_at_${new Date().toISOString()})`;
                    const openSshPublicKey = parsedPublicKey.toString('ssh');
                    resolve({
                        publicKey: openSshPublicKey,
                        privateKey,
                    });
                }
            },
        );
    });
