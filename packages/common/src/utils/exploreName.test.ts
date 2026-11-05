import { getPreAggregateExploreName } from '../ee/preAggregates/naming';
import { boundExploreName } from './exploreName';

it.each(['orders', 'finance__orders', 'm'.repeat(255)])(
    'preserves existing name %s',
    (name) => {
        expect(boundExploreName(name)).toBe(name);
    },
);

it('bounds names without losing the distinction after the retained prefix', () => {
    const prefix = 'm'.repeat(250);
    const first = boundExploreName(`finance__${prefix}`);
    expect(first).toHaveLength(255);
    expect(first).toBe(boundExploreName(`finance__${prefix}`));
    expect(boundExploreName(first)).toBe(first);
    expect(first).not.toBe(boundExploreName(`finance__${prefix}2`));
    expect(first).toMatch(/__[a-f0-9]{8}$/);
});

it('uses the same bounded pre-aggregate name for generation and query lookup', () => {
    expect(getPreAggregateExploreName('orders', 'daily')).toBe(
        '__preagg__orders__daily',
    );
    expect(getPreAggregateExploreName('m'.repeat(250), 'daily')).toHaveLength(
        255,
    );
});

it('counts Unicode characters without renaming a valid existing name', () => {
    const name = '😀'.repeat(255);
    expect(boundExploreName(name)).toBe(name);
    expect(Array.from(boundExploreName(`${name}a`))).toHaveLength(255);
    expect(boundExploreName(`${name}a`)).toMatch(/__[0-9a-f]{8}$/);
});
