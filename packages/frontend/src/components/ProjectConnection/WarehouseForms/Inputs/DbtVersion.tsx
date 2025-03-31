import {
    DbtVersionOptionLatest,
    DefaultSupportedDbtVersion,
    getLatestSupportDbtVersion,
    SupportedDbtVersions,
} from '@lightdash/common';
import { Select } from '@mantine/core';
import React, { type FC } from 'react';
import { Controller } from 'react-hook-form';

const DbtVersionSelect: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
    return (
        <Controller
            name="dbtVersion"
            defaultValue={DefaultSupportedDbtVersion}
            render={({ field }) => (
                <Select
                    label="dbt version"
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
            )}
        />
    );
};

export default DbtVersionSelect;
