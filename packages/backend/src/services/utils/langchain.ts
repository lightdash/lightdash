const EMBEDDING_MODEL =
    process.env.EMBEDDING_MODEL || 'Xenova/all-MiniLM-L6-v2';

// Need to use dynamic imports to avoid problems when running knex commands

async function setupXenova() {
    const { env } = await import('@xenova/transformers');

    env.localModelPath = process.env.EMBEDDING_MODELS_PATH || '/usr/models';
    env.allowRemoteModels = false;
}

async function getmodel() {
    await setupXenova();
    const { HuggingFaceTransformersEmbeddings } = await import(
        '@langchain/community/embeddings/hf_transformers'
    );

    return new HuggingFaceTransformersEmbeddings({
        modelName: EMBEDDING_MODEL,
    });
}

export async function embedText(text: string) {
    const model = await getmodel();
    return JSON.stringify(await model.embedQuery(text));
}
