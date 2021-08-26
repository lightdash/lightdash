const successLog = {
    message: 'Send requests to ',
};

const infoLog = {
    levelname: 'INFO',
    message: 'log1',
};

const errorLog = {
    levelname: 'ERROR',
    message: 'log1',
};

const childProcessBaseMock: any = {
    kill: jest.fn(),
    on: jest.fn(),
    stdout: {
        on: jest.fn(),
    },
};

export const childProcessWithExitEvent = {
    ...childProcessBaseMock,
    on: (_: string, callback: () => void) => callback(),
};

export const childProcessWithSuccessEvent = {
    ...childProcessBaseMock,
    stdout: {
        on: (_: string, callback: (data: string) => void) =>
            callback(JSON.stringify(successLog)),
    },
};

export const childProcessWithDoubleLogEvent = {
    ...childProcessBaseMock,
    stdout: {
        on: (_: string, callback: (data: string) => void) =>
            callback(
                `${JSON.stringify(infoLog)}\n${JSON.stringify(
                    errorLog,
                )}\n${JSON.stringify(successLog)}`,
            ),
    },
};

export const childProcessWithUnexpectedEvent = {
    ...childProcessBaseMock,
    stdout: {
        on: (_: string, callback: (data: string) => void) =>
            callback('not a json object'),
    },
};
