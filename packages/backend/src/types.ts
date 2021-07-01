import {Explore} from "common";

export interface ProjectAdapter {
    compileAllExplores(): Promise<Explore[]>;
    runQuery(sql: string): Promise<Record<string, any>>;
}
