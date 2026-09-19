import { describe, expect, it } from 'vitest';
import { activeCommandFromError, parseCommand } from './parseCommand';

describe('parseCommand', () => {
    it('splits tool, subcommand and args', () => {
        expect(parseCommand('lightdash deploy --select orders')).toEqual({
            tool: 'lightdash',
            subcommand: 'deploy',
            args: ['--select', 'orders'],
        });
    });
    it('groups double-quoted args and trims', () => {
        expect(parseCommand('  dbt ls --select "orders customers" ')).toEqual({
            tool: 'dbt',
            subcommand: 'ls',
            args: ['--select', 'orders customers'],
        });
    });
    it('rejects an unknown tool and a missing subcommand', () => {
        expect(parseCommand('bash -c x')).toEqual({
            error: 'Commands start with lightdash or dbt',
        });
        expect(parseCommand('dbt')).toEqual({
            error: 'Type a subcommand, for example: dbt parse',
        });
        expect(parseCommand('')).toEqual({
            error: 'Type a subcommand, for example: dbt parse',
        });
    });
});
describe('activeCommandFromError', () => {
    it('refuses a subcommand the terminal does not run, with the server\'s words', () => {
        expect(parseCommand('lightdash depl')).toEqual({
            error: 'That command is not available in the Learn terminal',
        });
        expect(parseCommand('dbt run')).toEqual({
            error: 'That command is not available in the Learn terminal',
        });
    });

    it('extracts the uuid from the 409 message', () => {
        expect(
            activeCommandFromError(
                'A command is already running in this workspace (command 4f1a2c6e-0d4b-4d4a-9a3c-1f0a2b3c4d5e)',
            ),
        ).toBe('4f1a2c6e-0d4b-4d4a-9a3c-1f0a2b3c4d5e');
        expect(activeCommandFromError('nope')).toBeNull();
    });
});
