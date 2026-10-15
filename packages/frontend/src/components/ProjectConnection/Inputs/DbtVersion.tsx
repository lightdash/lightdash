import {
    DbtVersionOptionLatest,
    DefaultSupportedDbtVersion,
    getLatestSupportDbtVersion,
    SupportedDbtVersions,
} from '@lightdash/common';
import { Select } from '@mantine/core';
import React, { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useFormContext } from '../formContext';
import { useProjectFormContext } from '../useProjectFormContext';

const DbtVersionSelect: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
    const { t } = useTranslation('projectConnection');
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
            label={t('inputs.dbtVersion')}
            name="dbtVersion"
            defaultValue={DefaultSupportedDbtVersion}
            data={[
                {
                    value: DbtVersionOptionLatest.LATEST,
                    label: t('inputs.dbtVersionLatest', {
                        version: getLatestSupportDbtVersion(),
                    }),
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
