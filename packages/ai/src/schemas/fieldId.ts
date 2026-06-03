import { z } from 'zod';

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

export { getFieldIdSchema };
