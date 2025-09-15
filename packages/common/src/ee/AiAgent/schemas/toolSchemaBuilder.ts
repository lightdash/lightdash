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
                    .describe('Use this to paginate through the results'),
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

export const createToolSchema = <
    $Type extends string,
    $Description extends string,
>(
    /** The type of the tool. This will be used as differentiator for the union with other tool schemas  */
    type: $Type,
    /** Description of the tool. This will be used to help the LLM to understand the tool and its capabilities. Be as clear and concise as possible. */
    description: $Description,
) =>
    toolSchemaBuilder(
        z.object({ type: z.literal(type) }).describe(description),
    );
