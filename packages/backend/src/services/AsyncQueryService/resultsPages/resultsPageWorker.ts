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

const post = (response: ResultsPageWorkerResponse, transfer: Uint8Array[]) => {
    parentPort?.postMessage(
        response,
        transfer.map((bytes) => bytes.buffer as ArrayBuffer),
    );
};

const build = ({
    id,
    lines,
    format,
    brotliQuality,
}: ResultsPageWorkerRequest) => {
    const json = buildResultsPageRowsJson(lines, format);
    const rows = transferable(Buffer.from(json));
    const rawLength = rows.byteLength;
    post({ id, ok: true, phase: 'rows', rows, rowCount: lines.length }, [rows]);
    const compressed = transferable(
        zlib.brotliCompressSync(json, {
            params: {
                [zlib.constants.BROTLI_PARAM_QUALITY]: brotliQuality,
                [zlib.constants.BROTLI_PARAM_SIZE_HINT]: rawLength,
            },
        }),
    );
    post({ id, ok: true, phase: 'compressed', compressed }, [compressed]);
};

parentPort?.on('message', (request: ResultsPageWorkerRequest) => {
    try {
        build(request);
    } catch (error) {
        post(
            {
                id: request.id,
                ok: false,
                message: error instanceof Error ? error.message : String(error),
            },
            [],
        );
    }
});
