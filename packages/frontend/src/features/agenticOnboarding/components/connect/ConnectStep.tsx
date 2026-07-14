import {
    DbtProjectType,
    WarehouseTypes,
    type WarehouseTypes as WarehouseTypesType,
} from '@lightdash/common';
import { type FC } from 'react';
import { dbtDefaults } from '../../../../components/ProjectConnection/DbtForms/defaultValues';
import {
    useForm,
    FormProvider,
} from '../../../../components/ProjectConnection/formContext';
import { ProjectFormProvider } from '../../../../components/ProjectConnection/ProjectFormProvider';
import { warehouseDefaultValues } from '../../../../components/ProjectConnection/WarehouseForms/defaultValues';
import useApp from '../../../../providers/App/useApp';
import { useOnboardingWizard } from '../../context/wizardContext';
import { ConnectMethodId } from '../../utils/methodRegistry';
import ConnectMethodCliSso from './ConnectMethodCliSso';
import ConnectMethodGenericManual from './ConnectMethodGenericManual';
import ConnectMethodKeyPair from './ConnectMethodKeyPair';
import ConnectMethodManual from './ConnectMethodManual';
import ConnectMethodPassword from './ConnectMethodPassword';
import ConnectMethodPaste from './ConnectMethodPaste';
import MethodChooser from './MethodChooser';
import WarehousePicker from './WarehousePicker';

const renderMethodScreen = (
    warehouse: WarehouseTypesType,
    method: ConnectMethodId,
) => {
    if (method === ConnectMethodId.CLI_SSO) return <ConnectMethodCliSso />;
    if (method === ConnectMethodId.PASTE) return <ConnectMethodPaste />;

    if (warehouse === WarehouseTypes.SNOWFLAKE) {
        switch (method) {
            case ConnectMethodId.KEYPAIR:
                return <ConnectMethodKeyPair />;
            case ConnectMethodId.PASSWORD:
                return <ConnectMethodPassword />;
            case ConnectMethodId.MANUAL:
            default:
                return <ConnectMethodManual />;
        }
    }

    return <ConnectMethodGenericManual />;
};

const ConnectFormFlow: FC<{ warehouse: WarehouseTypesType }> = ({
    warehouse,
}) => {
    const { user } = useApp();
    const { method } = useOnboardingWizard();

    const form = useForm({
        initialValues: {
            name: user.data?.organizationName || 'My project',
            dbt: dbtDefaults.formValues[DbtProjectType.NONE],
            warehouse: warehouseDefaultValues[warehouse],
            dbtVersion: dbtDefaults.dbtVersion,
            organizationWarehouseCredentialsUuid: undefined,
        },
        validateInputOnBlur: true,
        // SnowflakeForm sets a default auth type during render while the form
        // is untouched; method screens own that value via effect instead
        initialTouched: { 'warehouse.authenticationType': true },
    });

    return (
        <FormProvider form={form}>
            <ProjectFormProvider>
                {method ? (
                    renderMethodScreen(warehouse, method)
                ) : (
                    <MethodChooser warehouse={warehouse} />
                )}
            </ProjectFormProvider>
        </FormProvider>
    );
};

const ConnectStep: FC = () => {
    const { warehouse } = useOnboardingWizard();

    if (!warehouse) {
        return <WarehousePicker />;
    }

    return <ConnectFormFlow key={warehouse} warehouse={warehouse} />;
};

export default ConnectStep;
