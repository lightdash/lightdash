import { z } from 'zod';

export type ToolSchemaBuilder<$Schema extends z.ZodRawShape = z.ZodRawShape> = {
    extend: <$Fields extends z.ZodRawShape>(
        fields: $Fields,
    ) => ToolSchemaBuilder<$Schema & $Fields>;
    withPagination: () => ToolSchemaBuilder<
        $Schema & { page: z.ZodNullable<z.ZodNumber> }
    >;
    build: () => z.ZodObject<$Schema>;
    schema: z.ZodObject<$Schema>;
};

const toolSchemaBuilder = <$Schema extends z.ZodRawShape>(
    schema: z.ZodObject<$Schema>,
): ToolSchemaBuilder<$Schema> => ({
    /**
     * Extends the basic schema with the given fields
     */
    extend: <$Fields extends z.ZodRawShape>(fields: $Fields) =>
        toolSchemaBuilder(schema.extend(fields)) as ToolSchemaBuilder<
            $Schema & $Fields
        >,

    /**
     * Adds a page number to the schema, this is useful for tools that rely on pagination
     */
    withPagination: () =>
        toolSchemaBuilder(
            schema.extend({
                // We need to coerce because LLMs were passing strings instead of numbers quite often (via MCP)
                page: z.coerce
                    .number()
                    .positive()
                    .nullable()
                    .describe(
                        'Use this to paginate through the results. Starts at 1.',
                    ),
            }),
        ) as ToolSchemaBuilder<$Schema & { page: z.ZodNullable<z.ZodNumber> }>,

    /**
     * Builds the schema
     */
    build: () => schema,

    /**
     * Returns the zod schema so far
     */
    schema,
});

function createToolSchema<$Description extends string>(args: {
    description: $Description;
}): ReturnType<typeof toolSchemaBuilder<{}>>;
function createToolSchema<$Description extends string>({
    description,
}: {
    description: $Description;
}) {
    return toolSchemaBuilder(z.object({}).describe(description));
}

export { createToolSchema };
