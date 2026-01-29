import {
    DbtVersionOption,
    DbtVersionOptionLatest,
    getErrorMessage,
    getLatestSupportDbtVersion,
    ParseError,
    SupportedDbtVersions,
} from '@lightdash/common';
import execa from 'execa';
import inquirer from 'inquirer';
import GlobalState from '../../globalState';
import * as styles from '../../styles';

const DBT_CORE_VERSION_REGEX = /installed:.*/;
export const DBT_CLOUD_CLI_REGEX = /dbt Cloud CLI.*/;
const DBT_FUSION_VERSION_REGEX = /dbt-fusion.*/;

const getDbtCLIVersion = async () => {
    try {
        const { all } = await execa('dbt', ['--version'], {
            all: true,
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        const logs = all || '';
        const cloudVersion = logs.match(DBT_CLOUD_CLI_REGEX);
        if (cloudVersion) {
            return cloudVersion[0];
        }

        const fusionVersion = logs.match(DBT_FUSION_VERSION_REGEX);
        if (fusionVersion) {
            return fusionVersion[0]; // eg: dbt-fusion 2.0.0-preview.65
        }

        const version = logs.match(DBT_CORE_VERSION_REGEX);
        if (version === null || version.length === 0)
            throw new ParseError(`Can't locate dbt --version: ${logs}`);
        return version[0].split(':')[1].trim();
    } catch (e: unknown) {
        const msg = getErrorMessage(e);
        throw new ParseError(`Failed to get dbt --version:\n  ${msg}`);
    }
};

const isDbtCloudCLI = (version: string): boolean =>
    version.match(DBT_CLOUD_CLI_REGEX) !== null;

const getSupportedDbtVersionOption = (
    version: string,
): DbtVersionOption | null => {
    if (version.match(DBT_CLOUD_CLI_REGEX))
        return DbtVersionOptionLatest.LATEST;
    if (version.match(DBT_FUSION_VERSION_REGEX))
        return DbtVersionOptionLatest.LATEST;
    if (version.startsWith('1.4.')) return SupportedDbtVersions.V1_4;
    if (version.startsWith('1.5.')) return SupportedDbtVersions.V1_5;
    if (version.startsWith('1.6.')) return SupportedDbtVersions.V1_6;
    if (version.startsWith('1.7.')) return SupportedDbtVersions.V1_7;
    if (version.startsWith('1.8.')) return SupportedDbtVersions.V1_8;
    if (version.startsWith('1.9.')) return SupportedDbtVersions.V1_9;
    if (version.startsWith('1.10.')) return SupportedDbtVersions.V1_10;
    if (version.startsWith('1.11.')) return SupportedDbtVersions.V1_11;

    // No supported version found
    return null;
};

const getFallbackDbtVersionOption = (version: string): DbtVersionOption => {
    if (version.startsWith('1.3.')) return SupportedDbtVersions.V1_4; // legacy|deprecated support for dbt 1.3
    return getLatestSupportDbtVersion();
};

export type DbtVersion = {
    verboseVersion: string; // Verbose version returned by dbt --version
    versionOption: DbtVersionOption; // The supported version by Lightdash
    isDbtCloudCLI: boolean; // Whether the version is dbt Cloud CLI
};

export const getDbtVersion = async (): Promise<DbtVersion> => {
    const verboseVersion = await getDbtCLIVersion();
    const supportedVersionOption = getSupportedDbtVersionOption(verboseVersion);
    const fallbackVersionOption = getFallbackDbtVersionOption(verboseVersion);
    const isSupported = !!supportedVersionOption;
    if (
        !isSupported &&
        !GlobalState.getSavedPromptAnswer('useFallbackDbtVersion')
    ) {
        const versions = Object.values(SupportedDbtVersions);
        const supportedVersionsRangeMessage = `${versions[0]}.* - ${
            versions[versions.length - 1]
        }.*`;
        const message = `We don't currently support version ${verboseVersion} on Lightdash. We'll interpret it as version ${fallbackVersionOption} instead, which might cause unexpected errors or behavior. For the best experience, please use a supported version (${supportedVersionsRangeMessage}).`;
        const spinner = GlobalState.getActiveSpinner();
        spinner?.stop();
        if (process.env.CI === 'true') {
            console.error(styles.warning(message));
        } else {
            const answers = await inquirer.prompt([
                {
                    type: 'confirm',
                    name: 'isConfirm',
                    message: `${styles.warning(
                        message,
                    )}\nDo you still want to continue?`,
                },
            ]);
            if (!answers.isConfirm) {
                console.error(
                    styles.error(
                        `Unsupported dbt version ${verboseVersion}. Please consider using a supported version (${supportedVersionsRangeMessage}).`,
                    ),
                );
                process.exit(1);
            }
        }
        spinner?.start();
        GlobalState.savePromptAnswer('useFallbackDbtVersion', true);
    }

    if (
        isDbtCloudCLI(verboseVersion) &&
        !GlobalState.getSavedPromptAnswer('useExperimentalDbtCloudCLI')
    ) {
        const message = `Support for dbt Cloud CLI is still experimental and might not work as expected.`;
        const spinner = GlobalState.getActiveSpinner();
        spinner?.stop();
        if (process.env.CI === 'true') {
            console.error(styles.warning(message));
        } else {
            const answers = await inquirer.prompt([
                {
                    type: 'confirm',
                    name: 'isConfirm',
                    message: `${styles.warning(
                        message,
                    )}\nDo you still want to continue?`,
                },
            ]);
            if (!answers.isConfirm) {
                console.error(
                    styles.error(
                        `Command using dbt cloud CLI has been canceled. Please consider using dbt core CLI for the best experience.`,
                    ),
                );
                process.exit(1);
            }
        }
        spinner?.start();
        GlobalState.savePromptAnswer('useExperimentalDbtCloudCLI', true);
    }

    return {
        verboseVersion,
        isDbtCloudCLI: isDbtCloudCLI(verboseVersion),
        versionOption: supportedVersionOption ?? fallbackVersionOption,
    };
};

export const tryGetDbtVersion = async (): Promise<
    { success: true; version: DbtVersion } | { success: false; error: unknown }
> => {
    try {
        const version = await getDbtVersion();
        GlobalState.debug(`> dbt version ${version.verboseVersion}`);
        return { success: true, version };
    } catch (e) {
        GlobalState.debug(
            `> dbt installation not found: ${getErrorMessage(
                e,
            )} (might be using Lightdash YAML only)`,
        );
        return { success: false, error: e };
    }
};
