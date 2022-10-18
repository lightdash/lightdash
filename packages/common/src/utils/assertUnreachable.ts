const assertUnreachable = (
    _x: never,
    error: string = "Didn't expect to get here",
): never => {
    throw new Error(error);
};

export default assertUnreachable;
