import {
    getErrorMessage,
    LightdashError,
    ParseError,
    type CliDeployCapabilities,
    type CliDeployMetadata,
} from '@lightdash/common';
import path from 'path';
import {
    ConnectionServerError,
    isLegacyDbtModelNamesValidationResponse,
} from '../agentConnections/serverError';
import { getDbtContext } from '../dbt/context';
import { DbtTargetNotFoundError, loadDbtTarget } from '../dbt/profile';
import { DbtLocationError, getDbtTargetLocation } from '../dbt/targetLocation';
import { CliProjectType } from '../lightdash/projectType';
import { lightdashApi } from './dbt/apiClient';

type DeployMetadataOptions = {
    projectUuid: string;
    projectType?: CliProjectType;
    projectDir: string;
    profilesDir: string;
    targetPath?: string;
    profile: string | undefined;
    target: string | undefined;
    dbtProjectName?: string;
};

const isDeployCapabilities = (
    value: unknown,
): value is CliDeployCapabilities => {
    if (typeof value !== 'object' || value === null) return false;
    if (
        !('version' in value) ||
        value.version !== 1 ||
        !('dbtProjectIdentity' in value) ||
        value.dbtProjectIdentity !== 1 ||
        !('dbtTargetLocation' in value) ||
        value.dbtTargetLocation !== 1 ||
        !('peerDbtSources' in value)
    ) {
        return false;
    }
    const peer = value.peerDbtSources;
    return (
        typeof peer === 'object' &&
        peer !== null &&
        'active' in peer &&
        typeof peer.active === 'boolean' &&
        'requiresDbtProjectName' in peer &&
        typeof peer.requiresDbtProjectName === 'boolean' &&
        'requiresDbtTarget' in peer &&
        typeof peer.requiresDbtTarget === 'boolean'
    );
};

export const isLegacyDbtModelNamesValidationError = (
    error: unknown,
): boolean => {
    if (error instanceof ConnectionServerError)
        return error.isLegacyDbtModelNamesValidationError;
    return (
        error instanceof LightdashError &&
        isLegacyDbtModelNamesValidationResponse(error.statusCode, error)
    );
};

const profileFailureReason = (error: unknown): string => {
    if (error instanceof DbtLocationError) return error.message;
    const message = getErrorMessage(error);
    if (/ENOENT|no such file/i.test(message))
        return 'a required file is missing';
    if (/EACCES|EPERM|permission denied/i.test(message))
        return 'a required file cannot be read with the current permissions';
    if (/environment|env_var/i.test(message))
        return 'a required environment variable could not be resolved';
    if (/Profile .+ not found/.test(message))
        return 'the selected profile does not exist';
    if (/find target/.test(message))
        return 'the selected target does not exist';
    if (/requires a database name/.test(message))
        return 'the selected target has no database or catalog';
    if (/YAML|indent|mapping|scalar/i.test(message))
        return 'the profile contains invalid YAML';
    return 'the profile or warehouse target configuration is invalid';
};

export const getDeployMetadata = async (
    options: DeployMetadataOptions,
): Promise<CliDeployMetadata | undefined> => {
    if (options.projectType === CliProjectType.LightdashYaml) return undefined;

    let capabilities: unknown;
    try {
        capabilities = await lightdashApi<CliDeployCapabilities>({
            method: 'GET',
            url: `/api/v2/projects/${options.projectUuid}/deploy/capabilities`,
            body: undefined,
            safeToRetry: true,
        });
    } catch (error) {
        if (
            (error instanceof LightdashError ||
                error instanceof ConnectionServerError) &&
            error.statusCode === 404
        ) {
            return undefined;
        }
        throw error;
    }
    if (!isDeployCapabilities(capabilities)) return undefined;

    const metadata: CliDeployMetadata = {
        cliCapabilities: { dbtProjectIdentity: 1, dbtTargetLocation: 1 },
        ...(options.dbtProjectName?.trim()
            ? { dbtProjectName: options.dbtProjectName.trim() }
            : {}),
    };
    const peerActive = capabilities.peerDbtSources.active;
    if (
        peerActive &&
        capabilities.peerDbtSources.requiresDbtProjectName &&
        metadata.dbtProjectName === undefined
    ) {
        throw new ParseError(
            'Peer dbt sources require a dbt project name. Set metadata.project_name in the compiled manifest or name in dbt_project.yml.',
        );
    }

    let profileName = options.profile || '(dbt project profile)';
    let targetName = options.target || '(profile default)';
    const fail = (reason: string): never => {
        throw new ParseError(
            `Cannot read the dbt location for profile "${profileName}" and target "${targetName}": ${reason}. Fix the dbt profile or target. Peer dbt sources require a valid dbt target location.`,
        );
    };
    try {
        profileName =
            options.profile ||
            (
                await getDbtContext({
                    projectDir: path.resolve(options.projectDir),
                    targetPath: options.targetPath,
                })
            ).profileName;
        const loaded = await loadDbtTarget({
            profilesDir: path.resolve(options.profilesDir),
            profileName,
            targetName: options.target,
        });
        targetName = loaded.name;
        metadata.dbtTarget = getDbtTargetLocation(loaded.target);
    } catch (error) {
        if (error instanceof DbtTargetNotFoundError)
            targetName = error.targetName;
        if (peerActive) fail(profileFailureReason(error));
    }
    return metadata;
};
