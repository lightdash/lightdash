#!/usr/bin/env bash
set -euo pipefail

pnpm -F backend exec node --input-type=module <<'EOF'
import { AckPolicy, connect, RetentionPolicy } from 'nats';

const requiredEnv = (key) => {
    const value = process.env[key];
    if (!value) {
        throw new Error(`Missing required environment variable: ${key}`);
    }
    return value;
};

const ensureStream = async ({ jsm, name, subject }) => {
    try {
        await jsm.streams.info(name);
        console.log(`stream exists: ${name}`);
    } catch {
        await jsm.streams.add({
            name,
            subjects: [subject],
            retention: RetentionPolicy.Workqueue,
            num_replicas: 1,
        });
        console.log(`stream created: ${name} (${subject})`);
    }
};

const ensureConsumer = async ({ jsm, stream, durable, filterSubject }) => {
    try {
        await jsm.consumers.info(stream, durable);
        console.log(`consumer exists: ${durable}`);
    } catch {
        await jsm.consumers.add(stream, {
            durable_name: durable,
            filter_subject: filterSubject,
            ack_policy: AckPolicy.Explicit,
        });
        console.log(`consumer created: ${durable} (${filterSubject})`);
    }
};

const natsUrl = process.env.ASYNC_QUERY_NATS_URL ?? 'nats://localhost:4222';
const customerId = requiredEnv('ASYNC_QUERY_NATS_CUSTOMER_ID');
const warehouseStreamName =
    process.env.ASYNC_QUERY_NATS_WAREHOUSE_STREAM_NAME ??
    'WAREHOUSE_QUERY_JOBS';
const preAggregateStreamName =
    process.env.ASYNC_QUERY_NATS_PRE_AGGREGATE_STREAM_NAME ??
    'PRE_AGGREGATE_QUERY_JOBS';

const warehouseSubject = `tenant.${customerId}.warehouse.query.jobs`;
const preAggregateSubject = `tenant.${customerId}.pre_aggregate.query.jobs`;
const warehouseDurable = `worker-${customerId}-warehouse`;
const preAggregateDurable = `worker-${customerId}-pre-aggregate`;

const nc = await connect({ servers: natsUrl });
try {
    const jsm = await nc.jetstreamManager();

    await ensureStream({
        jsm,
        name: warehouseStreamName,
        subject: warehouseSubject,
    });
    await ensureStream({
        jsm,
        name: preAggregateStreamName,
        subject: preAggregateSubject,
    });
    await ensureConsumer({
        jsm,
        stream: warehouseStreamName,
        durable: warehouseDurable,
        filterSubject: warehouseSubject,
    });
    await ensureConsumer({
        jsm,
        stream: preAggregateStreamName,
        durable: preAggregateDurable,
        filterSubject: preAggregateSubject,
    });

    console.log('async query NATS resources are ready');
} finally {
    await nc.close();
}
EOF
