async function getmodel() {
    // Need to use a dynamic import here to avoid problems when running knex commands
    const { HuggingFaceTransformersEmbeddings } = await import(
        '@langchain/community/embeddings/hf_transformers'
    );

    return new HuggingFaceTransformersEmbeddings({
        modelName: 'Xenova/all-MiniLM-L6-v2', // check whether this is good for our use case (semantic search)
    });
}

export async function embedText(text: string) {
    const model = await getmodel();
    return JSON.stringify(await model.embedQuery(text));
}
