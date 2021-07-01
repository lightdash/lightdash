import {DbtBaseProjectAdapter} from "./dbtBaseProjectAdapter";

export class DbtRemoteProjectAdapter extends DbtBaseProjectAdapter {

    constructor(host: string, port: number) {
        super(`http://${host}:${port}/jsonrpc`);
    }

}
