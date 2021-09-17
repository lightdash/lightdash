import { Explore, ExploreError } from 'common';

export interface ProjectAdapter {
    compileAllExplores(): Promise<(Explore | ExploreError)[]>;
    runQuery(sql: string): Promise<Record<string, any>>;
}
