import knex, { type Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import { AiSlackArtifactDeliveryModel } from '../../../models/AiSlackArtifactDeliveryModel';
import { getSlackArtifactCardBlockId } from '../../../services/ai/utils/slackArtifactImages';
import {
    deliverSlackArtifactImages,
    type SlackArtifactDeliveryMessage,
    type SlackArtifactDeliveryRuntime,
} from '../../../services/AiAgentService/SlackArtifactImageDelivery';
import {
    type DbAiSlackArtifactDelivery,
    type SlackArtifactRenderInput,
} from '../../entities/aiSlackArtifactDeliveries';
import { down, up } from '../20260920083000_add_ai_slack_artifact_deliveries';

describe('Slack artifact image outbox PostgreSQL integration', () => {
    let database: Knex;
    let transaction: Knex.Transaction;
    let model: AiSlackArtifactDeliveryModel;
    let promptUuid: string;
    let input: SlackArtifactRenderInput;
    const table = 'ai_slack_artifact_deliveries';

    beforeAll(() => {
        if (!process.env.PGCONNECTIONURI && !process.env.PGDATABASE)
            throw new Error('PostgreSQL integration connection is required');
        database = knex({
            client: 'pg',
            connection: process.env.PGCONNECTIONURI ?? {
                host: process.env.PGHOST,
                port: Number(process.env.PGPORT ?? 5432),
                user: process.env.PGUSER,
                password: process.env.PGPASSWORD,
                database: process.env.PGDATABASE,
            },
        });
    });

    beforeEach(async () => {
        transaction = await database.transaction();
        const schemaName = `slack_artifact_delivery_${process.pid}`;
        await transaction.raw('CREATE SCHEMA ??', [schemaName]);
        await transaction.raw('SET LOCAL search_path TO ??, public', [
            schemaName,
        ]);
        await transaction.schema.createTable('ai_prompt', (t) => {
            t.uuid('ai_prompt_uuid').primary();
            t.text('response').nullable();
            t.text('error_message').nullable();
        });
        await transaction.schema.createTable('ai_slack_prompt', (t) => {
            t.uuid('ai_prompt_uuid').primary();
        });
        await transaction.schema.createTable('ai_artifact_versions', (t) => {
            t.uuid('ai_artifact_version_uuid').primary();
            t.uuid('ai_artifact_uuid').notNullable();
            t.uuid('ai_prompt_uuid').notNullable();
        });
        await up(transaction);
        model = new AiSlackArtifactDeliveryModel(transaction);
        promptUuid = randomUUID();
        input = {
            artifactUuid: randomUUID(),
            versionUuid: randomUUID(),
            queryUuid: randomUUID(),
            rowLimit: 42,
            queryTool: {
                title: 'Orders',
                description: 'Exact execution',
            } as SlackArtifactRenderInput['queryTool'],
        };
        await transaction<{ ai_prompt_uuid: string }>('ai_prompt').insert({
            ai_prompt_uuid: promptUuid,
        });
        await transaction<{ ai_prompt_uuid: string }>('ai_slack_prompt').insert(
            {
                ai_prompt_uuid: promptUuid,
            },
        );
        await transaction<{
            ai_prompt_uuid: string;
            ai_artifact_uuid: string;
            ai_artifact_version_uuid: string;
        }>('ai_artifact_versions').insert({
            ai_prompt_uuid: promptUuid,
            ai_artifact_uuid: input.artifactUuid,
            ai_artifact_version_uuid: input.versionUuid,
        });
    });

    afterEach(async () => {
        if (transaction && !transaction.isCompleted())
            await transaction.rollback();
    });
    afterAll(async () => {
        await database?.destroy();
    });

    it('persists the exact execution and ignores replays changing its binding', async () => {
        expect(await model.register(promptUuid, input)).toBe(true);
        expect(
            await model.register(promptUuid, {
                ...input,
                queryUuid: randomUUID(),
            }),
        ).toBe(true);
        const row = await model.get(promptUuid);
        expect(row?.render_inputs).toEqual({ [input.versionUuid]: input });
        expect(row?.attempts).toBe(0);
        expect(row?.finished_at).toBeNull();
    });

    it('keeps different versions separate within one prompt', async () => {
        const next = {
            ...input,
            versionUuid: randomUUID(),
            queryUuid: randomUUID(),
        };
        await transaction<{
            ai_prompt_uuid: string;
            ai_artifact_uuid: string;
            ai_artifact_version_uuid: string;
        }>('ai_artifact_versions').insert({
            ai_prompt_uuid: promptUuid,
            ai_artifact_uuid: next.artifactUuid,
            ai_artifact_version_uuid: next.versionUuid,
        });
        await model.register(promptUuid, input);
        await model.register(promptUuid, next);
        expect((await model.get(promptUuid))?.render_inputs).toEqual({
            [input.versionUuid]: input,
            [next.versionUuid]: next,
        });
    });

    it('rejects cross-prompt, unknown-version and wrong-artifact attribution', async () => {
        expect(await model.register(randomUUID(), input)).toBe(false);
        expect(
            await model.register(promptUuid, {
                ...input,
                versionUuid: randomUUID(),
            }),
        ).toBe(false);
        expect(
            await model.register(promptUuid, {
                ...input,
                artifactUuid: randomUUID(),
            }),
        ).toBe(false);
        expect(await model.get(promptUuid)).toBeUndefined();
    });

    it('does not register a web-only prompt', async () => {
        await transaction('ai_slack_prompt')
            .where('ai_prompt_uuid', promptUuid)
            .delete();
        expect(await model.register(promptUuid, input)).toBe(false);
        expect(await model.get(promptUuid)).toBeUndefined();
    });

    it('bounds payload size and cached row reads before writing', async () => {
        expect(
            await model.register(promptUuid, { ...input, rowLimit: 0 }),
        ).toBe(false);
        expect(
            await model.register(promptUuid, { ...input, rowLimit: 100_001 }),
        ).toBe(false);
        expect(
            await model.register(promptUuid, { ...input, rowLimit: 1.5 }),
        ).toBe(false);
        expect(
            await model.register(promptUuid, {
                ...input,
                queryTool: {
                    ...input.queryTool,
                    description: '字'.repeat(100_000),
                },
            }),
        ).toBe(false);
        expect(await model.get(promptUuid)).toBeUndefined();
    });

    it('retains the first persisted image and never attaches an unknown version', async () => {
        await model.register(promptUuid, input);
        await model.saveImage(
            promptUuid,
            input.versionUuid,
            'https://images/first',
        );
        await model.saveImage(
            promptUuid,
            input.versionUuid,
            'https://images/retry',
        );
        await model.saveImage(promptUuid, randomUUID(), 'https://images/wrong');
        await model.setMessage(promptUuid, '123.456');
        const row = await model.get(promptUuid);
        expect(row?.rendered_images).toEqual({
            [input.versionUuid]: 'https://images/first',
        });
        expect(row?.message_ts).toBe('123.456');
    });

    it('bounds retries across job replacements and process restarts', async () => {
        await model.register(promptUuid, input);
        for (let attempt = 1; attempt <= 6; attempt += 1) {
            const restartedModel = new AiSlackArtifactDeliveryModel(
                transaction,
            );
            // eslint-disable-next-line no-await-in-loop
            expect((await restartedModel.claim(promptUuid))?.attempts).toBe(
                attempt,
            );
        }
        expect(await model.claim(promptUuid)).toBeUndefined();
    });

    it('does not reopen or change completed delivery state', async () => {
        await model.register(promptUuid, input);
        await model.finish(promptUuid, 'delivered');
        expect(await model.claim(promptUuid)).toBeUndefined();
        expect(await model.register(promptUuid, input)).toBe(false);
        await model.finish(promptUuid, 'cancelled');
        await model.setMessage(promptUuid, 'wrong');
        await model.saveImage(
            promptUuid,
            input.versionUuid,
            'https://images/late',
        );
        const row = await model.get(promptUuid);
        expect(row?.outcome).toBe('delivered');
        expect(row?.message_ts).toBeNull();
        expect(row?.rendered_images).toEqual({});
    });

    it('recovers only stale, recent, answered and retryable outbox rows', async () => {
        const now = new Date('2026-09-20T10:00:00Z');
        await model.register(promptUuid, input);
        await transaction<DbAiSlackArtifactDelivery>(table)
            .where('ai_prompt_uuid', promptUuid)
            .update({
                created_at: new Date(now.getTime() - 120_000),
                updated_at: new Date(now.getTime() - 120_000),
            });
        expect(await model.findPending(now)).toEqual([]);
        await transaction('ai_prompt')
            .where('ai_prompt_uuid', promptUuid)
            .update({ response: 'Answer' });
        expect(await model.findPending(now)).toEqual([promptUuid]);
        await transaction<DbAiSlackArtifactDelivery>(table)
            .where('ai_prompt_uuid', promptUuid)
            .update({ attempts: 6 });
        expect(await model.findPending(now)).toEqual([]);
        await transaction<DbAiSlackArtifactDelivery>(table)
            .where('ai_prompt_uuid', promptUuid)
            .update({ attempts: 0, updated_at: now });
        expect(await model.findPending(now)).toEqual([]);
        await transaction<DbAiSlackArtifactDelivery>(table)
            .where('ai_prompt_uuid', promptUuid)
            .update({
                updated_at: new Date(now.getTime() - 120_000),
                created_at: new Date(now.getTime() - 2 * 86_400_000),
            });
        expect(await model.findPending(now)).toEqual([]);
    });

    it('deleting the prompt cascades its optional delivery state', async () => {
        await model.register(promptUuid, input);
        await transaction('ai_prompt')
            .where('ai_prompt_uuid', promptUuid)
            .delete();
        expect(await model.get(promptUuid)).toBeUndefined();
    });

    it('reverses the new table and its indexes', async () => {
        await down(transaction);
        expect(await transaction.schema.hasTable(table)).toBe(false);
    });

    const runtimeHarness = () => {
        let message: SlackArtifactDeliveryMessage = {
            ts: '123.456',
            text: 'Answer',
            blocks: [
                {
                    type: 'card',
                    block_id: getSlackArtifactCardBlockId(input.versionUuid),
                },
                { type: 'context', block_id: 'feedback' },
            ],
        };
        const runtime = {
            findMessage: vi.fn().mockImplementation(async () => message),
            authorize: vi.fn().mockResolvedValue(undefined),
            render: vi
                .fn()
                .mockResolvedValue('https://lightdash.test/image/one'),
            isImageReachable: vi.fn().mockResolvedValue(true),
            updateMessage: vi
                .fn()
                .mockImplementation(
                    async (next: SlackArtifactDeliveryMessage) => {
                        message = next;
                    },
                ),
        } satisfies SlackArtifactDeliveryRuntime;
        return {
            runtime,
            prepare: vi.fn().mockResolvedValue(runtime),
            current: () => message,
            setMessage: (next: SlackArtifactDeliveryMessage) => {
                message = next;
            },
        };
    };

    it('delivers a persisted image once and treats a repeated job as a no-op', async () => {
        await model.register(promptUuid, input);
        const { runtime, prepare, current } = runtimeHarness();
        await deliverSlackArtifactImages({ promptUuid, model, prepare });
        expect(current().blocks[0]).toMatchObject({
            hero_image: { image_url: 'https://lightdash.test/image/one' },
        });
        expect((await model.get(promptUuid))?.outcome).toBe('delivered');
        await deliverSlackArtifactImages({
            promptUuid,
            model: new AiSlackArtifactDeliveryModel(transaction),
            prepare,
        });
        expect(runtime.render).toHaveBeenCalledTimes(1);
        expect(runtime.updateMessage).toHaveBeenCalledTimes(1);
    });

    it('retries a failed Slack update without rendering or posting another image', async () => {
        await model.register(promptUuid, input);
        const { runtime, prepare } = runtimeHarness();
        runtime.updateMessage.mockRejectedValueOnce(
            new Error('Slack temporarily unavailable'),
        );
        await expect(
            deliverSlackArtifactImages({ promptUuid, model, prepare }),
        ).rejects.toThrow('Slack temporarily unavailable');
        expect((await model.get(promptUuid))?.rendered_images).toHaveProperty(
            input.versionUuid,
            'https://lightdash.test/image/one',
        );
        await deliverSlackArtifactImages({
            promptUuid,
            model: new AiSlackArtifactDeliveryModel(transaction),
            prepare,
        });
        expect(runtime.render).toHaveBeenCalledTimes(1);
        expect(runtime.updateMessage).toHaveBeenCalledTimes(2);
        expect((await model.get(promptUuid))?.outcome).toBe('delivered');
    });

    it('publishes successful charts while retrying only the failed render', async () => {
        const next = {
            ...input,
            versionUuid: randomUUID(),
            queryUuid: randomUUID(),
        };
        await transaction<{
            ai_prompt_uuid: string;
            ai_artifact_uuid: string;
            ai_artifact_version_uuid: string;
        }>('ai_artifact_versions').insert({
            ai_prompt_uuid: promptUuid,
            ai_artifact_uuid: next.artifactUuid,
            ai_artifact_version_uuid: next.versionUuid,
        });
        await model.register(promptUuid, input);
        await model.register(promptUuid, next);
        const { runtime, prepare, current, setMessage } = runtimeHarness();
        setMessage({
            ...current(),
            blocks: [
                ...current().blocks,
                {
                    type: 'card',
                    block_id: getSlackArtifactCardBlockId(next.versionUuid),
                },
            ],
        });
        runtime.render.mockRejectedValueOnce(
            new Error('Renderer temporarily unavailable'),
        );
        await expect(
            deliverSlackArtifactImages({ promptUuid, model, prepare }),
        ).rejects.toThrow('Some Slack artifact images');
        expect((await model.get(promptUuid))?.rendered_images).toEqual({
            [next.versionUuid]: 'https://lightdash.test/image/one',
        });
        await deliverSlackArtifactImages({ promptUuid, model, prepare });
        expect(
            runtime.render.mock.calls.map(([value]) => value.versionUuid),
        ).toEqual([input.versionUuid, next.versionUuid, input.versionUuid]);
        expect((await model.get(promptUuid))?.outcome).toBe('delivered');
    });

    it('does not publish when policy is revoked during rendering', async () => {
        await model.register(promptUuid, input);
        const { runtime, prepare } = runtimeHarness();
        prepare.mockResolvedValueOnce(runtime).mockResolvedValueOnce(null);
        await deliverSlackArtifactImages({ promptUuid, model, prepare });
        expect(runtime.render).toHaveBeenCalledTimes(1);
        expect(runtime.updateMessage).not.toHaveBeenCalled();
        expect((await model.get(promptUuid))?.outcome).toBe('cancelled');
    });

    it('reauthorizes a cached image before delivering it', async () => {
        await model.register(promptUuid, input);
        await model.saveImage(
            promptUuid,
            input.versionUuid,
            'https://lightdash.test/image/cached',
        );
        const { runtime, prepare } = runtimeHarness();
        runtime.authorize.mockRejectedValue(new Error('Access revoked'));
        await expect(
            deliverSlackArtifactImages({ promptUuid, model, prepare }),
        ).rejects.toThrow('Access revoked');
        expect(runtime.render).not.toHaveBeenCalled();
        expect(runtime.updateMessage).not.toHaveBeenCalled();
    });

    it('uses current feedback and message text after rendering', async () => {
        await model.register(promptUuid, input);
        const { runtime, prepare, current, setMessage } = runtimeHarness();
        runtime.render.mockImplementationOnce(async () => {
            setMessage({
                ...current(),
                text: 'Edited answer',
                blocks: [
                    current().blocks[0],
                    { type: 'context', block_id: 'feedback-updated' },
                ],
            });
            return 'https://lightdash.test/image/one';
        });
        await deliverSlackArtifactImages({ promptUuid, model, prepare });
        expect(current().text).toBe('Edited answer');
        expect(current().blocks[1]).toEqual({
            type: 'context',
            block_id: 'feedback-updated',
        });
    });

    it('does not attach an image when the original card was removed', async () => {
        await model.register(promptUuid, input);
        const { runtime, prepare, current, setMessage } = runtimeHarness();
        setMessage({
            ...current(),
            blocks: [
                {
                    type: 'card',
                    block_id: getSlackArtifactCardBlockId(randomUUID()),
                },
            ],
        });
        await deliverSlackArtifactImages({ promptUuid, model, prepare });
        expect(runtime.render).not.toHaveBeenCalled();
        expect(runtime.updateMessage).not.toHaveBeenCalled();
        expect((await model.get(promptUuid))?.outcome).toBe('cancelled');
    });

    it('an older timed-out attempt cannot publish over a replacement attempt', async () => {
        await model.register(promptUuid, input);
        const { runtime, prepare } = runtimeHarness();
        runtime.render.mockImplementationOnce(async () => {
            await model.claim(promptUuid);
            return 'https://lightdash.test/image/one';
        });
        await deliverSlackArtifactImages({ promptUuid, model, prepare });
        expect(runtime.updateMessage).not.toHaveBeenCalled();
        expect((await model.get(promptUuid))?.finished_at).toBeNull();
    });

    it('a timeout during the reachability probe cannot overwrite a replacement', async () => {
        await model.register(promptUuid, input);
        const { runtime, prepare } = runtimeHarness();
        runtime.isImageReachable.mockImplementationOnce(async () => {
            await model.claim(promptUuid);
            return true;
        });
        await deliverSlackArtifactImages({ promptUuid, model, prepare });
        expect(runtime.updateMessage).not.toHaveBeenCalled();
        expect((await model.get(promptUuid))?.finished_at).toBeNull();
    });

    it('keeps completed renders for retry when the background time budget expires', async () => {
        await model.register(promptUuid, input);
        const { runtime, prepare } = runtimeHarness();
        const controller = new AbortController();
        runtime.render.mockImplementationOnce(async () => {
            controller.abort();
            return 'https://lightdash.test/image/one';
        });
        await expect(
            deliverSlackArtifactImages({
                promptUuid,
                model,
                prepare,
                signal: controller.signal,
            }),
        ).rejects.toThrow();
        expect(runtime.updateMessage).not.toHaveBeenCalled();
        expect((await model.get(promptUuid))?.finished_at).toBeNull();
        await deliverSlackArtifactImages({ promptUuid, model, prepare });
        expect(runtime.render).toHaveBeenCalledTimes(1);
        expect(runtime.updateMessage).toHaveBeenCalledTimes(1);
        expect((await model.get(promptUuid))?.outcome).toBe('delivered');
    });

    it('recovers a hard crash on the final attempt after the worker timeout grace period', async () => {
        await model.register(promptUuid, input);
        await transaction<DbAiSlackArtifactDelivery>(table)
            .where('ai_prompt_uuid', promptUuid)
            .update({
                attempts: 6,
                updated_at: new Date(Date.now() - 90_000),
            });
        await model.findPending();
        expect((await model.get(promptUuid))?.finished_at).toBeNull();
        await model.findPending(new Date(Date.now() + 31_000));
        expect((await model.get(promptUuid))?.outcome).toBe('unavailable');
    });

    it('an older attempt cannot cancel a replacement after its policy check finishes', async () => {
        await model.register(promptUuid, input);
        const prepare = async () => {
            await model.claim(promptUuid);
            return null;
        };
        await deliverSlackArtifactImages({ promptUuid, model, prepare });
        expect((await model.get(promptUuid))?.finished_at).toBeNull();
        expect((await model.get(promptUuid))?.attempts).toBe(2);
    });

    it('delivers images inside a multi-chart carousel', async () => {
        await model.register(promptUuid, input);
        const { runtime, prepare, current, setMessage } = runtimeHarness();
        setMessage({
            ...current(),
            blocks: [
                {
                    type: 'carousel',
                    elements: [current().blocks[0]],
                } as SlackArtifactDeliveryMessage['blocks'][number],
            ],
        });
        await deliverSlackArtifactImages({ promptUuid, model, prepare });
        expect(runtime.updateMessage).toHaveBeenCalledTimes(1);
        expect(current().blocks).toMatchObject([
            {
                type: 'carousel',
                elements: [
                    {
                        hero_image: {
                            image_url: 'https://lightdash.test/image/one',
                        },
                    },
                ],
            },
        ]);
        expect((await model.get(promptUuid))?.outcome).toBe('delivered');
    });

    it('marks exhausted delivery attempts terminal without touching the answer', async () => {
        await model.register(promptUuid, input);
        await transaction<{ ai_prompt_uuid: string; response: string }>(
            'ai_prompt',
        )
            .where('ai_prompt_uuid', promptUuid)
            .update({ response: 'Answer remains available' });
        await transaction<DbAiSlackArtifactDelivery>(table)
            .where('ai_prompt_uuid', promptUuid)
            .update({ attempts: 5 });
        const { runtime, prepare } = runtimeHarness();
        runtime.updateMessage.mockRejectedValue(new Error('Slack unavailable'));
        await expect(
            deliverSlackArtifactImages({ promptUuid, model, prepare }),
        ).rejects.toThrow('Slack unavailable');
        expect((await model.get(promptUuid))?.outcome).toBe('unavailable');
        expect(
            (
                await transaction('ai_prompt')
                    .where('ai_prompt_uuid', promptUuid)
                    .first()
            )?.response,
        ).toBe('Answer remains available');
    });
});
