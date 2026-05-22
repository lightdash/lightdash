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

export const createToolSchemaBuilder = <$Schema extends z.ZodRawShape>(
    schema: z.ZodObject<$Schema>,
): ToolSchemaBuilder<$Schema> => ({
    /**
     * Extends the basic schema with the given fields
     */
    extend: <$Fields extends z.ZodRawShape>(fields: $Fields) =>
        createToolSchemaBuilder(schema.extend(fields)) as ToolSchemaBuilder<
            $Schema & $Fields
        >,

    /**
     * Adds a page number to the schema, this is useful for tools that rely on pagination
     */
    withPagination: () =>
        createToolSchemaBuilder(
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

const createToolSchema = (args: {
    description: string;
}): ReturnType<typeof createToolSchemaBuilder<{}>> =>
    createToolSchemaBuilder(z.object({}).describe(args.description));

export { createToolSchema };
