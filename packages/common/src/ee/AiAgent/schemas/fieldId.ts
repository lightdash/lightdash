import { z } from 'zod';

const fieldIdSchemaUnknown = z.string().describe(
    `Field ID is a unique identifier of a Metric or a Dimension within a project
ID consists of the table name and field name separated by an underscore.
@example: orders_status, customers_first_name, orders_total_order_amount, etc.`,
);

const getFieldIdSchema = (args: { additionalDescription: string | null }) =>
    z
        .string()
        .describe(
            [
                args.additionalDescription,
                '"fieldId" must come from the previously searched Fields; otherwise, it will throw an error',
            ]
                .filter(Boolean)
                .join(' '),
        );

export { fieldIdSchemaUnknown, getFieldIdSchema };
