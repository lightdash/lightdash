export type ApiSuccessEmpty = {
    status: 'ok';
    results: undefined;
};

export type ApiSuccess<T> = {
    status: 'ok';
    results: T;
};
