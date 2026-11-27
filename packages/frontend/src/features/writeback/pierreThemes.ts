import { registerCustomTheme, resolveThemes } from '@pierre/diffs';

type Palette = {
    type: 'light' | 'dark';
    background: string;
    text: string;
    quiet: string;
    key: string;
    string: string;
    value: string;
    keyword: string;
    call: string;
    template: string;
    added: string;
    removed: string;
    changed: string;
    selection: string;
    activeLine: string;
};

// Names are the app's violet, since a model is mostly names; what is typed for them is teal, and literal values amber
const LIGHT: Palette = {
    type: 'light',
    background: '#ffffff',
    text: '#1f2328',
    quiet: '#6e7781',
    key: '#6532d9',
    string: '#0f766e',
    value: '#a8500a',
    keyword: '#1d5fd6',
    call: '#0b6a9c',
    template: '#b4246b',
    added: '#18a46c',
    removed: '#d52c36',
    changed: '#7262ff',
    selection: '#7262ff2e',
    activeLine: '#7262ff12',
};

const DARK: Palette = {
    type: 'dark',
    background: '#0a0a0a',
    text: '#ececec',
    quiet: '#8b949e',
    key: '#b3a4ff',
    string: '#6fd3c1',
    value: '#f0b26b',
    keyword: '#7fb0ff',
    call: '#7cc9ee',
    template: '#f08cc0',
    added: '#07c480',
    removed: '#ff5c6a',
    changed: '#9d8fff',
    selection: '#9d8fff4d',
    activeLine: '#9d8fff1f',
};

const themeOf = (name: string, palette: Palette) => ({
    name,
    type: palette.type,
    colors: {
        'editor.background': palette.background,
        'editor.foreground': palette.text,
        'editor.selectionBackground': palette.selection,
        'editor.lineHighlightBackground': palette.activeLine,
        'editorCursor.foreground': palette.changed,
        'editorLineNumber.foreground': palette.quiet,
        'editorLineNumber.activeForeground': palette.text,
        'diffEditor.insertedTextBackground': `${palette.added}33`,
        'diffEditor.deletedTextBackground': `${palette.removed}33`,
        'gitDecoration.addedResourceForeground': palette.added,
        'gitDecoration.untrackedResourceForeground': palette.added,
        'gitDecoration.modifiedResourceForeground': palette.changed,
        'gitDecoration.deletedResourceForeground': palette.removed,
        'gitDecoration.conflictingResourceForeground': palette.template,
        'gitDecoration.ignoredResourceForeground': palette.quiet,
    },
    tokenColors: [
        {
            scope: ['comment', 'punctuation.definition.comment'],
            settings: { foreground: palette.quiet, fontStyle: 'italic' },
        },
        {
            scope: ['punctuation', 'meta.brace', 'keyword.operator'],
            settings: { foreground: palette.quiet },
        },
        {
            scope: [
                'entity.name.tag',
                'support.type.property-name',
                'meta.object-literal.key',
                'variable.other.member',
            ],
            settings: { foreground: palette.key },
        },
        {
            scope: ['string', 'string.unquoted', 'markup.inline.raw'],
            settings: { foreground: palette.string },
        },
        {
            scope: [
                'constant.numeric',
                'constant.language',
                'constant.other',
                'support.constant',
            ],
            settings: { foreground: palette.value },
        },
        {
            scope: ['keyword', 'storage', 'keyword.other'],
            settings: { foreground: palette.keyword },
        },
        {
            scope: ['entity.name.function', 'support.function', 'support.type'],
            settings: { foreground: palette.call },
        },
        {
            scope: [
                'variable.other.jinja',
                'meta.embedded',
                'punctuation.definition.template-expression',
                'punctuation.section.embedded',
                'constant.character.escape',
                'entity.name.type.anchor',
                'variable.other.alias',
            ],
            settings: { foreground: palette.template },
        },
        {
            scope: ['markup.heading', 'entity.name.section'],
            settings: { foreground: palette.key, fontStyle: 'bold' },
        },
        { scope: 'markup.bold', settings: { fontStyle: 'bold' } },
        { scope: 'markup.italic', settings: { fontStyle: 'italic' } },
        {
            scope: ['markup.inserted'],
            settings: { foreground: palette.added },
        },
        {
            scope: ['markup.deleted'],
            settings: { foreground: palette.removed },
        },
    ],
});

export const STUDIO_THEMES = {
    light: 'studio-light',
    dark: 'studio-dark',
} as const;

registerCustomTheme(STUDIO_THEMES.light, () =>
    Promise.resolve(themeOf(STUDIO_THEMES.light, LIGHT)),
);
registerCustomTheme(STUDIO_THEMES.dark, () =>
    Promise.resolve(themeOf(STUDIO_THEMES.dark, DARK)),
);

// Read before the first editor mounts: a pool that starts without them falls back to themes it was never given
void resolveThemes([STUDIO_THEMES.light, STUDIO_THEMES.dark]);
