import { DbtProjectType, DefaultSupportedDbtVersion } from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../../testing/testUtils';
import { FormProvider, useForm } from '../formContext';
import { ProjectFormProvider } from '../ProjectFormProvider';
import { PostgresDefaultValues } from './defaultValues';
import PostgresForm from './PostgresForm';

const FormHarness = () => {
    const form = useForm({
        initialValues: {
            name: 'Postgres project',
            dbt: { type: DbtProjectType.NONE },
            warehouse: PostgresDefaultValues,
            dbtVersion: DefaultSupportedDbtVersion,
            requireUserCredentials: false,
        },
    });

    return (
        <ProjectFormProvider>
            <FormProvider form={form}>
                <PostgresForm disabled={false} />
            </FormProvider>
        </ProjectFormProvider>
    );
};

describe('PostgresForm', () => {
    it('renders database listing controls and disables explicit databases while listing all', async () => {
        const user = userEvent.setup();
        renderWithProviders(<FormHarness />);

        expect(screen.getByText('List all databases')).toBeInTheDocument();
        expect(
            screen.getByText(
                'The SQL runner sidebar lists every database this connection can read, up to 100.',
            ),
        ).toBeInTheDocument();
        expect(
            screen.getByText(
                'Other databases to show in the SQL runner sidebar.',
            ),
        ).toBeInTheDocument();

        const listAllDatabases = document.querySelector<HTMLInputElement>(
            '[name="warehouse.listAllDatabases"]',
        );
        const additionalDatabases = screen.getByPlaceholderText(
            'Type a database name and press Enter',
        );

        expect(listAllDatabases).toBeInTheDocument();
        expect(additionalDatabases).toBeEnabled();

        await user.click(listAllDatabases!);

        expect(additionalDatabases).toBeDisabled();
    });
});
