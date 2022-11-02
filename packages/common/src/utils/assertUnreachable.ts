const assertUnreachable = (
    _x: never,
    error: string | Error = "Didn't expect to get here",
): never => {
    if (typeof error === 'string') {
        throw Error(error);
    } else {
        throw error;
    }
};

export default assertUnreachable;
