import {
    DbtVersionOptionLatest,
    DefaultSupportedDbtVersion,
    getLatestSupportDbtVersion,
    SupportedDbtVersions,
} from '@lightdash/common';
import { Select } from '@mantine-8/core';
import React, { type FC } from 'react';
import { useFormContext } from '../formContext';
import { useProjectFormContext } from '../useProjectFormContext';

const DbtVersionSelect: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
    const form = useFormContext();
    const { isDbtSource } = useProjectFormContext();
    const field = form.getInputProps('dbtVersion');

    // Additional dbt sources inherit the project's dbt version.
    if (isDbtSource) {
        return null;
    }

    return (
        <Select
            allowDeselect={false}
            label="dbt version"
            name="dbtVersion"
            defaultValue={DefaultSupportedDbtVersion}
            data={[
                {
                    value: DbtVersionOptionLatest.LATEST,
                    label: `latest (${getLatestSupportDbtVersion()})`,
                },
                ...Object.values(SupportedDbtVersions)
                    .reverse()
                    .map((version) => ({
                        value: version,
                        label: version,
                    })),
            ]}
            value={field.value}
            onChange={field.onChange}
            disabled={disabled}
        />
    );
};

export default DbtVersionSelect;
