import { DbtProjectType, DefaultSupportedDbtVersion } from '@lightdash/common';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../../testing/testUtils';
import { FormProvider, useForm } from '../formContext';
import { ProjectFormProvider } from '../ProjectFormProvider';
import AthenaForm from './AthenaForm';
import { AthenaDefaultValues } from './defaultValues';

vi.mock('../../../hooks/health/useHealth', () => ({
    default: () => ({ data: {} }),
}));

const FormHarness = () => {
    const form = useForm({
        initialValues: {
            name: 'Athena project',
            dbt: { type: DbtProjectType.NONE },
            warehouse: AthenaDefaultValues,
            dbtVersion: DefaultSupportedDbtVersion,
        },
    });

    return (
        <ProjectFormProvider>
            <FormProvider form={form}>
                <AthenaForm disabled={false} />
            </FormProvider>
        </ProjectFormProvider>
    );
};

describe('AthenaForm', () => {
    it('uses Athena data catalog and database labels', () => {
        renderWithProviders(<FormHarness />);

        expect(screen.getByLabelText(/^Data catalog/)).toBeInTheDocument();
        expect(
            screen.getByText(
                'The Athena data catalog, usually AwsDataCatalog.',
            ),
        ).toBeInTheDocument();
        expect(screen.getByLabelText(/^Database/)).toBeInTheDocument();
        expect(
            screen.getByText('The Athena database inside the data catalog.'),
        ).toBeInTheDocument();
    });
});
