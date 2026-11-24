import { parentPort } from 'worker_threads';
import zlib from 'zlib';
import { buildResultsPageRowsJson } from './buildResultsPageRows';
import type {
    ResultsPageWorkerRequest,
    ResultsPageWorkerResponse,
} from './resultsPageWorkerProtocol';

const ownsWholeBuffer = (bytes: Uint8Array) =>
    bytes.byteOffset === 0 && bytes.buffer.byteLength === bytes.byteLength;

const transferable = (bytes: Uint8Array): Uint8Array =>
    ownsWholeBuffer(bytes) ? bytes : new Uint8Array(bytes);

const build = ({
    id,
    lines,
    format,
    brotliQuality,
}: ResultsPageWorkerRequest): ResultsPageWorkerResponse => {
    const rows = transferable(
        Buffer.from(buildResultsPageRowsJson(lines, format)),
    );
    const compressed = transferable(
        zlib.brotliCompressSync(rows, {
            params: {
                [zlib.constants.BROTLI_PARAM_QUALITY]: brotliQuality,
                [zlib.constants.BROTLI_PARAM_SIZE_HINT]: rows.byteLength,
            },
        }),
    );
    return { id, ok: true, rows, compressed, rowCount: lines.length };
};

parentPort?.on('message', (request: ResultsPageWorkerRequest) => {
    let response: ResultsPageWorkerResponse;
    try {
        response = build(request);
    } catch (error) {
        response = {
            id: request.id,
            ok: false,
            message: error instanceof Error ? error.message : String(error),
        };
    }
    parentPort?.postMessage(
        response,
        response.ok
            ? [
                  response.rows.buffer as ArrayBuffer,
                  response.compressed.buffer as ArrayBuffer,
              ]
            : [],
    );
});
