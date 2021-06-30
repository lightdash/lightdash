import {Explore} from "common";

export class BaseProjectAdapter {
    constructor() {
    }

    public async compileAllExplores(): Promise<Explore[]> {
        throw new Error('Not implemented');
    }

    public async runQuery(sql: string): Promise<Record<string, any>> {
        throw new Error('Not implemented');
    }

}