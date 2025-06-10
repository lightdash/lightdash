import { embedMany } from 'ai';
import { getOpenaiTextEmbedding3LargeModel } from '../models/openai-text-embedding-3-large';

type EmbedArgs<T extends object> = {
    values: T[];
    apiKey: string;
};

export const generateEmbeddingsNameAndDescription = async (
    args: EmbedArgs<{
        name: string;
        description: string;
    }>,
) => {
    const model = getOpenaiTextEmbedding3LargeModel(args.apiKey);

    const result = await embedMany({
        model,
        values: args.values.map(
            (value) =>
                `name: ${value.name}\n description: ${value.description}`,
        ),
    });

    return result.embeddings;
};
