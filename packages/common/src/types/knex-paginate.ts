export interface IKnexPaginateArgs {
    pageSize: number;
    page: number;
}

//! This is type helper type to unwrap the value of a the QueryBuilder result - copied from the Awaited type in TS but returning V instead of Awaited<V>
type KnexQueryBuilderResult<T> = T extends null | undefined
    ? T
    : T extends object & { then(onfulfilled: infer F, ...args: infer _): any } // `await` only unwraps object types with a callable `then`. Non-object types are not unwrapped
    ? F extends (value: infer V, ...args: infer __) => any // if the argument to `then` is callable, extracts the first argument
        ? V // recursively unwrap the value
        : never // the argument to `then` was not callable
    : T; // non-object or non-thenable

export interface IKnexPaginatedData<T> {
    data: KnexQueryBuilderResult<T>;
    pagination?: IKnexPaginateArgs & {
        totalPageCount: number;
    };
}
