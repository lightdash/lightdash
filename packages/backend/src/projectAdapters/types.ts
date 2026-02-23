import {
    DbtPackages,
    DbtRpcGetManifestResults,
    SupportedDbtVersions,
} from '@lightdash/common';

/**
 * Provides manifest from various sources (dbt CLI, dbt Cloud, static JSON).
 * Responsible for obtaining the dbt manifest that contains model definitions.
 */
export interface ManifestProvider {
    /**
     * Get the dbt manifest containing model definitions
     */
    getManifest(): Promise<DbtRpcGetManifestResults>;

    /**
     * Get the dbt packages.yml content if available
     */
    getDbtPackages?(): Promise<DbtPackages | undefined>;

    /**
     * Install dbt dependencies (dbt deps)
     */
    installDeps?(): Promise<void>;

    /**
     * Get the selector used to filter models (if any)
     */
    getSelector(): string | undefined;

    /**
     * Test the connection to the manifest source
     */
    test(): Promise<void>;

    /**
     * Clean up any resources
     */
    destroy(): Promise<void>;
}

/**
 * Provides access to project source files (local filesystem or git repository).
 * Responsible for ensuring the project files are available locally.
 */
export interface SourceAccessor {
    /**
     * Get the path to the project directory containing dbt project files
     */
    getProjectDirectory(): string;

    /**
     * Refresh the source files (e.g., git pull)
     */
    refresh(): Promise<void>;

    /**
     * Test the connection to the source
     */
    test(): Promise<void>;

    /**
     * Clean up any resources (e.g., remove temp directories)
     */
    destroy(): Promise<void>;
}

/**
 * Result of profile generation
 */
export type ProfileGeneratorResult = {
    /** Path to the directory containing profiles.yml */
    profilesDir: string;
    /** The profile name to use */
    profileName: string;
    /** The target name to use */
    targetName: string;
    /** Environment variables to set for dbt (containing sensitive credentials) */
    environment: Record<string, string>;
};

/**
 * Generates dbt profiles for warehouse connections.
 * Responsible for creating profiles.yml and managing credentials securely.
 */
export interface ProfileGenerator {
    /**
     * Generate the profile and return the result
     */
    generate(): ProfileGeneratorResult;

    /**
     * Clean up any resources (e.g., remove temp profile directory)
     */
    destroy(): Promise<void>;
}

/**
 * Configuration for creating a DbtCliManifestProvider
 */
export type DbtCliManifestProviderArgs = {
    projectDir: string;
    profilesDir: string;
    profileName: string;
    target: string;
    environment: Record<string, string>;
    dbtVersion: SupportedDbtVersions;
    useDbtLs: boolean;
    selector?: string;
};

/**
 * Configuration for creating a DbtCloudManifestProvider
 */
export type DbtCloudManifestProviderArgs = {
    environmentId: string | number;
    bearerToken: string;
    discoveryApiEndpoint: string | undefined;
    tags: string[] | undefined;
};

/**
 * Git URL builder function signature
 */
export type GitUrlBuilder = (params: GitUrlParams) => string;

/**
 * Parameters for git URL builders
 */
export type GitUrlParams = {
    token: string;
    repository: string;
    host?: string;
    username?: string;
    organization?: string;
    project?: string;
};
