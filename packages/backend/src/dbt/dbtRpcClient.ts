import { DbtRpcClientBase, DEFAULT_HEADERS } from './dbtRpcClientBase';

export class DbtRpcClient extends DbtRpcClientBase {
    constructor(
        serverUrl: string,
        headers: Record<string, string> = DEFAULT_HEADERS,
    ) {
        super(serverUrl, headers);
    }
}
