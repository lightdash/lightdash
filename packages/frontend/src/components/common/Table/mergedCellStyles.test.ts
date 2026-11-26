import { readFileSync } from 'fs';
import { resolve } from 'path';
import postcss, { type Rule } from 'postcss';
import { describe, expect, it } from 'vitest';

// The tests do not load CSS, so they read the rules from the CSS modules. A
// merged value must not grow its rows: the line clamp and the merged cell
// padding make the line count in getMergedValueLineClamp true.
const declarationsOf = (file: string, selector: string) => {
    const root = postcss.parse(readFileSync(resolve(__dirname, file), 'utf8'));
    const declarations: Record<string, string> = {};
    root.walkRules((rule: Rule) => {
        if (rule.selector !== selector) return;
        rule.walkDecls((declaration) => {
            declarations[declaration.prop] = declaration.important
                ? `${declaration.value} !important`
                : declaration.value;
        });
    });
    return declarations;
};

describe('results table merged cells', () => {
    const file = './ScrollableTable/BodyCell.module.css';

    it('have no bottom padding, whatever the order the CSS loads in', () => {
        expect(declarationsOf(file, 'td.mergedDimCell')).toEqual({
            'vertical-align': 'top',
            'padding-bottom': '0 !important',
        });
    });

    it('clamp the value to the line count', () => {
        expect(declarationsOf(file, '.mergedDimValue')).toMatchObject({
            display: '-webkit-box',
            '-webkit-box-orient': 'vertical',
            '-webkit-line-clamp': 'var(--merged-line-clamp)',
            overflow: 'hidden',
        });
    });
});

describe('pivot table merged cells', () => {
    it('have 8px top padding and no bottom padding', () => {
        expect(
            declarationsOf(
                '../PivotTable/PivotTable.module.css',
                'td.mergedDimCell',
            ),
        ).toEqual({
            'vertical-align': 'top',
            'padding-top': '8px',
            'padding-bottom': '0',
        });
    });

    it('clamp the value to the line count', () => {
        expect(
            declarationsOf('../LightTable/styles.module.css', '.withLineClamp'),
        ).toMatchObject({
            display: '-webkit-box',
            '-webkit-box-orient': 'vertical',
            '-webkit-line-clamp': 'var(--lt-line-clamp)',
            overflow: 'hidden',
        });
    });
});
