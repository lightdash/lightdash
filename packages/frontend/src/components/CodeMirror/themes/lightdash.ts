import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { EditorView } from '@codemirror/view';
import { tags } from '@lezer/highlight';

// Lightdash theme matching Monaco theme colors
const lightdashTheme = EditorView.theme(
    {
        '&': {
            color: '#333333',
            backgroundColor: '#FFFFFF',
        },
        '.cm-content': {
            caretColor: '#7262FF',
            fontFamily: 'monospace',
            fontSize: '12px',
        },
        '&.cm-focused .cm-cursor': {
            borderLeftColor: '#7262FF',
        },
        '&.cm-focused .cm-selectionBackground, ::selection': {
            backgroundColor: '#E6E3FF',
        },
        '.cm-activeLine': {
            backgroundColor: '#f8f8f8',
        },
        '.cm-selectionMatch': {
            backgroundColor: '#bcfeff',
        },
        '.cm-gutters': {
            backgroundColor: '#f5f5f5',
            color: '#999',
            border: 'none',
        },
        '.cm-activeLineGutter': {
            backgroundColor: '#e0e0e0',
        },
        '.cm-foldPlaceholder': {
            backgroundColor: 'transparent',
            border: 'none',
            color: '#7262FF',
        },
    },
    { dark: false },
);

const lightdashHighlightStyle = HighlightStyle.define([
    { tag: tags.keyword, color: '#7262FF', fontWeight: 'bold' },
    { tag: tags.operator, color: '#24cf62', fontWeight: 'bold' },
    { tag: tags.number, color: '#098658' },
    { tag: tags.string, color: '#A31515' },
    { tag: tags.comment, color: '#008000', fontStyle: 'italic' },
    { tag: tags.variableName, color: '#001080' },
    { tag: tags.typeName, color: '#001080' },
    { tag: tags.propertyName, color: '#001080' },
    { tag: tags.bool, color: '#7262FF' },
    { tag: tags.null, color: '#7262FF' },
    { tag: tags.bracket, color: '#333333' },
    { tag: tags.tagName, color: '#7262FF' },
    { tag: tags.attributeName, color: '#098658' },
]);

export const lightdashExtension = [
    lightdashTheme,
    syntaxHighlighting(lightdashHighlightStyle),
];
