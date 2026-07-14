import { DbtProjectType } from '@lightdash/common';
import { fireEvent, screen } from '@testing-library/react';
import { useState, type FC } from 'react';
import { dbtDefaults } from '../../../../components/ProjectConnection/DbtForms/defaultValues';
import {
    FormProvider,
    useForm,
    useFormContext,
} from '../../../../components/ProjectConnection/formContext';
import { SnowflakeDefaultValues } from '../../../../components/ProjectConnection/WarehouseForms/defaultValues';
import { renderWithProviders } from '../../../../testing/testUtils';

const AccountField: FC = () => {
    const form = useFormContext();
    return (
        <input
            aria-label="account"
            {...form.getInputProps('warehouse.account')}
        />
    );
};

const MethodA: FC = () => {
    const form = useFormContext();
    const account =
        form.values.warehouse.type === 'snowflake'
            ? form.values.warehouse.account
            : '';
    return <div>A:{account}</div>;
};

const MethodB: FC = () => {
    const form = useFormContext();
    const account =
        form.values.warehouse.type === 'snowflake'
            ? form.values.warehouse.account
            : '';
    return <div>B:{account}</div>;
};

const Harness: FC = () => {
    const [method, setMethod] = useState<'a' | 'b'>('a');
    const form = useForm({
        initialValues: {
            name: '',
            dbt: dbtDefaults.formValues[DbtProjectType.NONE],
            warehouse: SnowflakeDefaultValues,
            dbtVersion: dbtDefaults.dbtVersion,
            organizationWarehouseCredentialsUuid: undefined,
        },
    });
    return (
        <FormProvider form={form}>
            <AccountField />
            {method === 'a' ? <MethodA /> : <MethodB />}
            <button type="button" onClick={() => setMethod('b')}>
                switch
            </button>
        </FormProvider>
    );
};

describe('lifted form provider', () => {
    it('preserves non-secret values when switching methods', () => {
        renderWithProviders(<Harness />);

        fireEvent.change(screen.getByLabelText('account'), {
            target: { value: 'ab12345' },
        });
        expect(screen.getByText('A:ab12345')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'switch' }));

        expect(screen.getByText('B:ab12345')).toBeInTheDocument();
    });
});
