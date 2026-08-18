/**
 * Streaming JSONL over the data plane. Rows are yielded as each newline
 * lands, so a million-row dataset flows fetch -> consumer with one line in
 * memory at a time. Sources without a streaming body (test shims, exotic
 * fetch polyfills) fall back to a buffered read of the same contract.
 */
type JsonlSource = {
    body?: ReadableStream<Uint8Array> | null;
    text: () => Promise<string>;
};
export declare function jsonlRows(source: JsonlSource): AsyncGenerator<Record<string, unknown>>;
export {};
//# sourceMappingURL=jsonl.d.ts.map