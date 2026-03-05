/**
 * Maps file extensions to Monaco editor language IDs
 */
const EXTENSION_TO_LANGUAGE: Record<string, string> = {
    // YAML
    yml: 'yaml',
    yaml: 'yaml',
    // SQL
    sql: 'sql',
    // Markdown
    md: 'markdown',
    markdown: 'markdown',
    // JSON
    json: 'json',
    // Python
    py: 'python',
    // JavaScript/TypeScript
    js: 'javascript',
    ts: 'typescript',
    jsx: 'javascript',
    tsx: 'typescript',
    // Shell
    sh: 'shell',
    bash: 'shell',
    // Text/Other
    txt: 'plaintext',
    csv: 'plaintext',
};

/**
 * Detects the Monaco language ID based on file path/name
 * @param filePath - The full path or filename
 * @returns Monaco language ID
 */
export const detectLanguage = (filePath: string): string => {
    // Extract the file extension
    const fileName = filePath.split('/').pop() ?? filePath;
    const extension = fileName.split('.').pop()?.toLowerCase() ?? '';

    // Special case for dbt-specific files
    if (fileName === 'dbt_project.yml' || fileName === 'packages.yml') {
        return 'yaml';
    }

    return EXTENSION_TO_LANGUAGE[extension] ?? 'plaintext';
};
