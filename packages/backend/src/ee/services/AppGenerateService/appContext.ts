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

// Agents (and older scaffold docs) still look for the single file — land them
// on directions instead. Old CLIs write only this file, hence the upgrade hint.
export const SEMANTIC_LAYER_POINTER_FILE = contextFile(
    'semantic-layer.yml',
    [
        '# The semantic layer is sharded across one YAML file per model in models/.',
        '# Start with models/_index.md, then read only the model files you need.',
        '# If models/ is missing, this app was downloaded with an older Lightdash CLI —',
        '# upgrade the CLI and re-run `lightdash download` to fetch the model files.',
        '',
    ].join('\n'),
);

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
