import { FUNCTION_DEFINITIONS } from '@lightdash/formula';
import type { Monaco } from '@monaco-editor/react';
import type { languages } from 'monaco-editor';

export const FORMULA_LANGUAGE_ID = 'lightdashFormula';

const functionNames = FUNCTION_DEFINITIONS.map((fn) => fn.name);

// Reserved words in the Peggy grammar that aren't function names:
// boolean literals, logical operators, and window clause keywords.
const grammarKeywords = [
    'AND',
    'OR',
    'NOT',
    'TRUE',
    'FALSE',
    'ORDER',
    'BY',
    'PARTITION',
    'ASC',
    'DESC',
];

export const formulaLanguage: languages.IMonarchLanguage = {
    ignoreCase: true,
    keywords: [...functionNames, ...grammarKeywords],
    tokenizer: {
        root: [
            [/"([^"\\]|\\.)*"/, 'string'],
            [/'([^'\\]|\\.)*'/, 'string'],
            [/\d+(\.\d+)?/, 'number'],
            [/[<>]=?|<>|[+\-*/%^=]/, 'operator'],
            [/[(),]/, 'delimiter'],
            [
                /[A-Za-z_][A-Za-z0-9_]*/,
                {
                    cases: {
                        '@keywords': 'keyword',
                        '@default': 'identifier',
                    },
                },
            ],
            [/\s+/, 'white'],
        ],
    },
};

const formulaLanguageConfiguration: languages.LanguageConfiguration = {
    brackets: [['(', ')']],
    autoClosingPairs: [
        { open: '(', close: ')' },
        { open: '"', close: '"' },
        { open: "'", close: "'" },
    ],
    surroundingPairs: [
        { open: '(', close: ')' },
        { open: '"', close: '"' },
        { open: "'", close: "'" },
    ],
};

export function registerFormulaLanguage(monaco: Monaco): void {
    const alreadyRegistered = monaco.languages
        .getLanguages()
        .some((l) => l.id === FORMULA_LANGUAGE_ID);
    if (alreadyRegistered) return;

    monaco.languages.register({ id: FORMULA_LANGUAGE_ID });
    monaco.languages.setMonarchTokensProvider(
        FORMULA_LANGUAGE_ID,
        formulaLanguage,
    );
    monaco.languages.setLanguageConfiguration(
        FORMULA_LANGUAGE_ID,
        formulaLanguageConfiguration,
    );
}
