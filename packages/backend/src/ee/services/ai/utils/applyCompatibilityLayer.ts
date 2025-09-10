import {
    SchemaCompatLayer,
    applyCompatLayer as applyCompatLayerMastra,
} from '@mastra/schema-compat';
import { jsonSchema } from 'ai';
import { z } from 'zod';

export const applyCompatLayer = <T extends z.ZodSchema<unknown>>(
    schemaCompatLayers: SchemaCompatLayer[] | null,
    schema: T,
) =>
    jsonSchema<z.infer<T>>(
        applyCompatLayerMastra({
            compatLayers: schemaCompatLayers ?? [],
            schema,
            mode: 'jsonSchema',
        }),
    );
