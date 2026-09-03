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

    const renderResult = renderWithProviders(<Wrapper />);

    return { formRef, ...renderResult };
};

const getAuthenticationType = (formRef: { current: Form | null }) =>
    (formRef.current?.values.warehouse as CreateRedshiftCredentials)
        ?.authenticationType;

describe('RedshiftForm', () => {
    it('defaults the authentication type when it is unset', async () => {
        const { formRef } = renderRedshiftForm(undefined);

        await waitFor(() => {
            expect(getAuthenticationType(formRef)).toBe(
                RedshiftAuthenticationType.PASSWORD,
            );
        });
    });

    it('keeps an existing IAM authentication type when the form opens', async () => {
        const { formRef } = renderRedshiftForm(RedshiftAuthenticationType.IAM);

        await waitFor(() => {
            expect(getAuthenticationType(formRef)).toBe(
                RedshiftAuthenticationType.IAM,
            );
        });
    });

    it('keeps an existing IAM browser authentication type when the form opens', async () => {
        const { formRef } = renderRedshiftForm(
            RedshiftAuthenticationType.IAM_BROWSER,
        );

        await waitFor(() => {
            expect(getAuthenticationType(formRef)).toBe(
                RedshiftAuthenticationType.IAM_BROWSER,
            );
        });
    });

    it('renders the username and password fields for password authentication', async () => {
        const { findByLabelText, queryByLabelText } = renderRedshiftForm(
            RedshiftAuthenticationType.PASSWORD,
        );

        expect(await findByLabelText(/^User\b/)).toBeInTheDocument();
        expect(await findByLabelText(/^Password\b/)).toBeInTheDocument();
        expect(
            queryByLabelText('AWS region', { exact: false }),
        ).not.toBeInTheDocument();
        expect(
            queryByLabelText('AWS access portal URL', { exact: false }),
        ).not.toBeInTheDocument();
    });

    it('renders the shared-identity IAM fields for AWS IAM authentication', async () => {
        const { findByLabelText, findByText, queryByLabelText } =
            renderRedshiftForm(RedshiftAuthenticationType.IAM);

        expect(
            await findByLabelText('AWS region', { exact: false }),
        ).toBeInTheDocument();
        expect(await findByText('Redshift Serverless')).toBeInTheDocument();
        expect(
            await findByLabelText('Cluster identifier', { exact: false }),
        ).toBeInTheDocument();
        expect(
            await findByLabelText('Database user', { exact: false }),
        ).toBeInTheDocument();
        expect(
            await findByLabelText('Assume role ARN', { exact: false }),
        ).toBeInTheDocument();
        expect(queryByLabelText('Password')).not.toBeInTheDocument();
        expect(
            queryByLabelText('AWS access portal URL', { exact: false }),
        ).not.toBeInTheDocument();
    });

    it('renders the AWS region and IAM Identity Center fields for browser IAM authentication', async () => {
        const { findByLabelText, queryByLabelText } = renderRedshiftForm(
            RedshiftAuthenticationType.IAM_BROWSER,
        );

        expect(
            await findByLabelText('AWS region', { exact: false }),
        ).toBeInTheDocument();
        expect(
            await findByLabelText('AWS access portal URL', {
                exact: false,
            }),
        ).toBeInTheDocument();
        expect(
            await findByLabelText('IAM Identity Center region', {
                exact: false,
            }),
        ).toBeInTheDocument();
        expect(
            await findByLabelText('AWS account ID', { exact: false }),
        ).toBeInTheDocument();
        expect(
            await findByLabelText('AWS role name', { exact: false }),
        ).toBeInTheDocument();
        expect(queryByLabelText('Password')).not.toBeInTheDocument();
        expect(
            queryByLabelText('Cluster identifier', { exact: false }),
        ).not.toBeInTheDocument();
    });
});
