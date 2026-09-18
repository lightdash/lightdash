import { parseArguments } from './cli';

describe('parseArguments', () => {
    test('parses dry-run and resume options', () => {
        expect(parseArguments(['--dry-run', '--from-id', '41'])).toEqual({
            dryRun: true,
            fromId: 41,
        });
    });

    test('rejects an invalid from-id', () => {
        expect(() => parseArguments(['--from-id', '-1'])).toThrow(
            '--from-id must be a non-negative integer',
        );
    });
});
