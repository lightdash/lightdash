/**
 * Copied from `ee/features/agentOnboarding/utils.ts` (do not import from
 * `ee/` here): strips ANSI escape sequences and control characters other
 * than newline/tab so command output is safe to render as plain text.
 */
export const sanitizeTerminalText = (value: string): string => {
    const withoutAnsi = value.replace(
        new RegExp(`${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`, 'g'),
        '',
    );
    return Array.from(withoutAnsi)
        .filter((character) => {
            const code = character.charCodeAt(0);
            return character === '\n' || character === '\t' || code >= 32;
        })
        .join('');
};
