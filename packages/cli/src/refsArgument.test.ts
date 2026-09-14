import { Command } from 'commander';
import { parseRefsArgument } from './refsArgument';

const buildCommand = () => {
    const command = new Command('upload')
        .exitOverride()
        .configureOutput({ writeErr: () => {} })
        .option('--force', 'force upload', false)
        .option('-c, --charts <charts...>', 'chart refs', parseRefsArgument, [])
        .option(
            '--chart-types <chartTypeReferences...>',
            'chart type refs',
            parseRefsArgument,
        );
    return command;
};

describe('parseRefsArgument', () => {
    it('rejects a bare flag followed by another option', () => {
        const command = buildCommand();
        expect(() =>
            command.parse(['--chart-types', '--force'], { from: 'user' }),
        ).toThrow(/argument '--force' is invalid/);
    });

    it('does not consume the following boolean flag as a value', () => {
        const command = buildCommand();
        command.parse(['--chart-types', 'one', 'two', '--force'], {
            from: 'user',
        });
        expect(command.opts().chartTypes).toEqual(['one', 'two']);
        expect(command.opts().force).toBe(true);
    });

    it('rejects option-like values on options with array defaults', () => {
        const command = buildCommand();
        expect(() =>
            command.parse(['--charts', '--force'], { from: 'user' }),
        ).toThrow(/argument '--force' is invalid/);
    });

    it('accumulates values onto the default array', () => {
        const command = buildCommand();
        command.parse(['-c', 'a', '-c', 'b'], { from: 'user' });
        expect(command.opts().charts).toEqual(['a', 'b']);
    });

    it('leaves unset options at their defaults', () => {
        const command = buildCommand();
        command.parse([], { from: 'user' });
        expect(command.opts().charts).toEqual([]);
        expect(command.opts().chartTypes).toBeUndefined();
    });
});
