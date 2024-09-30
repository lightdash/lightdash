const assertUnreachable = (_x: never, error: string | Error): never => {
    if (typeof error === 'string') {
        throw Error(error);
    } else {
        throw error;
    }
};

export default assertUnreachable;
