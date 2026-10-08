import { type z } from 'zod';

const AGENT_DEFINITION_NAME_PATTERN = /^[A-Z][A-Za-z0-9]*$/;
const agentDefinitionNames = new WeakMap<z.core.$ZodType, string>();

/** Give a shared schema a stable name only when rendering Agent tool inputs. */
export const nameAgentDefinition = (name: string, schema: z.ZodType): void => {
    if (!AGENT_DEFINITION_NAME_PATTERN.test(name)) {
        throw new Error(`Invalid Agent JSON Schema definition name: ${name}`);
    }

    const existingName = agentDefinitionNames.get(schema);
    if (existingName !== undefined && existingName !== name) {
        throw new Error(
            `Agent JSON Schema definition already named ${existingName}: ${name}`,
        );
    }

    agentDefinitionNames.set(schema, name);
};

export const resolveAgentDefinitionName = (
    schema: z.core.$ZodType,
): string | undefined => agentDefinitionNames.get(schema);
