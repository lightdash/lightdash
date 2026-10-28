export const MAX_ERROR_CHARACTERS = 1000;
const TRUNCATION_MARKER = '… [truncated]';

export const truncateQueryError = (
    message: string | null | undefined,
): string | null => {
    if (message == null) return null;
    if (message.length <= MAX_ERROR_CHARACTERS) return message;

    // Stop after the limit without splitting Unicode characters or copying the full error.
    const characters: string[] = [];
    for (const character of message) {
        if (characters.length === MAX_ERROR_CHARACTERS) {
            return (
                characters
                    .slice(0, MAX_ERROR_CHARACTERS - TRUNCATION_MARKER.length)
                    .join('') + TRUNCATION_MARKER
            );
        }
        characters.push(character);
    }
    return message;
};
