"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TdcpClient = void 0;
const types_1 = require("./types");
/**
 * Draft TDCP client over the JSON-RPC transport. On the real MCP transport
 * this class keeps its surface and swaps rpc() for extension method calls
 * on an MCP session — consumers never see the difference.
 */
class TdcpClient {
    constructor(args) {
        this.requestId = 0;
        this.url = args.url;
        this.token = args.token;
        this.fetchImpl = args.fetchImpl ?? fetch;
    }
    async rpc(method, params) {
        this.requestId += 1;
        const request = {
            jsonrpc: '2.0',
            id: this.requestId,
            method,
            params,
        };
        const response = await this.fetchImpl(this.url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(this.token
                    ? { Authorization: `Bearer ${this.token}` }
                    : {}),
            },
            body: JSON.stringify(request),
        });
        if (!response.ok) {
            throw new Error(`TDCP server responded ${response.status} to ${method}`);
        }
        let body;
        try {
            body = (await response.json());
        }
        catch (e) {
            throw new Error(`TDCP server returned a non-JSON response to ${method}`);
        }
        if (body.error) {
            throw new Error(`TDCP server error on ${method} (${body.error.code}): ${body.error.message}`);
        }
        return body.result;
    }
    async capabilities() {
        return (await this.rpc(types_1.TdcpMethods.CAPABILITIES, {}));
    }
    async catalog() {
        return (await this.rpc(types_1.TdcpMethods.CATALOG, {}));
    }
    async read(request) {
        return (await this.rpc(types_1.TdcpMethods.READ, {
            ...request,
            method: types_1.TdcpMethods.READ,
        }));
    }
    async scan(request) {
        return (await this.rpc(types_1.TdcpMethods.SCAN, {
            ...request,
            method: types_1.TdcpMethods.SCAN,
        }));
    }
    async query(request) {
        return (await this.rpc(types_1.TdcpMethods.QUERY, {
            ...request,
            method: types_1.TdcpMethods.QUERY,
        }));
    }
    async refresh(datasetId) {
        return (await this.rpc(types_1.TdcpMethods.REFRESH, {
            method: types_1.TdcpMethods.REFRESH,
            datasetId,
        }));
    }
    /**
     * Fetch a dataset's rows from its jsonl data-plane link. Buffers the
     * body — a streaming variant lands with the Arrow encoding.
     */
    async *fetchJsonlRows(link) {
        const response = await this.fetchImpl(link.href, {
            headers: link.token
                ? { Authorization: `Bearer ${link.token}` }
                : {},
        });
        if (!response.ok) {
            throw new Error(`TDCP data plane responded ${response.status}`);
        }
        const body = await response.text();
        const lines = body
            .split('\n')
            .filter((line) => line.trim().length > 0);
        for (const line of lines) {
            let row;
            try {
                row = JSON.parse(line);
            }
            catch (e) {
                throw new Error('TDCP data plane returned malformed JSONL');
            }
            yield row;
        }
    }
}
exports.TdcpClient = TdcpClient;
//# sourceMappingURL=client.js.map