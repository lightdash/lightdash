import { z } from 'zod';

export const TOOL_UPDATE_USER_NAME_DESCRIPTION =
    "Update the first and last name of the user you are currently talking to. Use this when the user tells you their name — either because you asked (their name has not been collected yet) or because they want to correct how their name is stored. Only save a name the user explicitly provided for themselves; never invent or infer one, and never use it to change another user's name.";

export const toolUpdateUserNameArgsSchema = z.object({
    firstName: z.string().trim().min(1).max(255),
    lastName: z.string().trim().min(1).max(255),
});

export type ToolUpdateUserNameArgs = z.infer<
    typeof toolUpdateUserNameArgsSchema
>;

const toolUpdateUserNameMetadataSchema = z.discriminatedUnion('status', [
    z.object({ status: z.literal('error') }),
    z.object({
        status: z.literal('success'),
        fullName: z.string(),
    }),
]);

export const toolUpdateUserNameOutputSchema = z.object({
    result: z.string(),
    metadata: toolUpdateUserNameMetadataSchema,
});

export type ToolUpdateUserNameOutput = z.infer<
    typeof toolUpdateUserNameOutputSchema
>;
