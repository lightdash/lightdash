import execa from 'execa';
import { DbtError } from '../errors';
import { DbtChildProcess } from './dbtChildProcess';
import {
    childProcessWithDoubleLogEvent,
    childProcessWithExitEvent,
    childProcessWithSuccessEvent,
    childProcessWithUnexpectedEvent,
} from './dbtChildProcess.mock';

const execaMock = execa as unknown as jest.Mock<typeof execa>;

jest.mock('execa', () => jest.fn(() => childProcessWithSuccessEvent));

describe('DbtChildProcess', () => {
    it('should handle success event', async () => {
        execaMock.mockImplementation(() => childProcessWithSuccessEvent);

        const process = new DbtChildProcess('', '', 80, undefined);

        await expect(process.restart()).resolves.toEqual(undefined);
        expect(process.isProcessLive()).toBe(true);
    });
    it('should kill process on second restart', async () => {
        execaMock.mockImplementation(() => ({
            ...childProcessWithSuccessEvent,
            on: jest
                .fn()
                .mockImplementationOnce(() => undefined) // ignore first exit
                .mockImplementationOnce((_: string, callback: () => void) =>
                    callback(),
                ) // trigger second exit
                .mockImplementation(() => undefined), // ignore rest
        }));
        const process = new DbtChildProcess('', '', 80, undefined);
        // start process
        await process.restart();
        // kills & start process
        await process.restart();
        expect(childProcessWithSuccessEvent.kill).toBeCalledTimes(1);
        expect(childProcessWithSuccessEvent.kill).toBeCalledWith(15);
        expect(process.isProcessLive()).toBe(true);
    });
    it('should handle event with 2 logs', async () => {
        execaMock.mockImplementation(() => childProcessWithDoubleLogEvent);

        const process = new DbtChildProcess('', '', 80, undefined);

        await expect(process.restart()).resolves.toEqual(undefined);
        expect(process.latestErrorMessage()).toBe(
            `Dbt server exited with an error:\nlog1`,
        );
    });
    it('should handle exit event', async () => {
        execaMock.mockImplementation(() => childProcessWithExitEvent);

        const process = new DbtChildProcess('', '', 80, undefined);

        await expect(process.restart()).rejects.toThrowError(DbtError);
    });
    it('should handle parsing error', async () => {
        execaMock.mockImplementation(() => childProcessWithUnexpectedEvent);

        const process = new DbtChildProcess('', '', 80, undefined);

        await expect(process.restart()).rejects.toThrowError(DbtError);
    });
    describe('dbt rpc arguments', () => {
        beforeEach(() => {
            execaMock.mockClear();
        });
        it('should set required arguments', async () => {
            const mock = execaMock.mockImplementation(
                () => childProcessWithSuccessEvent,
            );

            const process = new DbtChildProcess(
                'myProjectDir',
                'myProfileDir',
                90,
                undefined,
            );
            await process.restart();

            expect(mock).toBeCalledTimes(1);
            expect(mock).toBeCalledWith(
                'dbt',
                [
                    'rpc',
                    '--host',
                    'localhost',
                    '--port',
                    '90',
                    '--profiles-dir',
                    'myProfileDir',
                    '--project-dir',
                    'myProjectDir',
                ],
                expect.anything(),
            );
        });
        it('should set target argument when available', async () => {
            const mock = execaMock.mockImplementation(
                () => childProcessWithSuccessEvent,
            );

            const process = new DbtChildProcess('', '', 80, 'prod');
            await process.restart();

            expect(mock).toBeCalledTimes(1);
            expect(mock).toBeCalledWith(
                'dbt',
                expect.arrayContaining(['--target', 'prod']),
                expect.anything(),
            );
        });
    });
});
