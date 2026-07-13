import {
    createScheduledDeliveryToolDefinition,
    SchedulerFormat,
    type CreateSchedulerAndTargetsWithoutIds,
    type ToolCreateScheduledDeliveryArgs,
} from '@lightdash/common';
import { tool } from 'ai';
import type { CreateScheduledDeliveryFn } from '../types/aiAgentDependencies';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorHandler } from '../utils/toolErrorHandler';

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
    appUuid: null,
    appName: null,
    targets: args.targets.map((target) =>
        target.type === 'slack'
            ? { channel: target.channel }
            : { recipient: target.recipient },
    ),
});

export const getCreateScheduledDelivery = ({
    createScheduledDelivery,
}: Dependencies) =>
    tool({
        ...toolDefinition,
        execute: async (args) => {
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

                const summary = [
                    `Created scheduled delivery "${scheduler.name}" (uuid: ${scheduler.schedulerUuid}).`,
                    `Schedule: ${scheduler.cron}${
                        scheduler.timezone ? ` (${scheduler.timezone})` : ''
                    }.`,
                    `Targets: ${args.targets
                        .map((t) =>
                            t.type === 'slack'
                                ? `Slack ${t.channel}`
                                : t.recipient,
                        )
                        .join(', ')}.`,
                    scheduler.enabled
                        ? 'The delivery is enabled and live.'
                        : 'The delivery was created paused (disabled).',
                    aiAugmentationAttached
                        ? 'AI augmentation is attached and will write the delivery message on each send.'
                        : null,
                    `Share this link with the user — it opens the delivery's settings, where it can be reviewed, paused, edited or deleted: ${href}`,
                    ...warnings,
                ]
                    .filter(Boolean)
                    .join('\n');

                return {
                    result: summary,
                    metadata: {
                        status: 'success' as const,
                        schedulerUuid: scheduler.schedulerUuid,
                        name: scheduler.name,
                        cron: scheduler.cron,
                        resourceType: args.resourceType,
                        resourceUuid,
                        href,
                        aiAugmentationAttached,
                        warnings,
                    },
                };
            } catch (error) {
                return {
                    result: toolErrorHandler(
                        error,
                        `Error creating scheduled delivery "${args.name}". The delivery was not created.`,
                    ),
                    metadata: {
                        status: 'error' as const,
                    },
                };
            }
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });
