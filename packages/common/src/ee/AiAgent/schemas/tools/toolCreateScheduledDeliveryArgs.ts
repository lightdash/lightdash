import { z } from 'zod';

export const TOOL_CREATE_SCHEDULED_DELIVERY_DESCRIPTION = [
    'Create a LIVE scheduled delivery that sends a saved chart or dashboard to Slack channels and/or email recipients on a cron schedule.',
    'IMPORTANT: before calling this tool, propose the full configuration to the user (name, schedule in plain words, timezone, destinations, format, AI augmentation prompt if any) and wait for their explicit confirmation in the conversation.',
    'Requires an existing saved chart or dashboard — if the content only exists in this conversation, create it with createContent first, then schedule the created uuid.',
    'On success, share the returned href with the user — the delivery is managed (paused, edited, deleted) from that page.',
].join(' ');

const slackTargetSchema = z.object({
    type: z.literal('slack'),
    channel: z
        .string()
        .min(1)
        .describe(
            'Slack channel ID (preferred, e.g. "C0123ABCDEF") or channel name. The Lightdash Slack app must be able to join it.',
        ),
});

const emailTargetSchema = z.object({
    type: z.literal('email'),
    recipient: z.string().min(3).describe('Email address of the recipient.'),
});

export const toolCreateScheduledDeliveryArgsSchema = z.object({
    resourceType: z
        .enum(['chart', 'dashboard'])
        .describe('Type of saved content to deliver.'),
    resourceUuidOrSlug: z
        .string()
        .describe(
            'UUID (preferred) or slug of the saved chart or dashboard to deliver. Use the uuid from createContent/findContent results — slugs are not guaranteed unique.',
        ),
    name: z.string().min(1).describe('Human-readable delivery name.'),
    cron: z
        .string()
        .describe(
            '5-part cron expression, e.g. "0 9 * * 1". Minimum frequency is hourly — sub-hourly minute patterns (e.g. "*/15") are rejected.',
        ),
    timezone: z
        .string()
        .nullable()
        .describe(
            'IANA timezone the cron runs in (e.g. "Europe/London"). null = project default.',
        ),
    format: z
        .enum(['csv', 'image'])
        .describe(
            '"image" sends a rendered image of the chart/dashboard; "csv" sends the results as CSV.',
        ),
    csvOptions: z
        .object({
            formatted: z
                .boolean()
                .describe('Apply Lightdash value formatting.'),
            limit: z
                .union([
                    z.literal('table'),
                    z.literal('all'),
                    z.number().int().positive(),
                ])
                .describe(
                    '"table" = the chart\'s own limit, "all" = all results, or an explicit row count.',
                ),
        })
        .nullable()
        .describe(
            'Only used when format is "csv". null = defaults (formatted, table limit).',
        ),
    message: z
        .string()
        .nullable()
        .describe(
            'Optional static message included with every delivery. Ignored when aiAugmentationPrompt is set (the AI writes the message instead).',
        ),
    targets: z
        .array(
            z.discriminatedUnion('type', [
                slackTargetSchema,
                emailTargetSchema,
            ]),
        )
        .min(1)
        .describe('At least one Slack channel or email recipient.'),
    enabled: z
        .boolean()
        .describe(
            'Whether the delivery starts firing immediately. Use true only when the user explicitly confirmed it should go live; when in doubt, create it paused (false) — the user can enable it from the UI.',
        ),
    aiAugmentationPrompt: z
        .string()
        .nullable()
        .describe(
            'Instructions for the AI-written delivery message, regenerated from the delivered data on every send. null = plain delivery without AI augmentation.',
        ),
});

export type ToolCreateScheduledDeliveryArgs = z.infer<
    typeof toolCreateScheduledDeliveryArgsSchema
>;

const toolCreateScheduledDeliveryMetadataSchema = z.discriminatedUnion(
    'status',
    [
        z.object({ status: z.literal('error') }),
        z.object({
            status: z.literal('success'),
            schedulerUuid: z.string(),
            name: z.string(),
            cron: z.string(),
            resourceType: z.enum(['chart', 'dashboard']),
            resourceUuid: z.string(),
            href: z.string(),
            aiAugmentationAttached: z.boolean(),
            warnings: z.array(z.string()),
        }),
    ],
);

export const toolCreateScheduledDeliveryOutputSchema = z.object({
    result: z.string(),
    metadata: toolCreateScheduledDeliveryMetadataSchema,
});

export type ToolCreateScheduledDeliveryOutput = z.infer<
    typeof toolCreateScheduledDeliveryOutputSchema
>;
