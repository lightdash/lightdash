import {
    DbtProjectType,
    RedshiftAuthenticationType,
    type CreateRedshiftCredentials,
} from '@lightdash/common';
import { waitFor } from '@testing-library/react';
import { type FC } from 'react';
import { renderWithProviders } from '../../../testing/testUtils';
import ProjectFormContext from '../context';
import { dbtDefaults } from '../DbtForms/defaultValues';
import {
    FormProvider,
    useForm,
    useFormContext,
    type Form,
} from '../formContext';
import { RedshiftDefaultValues } from './defaultValues';
import RedshiftForm from './RedshiftForm';

const FormProbe: FC<{ formRef: { current: Form | null } }> = ({ formRef }) => {
    formRef.current = useFormContext();
    return null;
};

const renderRedshiftForm = (
    authenticationType: RedshiftAuthenticationType | undefined,
) => {
    const formRef: { current: Form | null } = { current: null };

    const Wrapper: FC = () => {
        const form = useForm({
            initialValues: {
                name: 'test project',
                dbt: { type: DbtProjectType.NONE },
                warehouse: {
                    ...RedshiftDefaultValues,
                    authenticationType,
                },
                dbtVersion: dbtDefaults.dbtVersion,
            },
        });

        return (
            <ProjectFormContext.Provider value={{}}>
                <FormProvider form={form}>
                    <RedshiftForm disabled={false} />
                    <FormProbe formRef={formRef} />
                </FormProvider>
            </ProjectFormContext.Provider>
        );
    };

    renderWithProviders(<Wrapper />);

    return formRef;
};

const getAuthenticationType = (formRef: { current: Form | null }) =>
    (formRef.current?.values.warehouse as CreateRedshiftCredentials)
        ?.authenticationType;

describe('RedshiftForm', () => {
    it('defaults the authentication type when it is unset', async () => {
        const formRef = renderRedshiftForm(undefined);

        await waitFor(() => {
            expect(getAuthenticationType(formRef)).toBe(
                RedshiftAuthenticationType.PASSWORD,
            );
        });
    });

    it('keeps an existing IAM authentication type when the form opens', async () => {
        const formRef = renderRedshiftForm(RedshiftAuthenticationType.IAM);

        await waitFor(() => {
            expect(getAuthenticationType(formRef)).toBe(
                RedshiftAuthenticationType.IAM,
            );
        });
    });

    it('keeps an existing IAM browser authentication type when the form opens', async () => {
        const formRef = renderRedshiftForm(
            RedshiftAuthenticationType.IAM_BROWSER,
        );

        await waitFor(() => {
            expect(getAuthenticationType(formRef)).toBe(
                RedshiftAuthenticationType.IAM_BROWSER,
            );
        });
    });
});
