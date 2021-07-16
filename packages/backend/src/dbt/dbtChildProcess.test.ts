import execa from 'execa';
import { DbtChildProcess } from './dbtChildProcess';
import { DbtError } from '../errors';
import {
    childProcessWithSuccessEvent,
    childProcessWithDoubleLogEvent,
    childProcessWithExitEvent,
    childProcessWithUnexpectedEvent,
} from './dbtChildProcess.mock';

const execaMock = execa as unknown as jest.Mock<typeof execa>;

jest.mock('execa', () => jest.fn(() => childProcessWithSuccessEvent));

describe('DbtChildProcess', () => {
    it('should handle success event', async () => {
        // @ts-ignore
        execaMock.mockImplementation(() => childProcessWithSuccessEvent);

        const process = new DbtChildProcess('', '', 80);

        await expect(process.restart()).resolves.toEqual(undefined);
        expect(process.isProcessLive()).toBe(true);
    });
    it('should kill process on second restart', async () => {
        // @ts-ignore
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
        const process = new DbtChildProcess('', '', 80);
        // start process
        await process.restart();
        // kills & start process
        await process.restart();
        expect(childProcessWithSuccessEvent.kill).toBeCalledTimes(1);
        expect(childProcessWithSuccessEvent.kill).toBeCalledWith(15);
        expect(process.isProcessLive()).toBe(true);
    });
    it('should handle event with 2 logs', async () => {
        // @ts-ignore
        execaMock.mockImplementation(() => childProcessWithDoubleLogEvent);

        const process = new DbtChildProcess('', '', 80);

        await expect(process.restart()).resolves.toEqual(undefined);
        expect(process.latestErrorMessage()).toBe(
            `Dbt server exited with an error:\nlog1`,
        );
    });
    it('should handle exit event', async () => {
        // @ts-ignore
        execaMock.mockImplementation(() => childProcessWithExitEvent);

        const process = new DbtChildProcess('', '', 80);

        await expect(process.restart()).rejects.toThrowError(DbtError);
    });
    it('should handle parsing error', async () => {
        // @ts-ignore
        execaMock.mockImplementation(() => childProcessWithUnexpectedEvent);

        const process = new DbtChildProcess('', '', 80);

        await expect(process.restart()).rejects.toThrowError(DbtError);
    });
});
