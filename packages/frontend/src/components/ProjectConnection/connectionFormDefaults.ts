import { DbtProjectType, DefaultSupportedDbtVersion } from '@lightdash/common';
import { dbtDefaults } from './DbtForms/defaultValues';

export const unusedDbtFormValues = {
    dbt: { ...dbtDefaults.formValues[DbtProjectType.NONE] },
    dbtVersion: DefaultSupportedDbtVersion,
};
