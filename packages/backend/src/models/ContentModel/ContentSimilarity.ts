export const SIMILARITY_IGNORED_WORDS = [
    'a',
    'an',
    'and',
    'are',
    'as',
    'at',
    'be',
    'by',
    'for',
    'from',
    'how',
    'in',
    'is',
    'it',
    'of',
    'on',
    'or',
    'our',
    'the',
    'to',
    'we',
    'what',
    'with',
    'chart',
    'dashboard',
    'report',
    'copy',
    'daily',
    'weekly',
    'monthly',
    'quarterly',
    'yearly',
];

export const getSimilarityNameWords = (name: string): string[] =>
    [
        ...new Set(
            name
                .normalize('NFKC')
                .toLowerCase()
                .split(/[^\p{L}\p{N}]+/u),
        ),
    ].filter(
        (word) => word.length > 1 && !SIMILARITY_IGNORED_WORDS.includes(word),
    );
