export type LoadProfileArgs = {
    profilesDir: string;
    profileName: string;
    targetName?: string;
};
export type Target = Record<string, unknown> & {
    type: string;
};
type Profile = {
    target: string;
    outputs: Record<string, Target>;
};
export type Profiles = {
    [name: string]: Profile;
};
