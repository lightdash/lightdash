import {
    DefaultSupportedDbtVersion,
    ParseError,
    SupportedDbtVersions,
} from '@lightdash/common';
import execa from 'execa';
import * as styles from '../../styles';

export const getDbtVersion = async () => {
    try {
        const { all } = await execa('dbt', ['--version'], {
            all: true,
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        const logs = all || '';
        const coreVersionRegex = /installed:.*/;
        const version = await logs.match(coreVersionRegex);
        if (version === null || version.length === 0)
            throw new ParseError(`Can't locate dbt --version: ${logs}`);
        return version[0].split(':')[1].trim();
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : '-';
        throw new ParseError(`Failed to get dbt --version:\n  ${msg}`);
    }
};

export const getSupportedDbtVersion = async () => {
    const version = await getDbtVersion();
    if (version.startsWith('1.4.')) return SupportedDbtVersions.V1_4;
    if (version.startsWith('1.5.')) return SupportedDbtVersions.V1_5;
    if (version.startsWith('1.6.')) return SupportedDbtVersions.V1_6;
    if (version.startsWith('1.7.')) return SupportedDbtVersions.V1_7;
    if (version.startsWith('1.8.')) return SupportedDbtVersions.V1_8;

    console.error(
        styles.warning(
            `We don't currently support version ${version} on Lightdash, we'll be using ${DefaultSupportedDbtVersion} instead when dbt is refresh from the UI.`,
        ),
    );
    return DefaultSupportedDbtVersion;
};

export const isSupportedDbtVersion = (version: string) => {
    const supportedVersions = ['1.3.', '1.4.', '1.5.', '1.6.', '1.7', '1.8'];
    return supportedVersions.some((supportedVersion) =>
        version.startsWith(supportedVersion),
    );
};
