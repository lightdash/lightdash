import {
    DbtVersionOptionLatest,
    DefaultSupportedDbtVersion,
    getLatestSupportDbtVersion,
    SupportedDbtVersions,
} from '@lightdash/common';
import { Select } from '@mantine/core';
import React, { type FC } from 'react';
import useInstalledDbtVersions from '../../../hooks/dbt/useInstalledDbtVersions';
import { useFormContext } from '../formContext';

const DbtVersionSelect: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
    const form = useFormContext();
    const field = form.getInputProps('dbtVersion');
    const { data: installedVersions } = useInstalledDbtVersions();

    const getVersionLabel = (version: SupportedDbtVersions): string => {
        const patchVersion = installedVersions?.[version];
        if (patchVersion) {
            return `${version} (running ${patchVersion})`;
        }
        return version;
    };

    const latestVersion = getLatestSupportDbtVersion();
    const latestPatchVersion = installedVersions?.[latestVersion];
    const latestLabel = latestPatchVersion
        ? `latest (running ${latestPatchVersion})`
        : `latest (${latestVersion})`;

    return (
        <Select
            label="dbt version"
            name="dbtVersion"
            defaultValue={DefaultSupportedDbtVersion}
            data={[
                {
                    value: DbtVersionOptionLatest.LATEST,
                    label: latestLabel,
                },
                ...Object.values(SupportedDbtVersions)
                    .reverse()
                    .map((version) => ({
                        value: version,
                        label: getVersionLabel(version),
                    })),
            ]}
            value={field.value}
            onChange={field.onChange}
            disabled={disabled}
        />
    );
};

export default DbtVersionSelect;
