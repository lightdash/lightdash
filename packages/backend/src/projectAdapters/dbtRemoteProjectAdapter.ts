import {DbtBaseProjectAdapter} from "./dbtBaseProjectAdapter";

// TODO: extract config as optional override
export class DbtRemoteProjectAdapter extends DbtBaseProjectAdapter {

    constructor(host: string, port: number) {
        super(`http://${host}:${port}/jsonrpc`);
    }

}
