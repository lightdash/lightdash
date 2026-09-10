import inquirer from 'inquirer';
import autocompletePrompt from 'inquirer-autocomplete-prompt';

const PROMPT_TYPE = 'autocomplete';

let registered = false;
const registerPrompt = () => {
    if (registered) return;
    inquirer.registerPrompt(PROMPT_TYPE, autocompletePrompt);
    registered = true;
};

export type FuzzyChoice<T> = {
    name: string;
    value: T;
};

type ScoredChoice<T> = {
    choice: FuzzyChoice<T>;
    score: number;
};

/**
 * Scores a choice against a search term. Returns null when it doesn't match.
 * Lower scores rank higher: exact prefix beats substring beats subsequence.
 */
const scoreChoice = (name: string, search: string): number | null => {
    const haystack = name.toLowerCase();
    const needle = search.toLowerCase();

    if (needle.length === 0) return 0;

    const index = haystack.indexOf(needle);
    if (index === 0) return 0;
    if (index > 0) return 1000 + index;

    // Subsequence match: characters appear in order but not contiguously.
    let cursor = 0;
    let firstMatch = -1;
    let gaps = 0;
    for (const char of needle) {
        const found = haystack.indexOf(char, cursor);
        if (found === -1) return null;
        if (firstMatch === -1) firstMatch = found;
        else gaps += found - cursor;
        cursor = found + 1;
    }
    return 100000 + gaps + firstMatch;
};

/**
 * Filters and ranks choices by a search term. Every whitespace-separated token
 * must match, so "prod eu" narrows to names containing both.
 */
export const fuzzyFilterChoices = <T>(
    choices: FuzzyChoice<T>[],
    search: string,
): FuzzyChoice<T>[] => {
    const tokens = search.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return choices;

    return (
        choices
            .reduce<ScoredChoice<T>[]>((acc, choice) => {
                let total = 0;
                for (const token of tokens) {
                    const score = scoreChoice(choice.name, token);
                    if (score === null) return acc;
                    total += score;
                }
                acc.push({ choice, score: total });
                return acc;
            }, [])
            // Array#sort is stable, so equally-scored choices keep their order.
            .sort((a, b) => a.score - b.score)
            .map(({ choice }) => choice)
    );
};

/**
 * A list prompt you can type into to narrow down the options.
 * `pinnedChoices` are shown at the top while nothing has been typed.
 */
export const promptFuzzySearch = async <T>({
    message,
    choices,
    pinnedChoices = [],
}: {
    message: string;
    choices: FuzzyChoice<T>[];
    pinnedChoices?: FuzzyChoice<T>[];
}): Promise<T> => {
    registerPrompt();
    const { answer } = await inquirer.prompt<{ answer: T }>([
        {
            type: PROMPT_TYPE,
            name: 'answer',
            message,
            emptyText: 'No matches',
            // inquirer-autocomplete-prompt passes `undefined` on first render.
            source: (_answersSoFar: unknown, search: string | undefined) => {
                const term = search ?? '';
                return Promise.resolve([
                    ...(term.trim() === '' ? pinnedChoices : []),
                    ...fuzzyFilterChoices(choices, term),
                ]);
            },
        },
    ]);
    return answer;
};
