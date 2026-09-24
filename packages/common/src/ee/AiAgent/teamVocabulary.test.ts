import {
    addTeamVocabularyLine,
    hasTeamVocabularyLine,
    removeTeamVocabularyLine,
    TEAM_VOCABULARY_HEADER,
    toTeamVocabularyLine,
} from './teamVocabulary';

describe('team vocabulary', () => {
    const sentence = 'when we say "active" we mean\nnon-partner customers';

    it('flattens the sentence into one quoted line', () => {
        expect(toTeamVocabularyLine(sentence)).toBe(
            `- "when we say 'active' we mean non-partner customers"`,
        );
    });

    it('creates the block after existing instructions', () => {
        expect(addTeamVocabularyLine('Be concise.', sentence)).toBe(
            [
                'Be concise.',
                '',
                TEAM_VOCABULARY_HEADER,
                toTeamVocabularyLine(sentence),
            ].join('\n'),
        );
        expect(addTeamVocabularyLine(null, sentence)).toBe(
            [TEAM_VOCABULARY_HEADER, toTeamVocabularyLine(sentence)].join('\n'),
        );
    });

    it('appends inside the block and never duplicates a line', () => {
        const once = addTeamVocabularyLine('Be concise.', sentence);
        const twice = addTeamVocabularyLine(
            `${once}\n\nAlways cite sources.`,
            'territory means region',
        );
        expect(twice.split('\n')).toEqual([
            'Be concise.',
            '',
            TEAM_VOCABULARY_HEADER,
            toTeamVocabularyLine(sentence),
            toTeamVocabularyLine('territory means region'),
            '',
            'Always cite sources.',
        ]);
        expect(addTeamVocabularyLine(twice, sentence)).toBe(twice);
        expect(hasTeamVocabularyLine(twice, sentence)).toBe(true);
    });

    it('removes the heading with its last line and restores the instructions', () => {
        const saved = addTeamVocabularyLine('Be concise.', sentence);
        expect(removeTeamVocabularyLine(saved, sentence)).toBe('Be concise.');
        expect(hasTeamVocabularyLine('Be concise.', sentence)).toBe(false);
    });
});
