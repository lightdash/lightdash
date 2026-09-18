import {
    DbtProjectType,
    DefaultSupportedDbtVersion,
    WarehouseTypes,
} from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../../testing/testUtils';
import { FormProvider, useForm } from '../formContext';
import { AthenaDefaultValues } from './defaultValues';
import WarehouseDatabaseListingFields from './WarehouseDatabaseListingFields';

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
        <FormProvider form={form}>
            <WarehouseDatabaseListingFields
                disabled={false}
                warehouseType={WarehouseTypes.ATHENA}
            />
        </FormProvider>
    );
};

describe('WarehouseDatabaseListingFields', () => {
    it('keeps Athena copy and disables explicit databases while listing all', async () => {
        const user = userEvent.setup();
        renderWithProviders(<FormHarness />);

        expect(screen.getByText('List all databases')).toBeInTheDocument();
        expect(
            screen.getByText(
                'The SQL runner sidebar lists every database in the data catalog this connection can read, up to 100.',
            ),
        ).toBeInTheDocument();
        expect(
            screen.getByText(
                'Other databases in this data catalog to show in the SQL runner sidebar.',
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
