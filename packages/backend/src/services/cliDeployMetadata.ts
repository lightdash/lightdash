import {
    ParameterError,
    WarehouseTypes,
    type CliDeployMetadata,
} from '@lightdash/common';
import { z } from 'zod';

const cliDeployMetadataSchema = z.object({
    cliCapabilities: z
        .object({
            dbtProjectIdentity: z.literal(1),
            dbtTargetLocation: z.literal(1),
        })
        .strict()
        .optional(),
    dbtProjectName: z
        .string()
        .min(1)
        .max(255)
        .regex(/^[A-Za-z_][A-Za-z0-9_]*$/)
        .optional(),
    dbtTarget: z
        .object({
            type: z.nativeEnum(WarehouseTypes),
            database: z.string().min(1).max(255),
            region: z.string().min(1).max(255).optional(),
        })
        .strict()
        .optional(),
});

export const parseCliDeployMetadata = (
    metadata: CliDeployMetadata = {},
): CliDeployMetadata => {
    const result = cliDeployMetadataSchema.safeParse(metadata);
    if (!result.success) {
        throw new ParameterError('Invalid CLI deploy identity metadata', {
            errors: result.error.flatten(),
        });
    }
    return result.data;
};
