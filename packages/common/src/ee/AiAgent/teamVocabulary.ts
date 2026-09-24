/** Heading of the instruction block that holds definitions users saved from chat. */
export const TEAM_VOCABULARY_HEADER =
    "Team vocabulary (definitions this agent's users stated in chat; apply them when these words come up):";

const MAX_VOCABULARY_TEXT = 280;
const LINE_PREFIX = '- "';

/** One quoted line holding the user's own sentence, flattened so it cannot add structure to the prompt. */
export const toTeamVocabularyLine = (text: string): string =>
    `${LINE_PREFIX}${text
        .replace(/\s+/g, ' ')
        .replaceAll('"', "'")
        .trim()
        .slice(0, MAX_VOCABULARY_TEXT)}"`;

const linesOf = (instruction: string | null) =>
    instruction ? instruction.split('\n') : [];

export const hasTeamVocabularyLine = (
    instruction: string | null,
    text: string,
): boolean => linesOf(instruction).includes(toTeamVocabularyLine(text));

/** Appends the line under the Team vocabulary heading, creating the block when needed. */
export const addTeamVocabularyLine = (
    instruction: string | null,
    text: string,
): string => {
    const line = toTeamVocabularyLine(text);
    const lines = linesOf(instruction);
    if (lines.includes(line)) return instruction ?? '';
    const header = lines.indexOf(TEAM_VOCABULARY_HEADER);
    if (header === -1) {
        const base = (instruction ?? '').trimEnd();
        return [base || null, base ? '' : null, TEAM_VOCABULARY_HEADER, line]
            .filter((part): part is string => part !== null)
            .join('\n');
    }
    let end = header + 1;
    while (end < lines.length && lines[end].startsWith(LINE_PREFIX)) end += 1;
    return [...lines.slice(0, end), line, ...lines.slice(end)].join('\n');
};

/** Removes the line, and the heading once no saved definitions remain under it. */
export const removeTeamVocabularyLine = (
    instruction: string | null,
    text: string,
): string => {
    const line = toTeamVocabularyLine(text);
    const lines = linesOf(instruction).filter((current) => current !== line);
    const header = lines.indexOf(TEAM_VOCABULARY_HEADER);
    if (header !== -1 && !lines[header + 1]?.startsWith(LINE_PREFIX)) {
        lines.splice(header, 1);
        if (header > 0 && lines[header - 1] === '') lines.splice(header - 1, 1);
    }
    return lines.join('\n').trimEnd();
};
