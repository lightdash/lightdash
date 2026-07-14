import { type DataAppContextFile } from '@lightdash/common';

export const CONTEXT_PREFIX = '.lightdash/context/';

export const contextFile = (
    relPath: string,
    content: string | Buffer,
): DataAppContextFile => ({
    path: `${CONTEXT_PREFIX}${relPath}`,
    contentBase64: Buffer.isBuffer(content)
        ? content.toString('base64')
        : Buffer.from(content, 'utf-8').toString('base64'),
});

export const promptHistoryToMarkdown = (
    versions: { version: number; prompt: string; createdAt: string }[],
): string => {
    const sorted = [...versions].sort((a, b) => b.version - a.version);
    const body = sorted
        .map(
            (v) =>
                `## Version ${v.version} — ${v.createdAt}\n\n${v.prompt.trim() || '_(no prompt)_'}`,
        )
        .join('\n\n');
    return `# Prompt history\n\nThe prompts used to generate each version of this app, newest first.\n\n${body}\n`;
};
