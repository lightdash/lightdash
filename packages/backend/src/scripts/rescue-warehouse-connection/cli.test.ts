import { parseRescueArguments } from './cli';

const project = '5b8d7a3e-8e8a-4a55-9d0c-1f2b3c4d5e6f';
const connection = '6c9e8b4f-9f9b-4b66-8e1d-2a3b4c5d6e7f';

describe('parseRescueArguments', () => {
    test('is a dry run unless --execute is given', () => {
        const args = [
            '--project',
            project,
            '--connection',
            connection,
            '--engineer',
            'engineer@example.com',
            '--ticket',
            'SPK-0000',
        ];
        expect(parseRescueArguments(args)).toEqual({
            projectUuid: project,
            warehouseConnectionUuid: connection,
            engineer: 'engineer@example.com',
            ticket: 'SPK-0000',
            execute: false,
        });
        expect(parseRescueArguments([...args, '--execute']).execute).toBe(true);
    });

    test.each([
        [
            ['--connection', connection, '--engineer', 'e', '--ticket', 't'],
            '--project must be a project uuid',
        ],
        [
            [
                '--project',
                'nope',
                '--connection',
                connection,
                '--engineer',
                'e',
                '--ticket',
                't',
            ],
            '--project must be a project uuid',
        ],
        [
            ['--project', project, '--engineer', 'e', '--ticket', 't'],
            '--connection must be a warehouse connection uuid',
        ],
        [
            ['--project', project, '--connection', connection, '--ticket', 't'],
            '--engineer and --ticket are required',
        ],
        [
            [
                '--project',
                project,
                '--connection',
                connection,
                '--engineer',
                '--ticket',
                't',
            ],
            '--engineer needs a value',
        ],
        [
            [
                '--project',
                project,
                '--connection',
                connection,
                '--engineer',
                'e',
                '--ticket',
                't',
                '--force',
            ],
            'Unknown argument: --force',
        ],
    ])('refuses %j', (argv, message) => {
        expect(() => parseRescueArguments(argv)).toThrow(message);
    });
});
