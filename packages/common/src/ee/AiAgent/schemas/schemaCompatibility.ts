import {
    AnthropicSchemaCompatLayer,
    applyCompatLayer,
    OpenAIReasoningSchemaCompatLayer,
} from '@mastra/schema-compat';
import type { ZodSchema } from 'zod';

export interface SchemaTarget {
    provider: string;
    modelId: string;
    supportsStructuredOutputs: boolean;
}

export class SchemaCompatibilityManager {
    static transformSchema<T extends ZodSchema>(
        schema: T,
        target: SchemaTarget,
    ): T {
        const compatLayers = [
            new OpenAIReasoningSchemaCompatLayer(target),
            new AnthropicSchemaCompatLayer(target),
        ];

        return applyCompatLayer({
            schema,
            compatLayers,
            mode: 'aiSdkSchema',
        }) as unknown as T;
    }
}
