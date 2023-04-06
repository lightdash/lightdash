import { ParseError } from '@lightdash/common';
import execa from 'execa';

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
    } catch (e: any) {
        throw new ParseError(`Failed to get dbt --version:\n  ${e.message}`);
    }
};

export const isSupportedDbtVersion = (version: string) => {
    if (version.startsWith('1.3.')) return true;
    if (version.startsWith('1.4.')) return true;
    return false;
};
