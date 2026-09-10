import fs from 'fs/promises';
import path from 'path';
import { type PlaygroundContent } from './playgroundContentTypes';

/** Read content without reopening or validating the shared warehouse. */
export const loadPlaygroundContent = async (
    dataDirectory: string,
): Promise<PlaygroundContent> => {
    const contentJson = await fs.readFile(
        path.join(dataDirectory, 'content.json'),
        'utf8',
    );
    let content: unknown;
    try {
        content = JSON.parse(contentJson);
    } catch (error) {
        throw new Error('Playground bundle contains invalid JSON', {
            cause: error,
        });
    }
    if (
        !content ||
        typeof content !== 'object' ||
        !('version' in content) ||
        content.version !== 1 ||
        !('space' in content) ||
        !content.space ||
        typeof content.space !== 'object' ||
        !('name' in content.space) ||
        typeof content.space.name !== 'string' ||
        !('path' in content.space) ||
        typeof content.space.path !== 'string' ||
        !('charts' in content) ||
        !Array.isArray(content.charts) ||
        !('dashboard' in content) ||
        !content.dashboard ||
        typeof content.dashboard !== 'object'
    ) {
        throw new Error('Playground content bundle is invalid');
    }
    return content as PlaygroundContent;
};
