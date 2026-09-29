import {
    createScheduledDeliveryToolDefinition,
    SchedulerFormat,
    type CreateSchedulerAndTargetsWithoutIds,
    type ToolCreateScheduledDeliveryArgs,
    type ToolCreateScheduledDeliveryOutput,
    type ToolCreateScheduledDeliveryStructuredContent,
} from '@lightdash/common';
import { tool } from 'ai';
import type { CreateScheduledDeliveryFn } from '../types/aiAgentDependencies';
import type {
    ExecuteStructuredToolResult,
    ExecuteToolErrorResult,
} from '../utils/structuredToolResult';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorOutput } from '../utils/toolErrorHandler';

type Dependencies = {
    createScheduledDelivery: CreateScheduledDeliveryFn;
};

const toolDefinition = createScheduledDeliveryToolDefinition.for('agent');

const toSchedulerPayload = (
    args: ToolCreateScheduledDeliveryArgs,
): CreateSchedulerAndTargetsWithoutIds => ({
    name: args.name,
    cron: args.cron,
    ...(args.timezone ? { timezone: args.timezone } : {}),
    format: args.format === 'csv' ? SchedulerFormat.CSV : SchedulerFormat.IMAGE,
    options:
        args.format === 'csv'
            ? {
                  formatted: args.csvOptions?.formatted ?? true,
                  limit: args.csvOptions?.limit ?? 'table',
              }
            : {},
    ...(args.message ? { message: args.message } : {}),
    enabled: args.enabled,
    includeLinks: true,
    plainTextEmail: false,
    appUuid: null,
    appName: null,
    targets: args.targets.map((target) =>
        target.type === 'slack'
            ? { channel: target.channel }
            : { recipient: target.recipient },
    ),
});

type SuccessMetadata = Extract<
    ToolCreateScheduledDeliveryOutput['metadata'],
    { status: 'success' }
>;

const renderSummary = (
    delivery: ToolCreateScheduledDeliveryStructuredContent,
): string =>
    [
        `Created scheduled delivery "${delivery.name}" (uuid: ${delivery.schedulerUuid}).`,
        `Schedule: ${delivery.cron}${
            delivery.timezone ? ` (${delivery.timezone})` : ''
        }.`,
        `Targets: ${delivery.targets
            .map((t) =>
                t.type === 'slack' ? `Slack ${t.channel}` : t.recipient,
            )
            .join(', ')}.`,
        delivery.enabled
            ? 'The delivery is enabled and live.'
            : 'The delivery was created paused (disabled).',
        delivery.aiAugmentationAttached
            ? 'AI augmentation is attached and will write the delivery message on each send.'
            : null,
        `Share this markdown link with the user verbatim (the link text must be the delivery name) — it opens the delivery's settings, where it can be reviewed, paused, edited or deleted: [${delivery.name}](${delivery.href})`,
        ...delivery.warnings,
    ]
        .filter(Boolean)
        .join('\n');

export const getCreateScheduledDelivery = ({
    createScheduledDelivery,
}: Dependencies) =>
    tool({
        ...toolDefinition,
        execute: async (
            args,
        ): Promise<
            | ExecuteStructuredToolResult<
                  ToolCreateScheduledDeliveryStructuredContent,
                  SuccessMetadata
              >
            | ExecuteToolErrorResult
        > => {
            try {
                const {
                    scheduler,
                    resourceUuid,
                    href,
                    aiAugmentationAttached,
                    warnings,
                } = await createScheduledDelivery({
                    resourceType: args.resourceType,
                    resourceUuidOrSlug: args.resourceUuidOrSlug,
                    scheduler: toSchedulerPayload(args),
                    aiAugmentationPrompt: args.aiAugmentationPrompt,
                });

                const delivery: ToolCreateScheduledDeliveryStructuredContent = {
                    schedulerUuid: scheduler.schedulerUuid,
                    name: scheduler.name,
                    cron: scheduler.cron,
                    timezone: scheduler.timezone || null,
                    targets: args.targets,
                    enabled: scheduler.enabled,
                    aiAugmentationAttached,
                    href,
                    warnings,
                };

                return {
                    result: renderSummary(delivery),
                    metadata: {
                        status: 'success',
                        schedulerUuid: scheduler.schedulerUuid,
                        name: scheduler.name,
                        cron: scheduler.cron,
                        resourceType: args.resourceType,
                        resourceUuid,
                        href,
                        aiAugmentationAttached,
                        warnings,
                    },
                    structuredContent: delivery,
                };
            } catch (error) {
                return toolErrorOutput(
                    error,
                    `Error creating scheduled delivery "${args.name}". The delivery was not created.`,
                );
            }
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });
