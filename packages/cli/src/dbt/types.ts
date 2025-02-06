export type LoadProfileArgs = {
    profilesDir: string;
    profileName: string;
    targetName?: string;
};
type DatabricksComputeConfig = {
    [name: string]: {
        http_path: string;
    };
};
export type Target = Record<string, unknown> & {
    type: string;
    compute?: DatabricksComputeConfig;
};
type Profile = {
    target: string;
    outputs: Record<string, Target>;
};
export type Profiles = {
    [name: string]: Profile;
};
