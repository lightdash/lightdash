import { z } from 'zod';
import { type ToolDescriptionContext } from '../defineTool';
import { toolErrorStructuredContentSchema } from '../outputMetadata';
import { toolNameFor } from './discoveryToolNames';

export const TOOL_EDIT_CONTENT_DESCRIPTION = ({
    runtime,
}: ToolDescriptionContext): string =>
    `Edit a dashboard, chart, SQL chart or composer chart with an RFC6902 patch against its JSON as ${toolNameFor('readContent', runtime)} last returned it; the edited content is validated before it is saved. The content's space must show canEdit true in ${toolNameFor('findContent', runtime)} or ${toolNameFor('listContent', runtime)} results; an edit in any other space is refused. A SQL chart needs the SQL chart save permission and, in agent threads, SQL mode; a patch that changes its sql waits for user approval of the new SQL. A composer chart on a dashboard saves in place as a new version. For a composer chart in a space, where dashboardSlug is null, a change to only the name or description renames the chart without a new version. A pipeline or chart change saves a new version. A spaceSlug change moves the chart. The result's warnings name the dashboards that show the chart. New warehouse SQL in a composer chart's nodes waits for approval the same way.`;

export const toolEditContentArgsSchema = z.object({
    slug: z
        .string()
        .min(1)
        .describe(
            'Exact slug of the content to edit. For a composer chart, a uuid also works.',
        ),
    type: z
        .enum(['dashboard', 'chart', 'sql_chart', 'composer_chart'])
        .describe('Type of Lightdash content to edit'),
    patch: z
        .array(z.unknown())
        .describe('RFC6902 operations applied to the current JSON'),
});

const toolEditContentMetadataSchema = z.discriminatedUnion('status', [
    z.object({ status: z.literal('error') }),
    // The user rejected, or never answered, the SQL chart's approval.
    z.object({ status: z.enum(['rejected', 'timeout']) }),
    z.object({
        status: z.literal('success'),
        slug: z.string(),
        name: z.string(),
        uuid: z.string(),
        href: z.string(),
        warnings: z.array(z.string()),
        versionUuids: z.object({
            before: z.string().nullable(),
            after: z.string().nullable(),
        }),
    }),
]);

const editedContentHrefSchema = z
    .string()
    .describe('Canonical Lightdash link to the edited content');
const editedContentWarningsSchema = z
    .array(z.string())
    .describe(
        'Validation warnings about the persisted content; empty when there are none',
    );

export const toolEditContentStructuredContentSchema = z.discriminatedUnion(
    'type',
    [
        z.object({
            type: z.enum(['dashboard', 'chart', 'sql_chart', 'composer_chart']),
            href: editedContentHrefSchema,
            content: z
                .record(z.string(), z.unknown())
                .describe('The dashboard or chart as code after the edit'),
            warnings: editedContentWarningsSchema,
        }),
        z.object({
            type: z.literal('document'),
            href: editedContentHrefSchema,
            uuid: z.string().describe('UUID of the edited Document'),
            versionUuid: z
                .string()
                .describe(
                    'Version UUID after the edit; required as baseVersionUuid for the next content edit',
                ),
            content: z
                .record(z.string(), z.unknown())
                .describe('The Document as code after the edit'),
            warnings: editedContentWarningsSchema,
        }),
    ],
);

// Mirrors `structuredToolOutputSchema`, which only accepts a ZodObject metadata
// schema; this tool's metadata is a discriminated union on `status`.
export const toolEditContentOutputSchema = z.object({
    result: z.string(),
    metadata: toolEditContentMetadataSchema,
    structuredContent: z.union([
        toolEditContentStructuredContentSchema,
        toolErrorStructuredContentSchema,
    ]),
});

export type ToolEditContentArgs = z.infer<typeof toolEditContentArgsSchema>;
export type ToolEditContentStructuredContent = z.infer<
    typeof toolEditContentStructuredContentSchema
>;
export type ToolEditContentOutput = z.infer<typeof toolEditContentOutputSchema>;
