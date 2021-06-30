import {DbtBaseProjectAdapter} from "./dbtBaseProjectAdapter";
import {Explore} from "common";

export class DbtRemoteProjectAdapter extends DbtBaseProjectAdapter {

    constructor(host: string, port: number) {
        super(`http://${host}:${port}/jsonrpc`);
    }

    public async compileAllExplores(): Promise<Explore[]> {
        return super.compileAllExplores(false);
    }

}
