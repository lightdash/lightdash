import { WarehouseTypes } from '@lightdash/common';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../testing/testUtils';
import { FormProvider, useForm } from './formContext';
import { ProjectFormProvider } from './ProjectFormProvider';
import WarehouseLocationInputs from './WarehouseLocationInputs';

const flag = vi.hoisted(() => ({ enabled: true }));
vi.mock('../../hooks/useExploreWarehouseConnection', () => ({
    useMixedWarehouseConnectionsEnabled: () => flag.enabled,
}));
vi.mock('../../hooks/useProject', () => ({
    useProject: () => ({
        data: {
            warehouseConnection: {
                type: WarehouseTypes.CLICKHOUSE,
                host: 'localhost',
                port: 8123,
                schema: 'analytics',
                secure: false,
            },
        },
    }),
}));
vi.mock('../../hooks/useWarehouseConnections', () => ({
    useWarehouseConnection: (
        _projectUuid: string,
        warehouseConnectionUuid: string | null,
    ) => ({
        data:
            warehouseConnectionUuid === null
                ? undefined
                : {
                      warehouseConnection: {
                          type: WarehouseTypes.SNOWFLAKE,
                          account: 'example',
                          warehouse: 'COMPUTE',
                          database: 'SALES',
                          schema: 'PUBLIC',
                      },
                  },
    }),
}));

const Harness = () => {
    const form = useForm({
        initialValues: {
            warehouseLocation: { database: '', schema: '' },
        } as never,
    });
    return (
        <ProjectFormProvider
            isDbtSource
            projectUuid="project"
            dbtSourceWarehouseConnectionUuid="snowflake-extra"
        >
            <FormProvider form={form}>
                <WarehouseLocationInputs projectUuid="project" />
            </FormProvider>
        </ProjectFormProvider>
    );
};

describe('WarehouseLocationInputs', () => {
    it('uses the bound connection fields with mixed warehouse connections on', () => {
        flag.enabled = true;
        renderWithProviders(<Harness />);
        expect(screen.getByLabelText('Database')).toHaveAttribute(
            'placeholder',
            'SALES',
        );
        expect(screen.getByLabelText('Schema')).toHaveAttribute(
            'placeholder',
            'PUBLIC',
        );
    });

    it('uses the project connection fields with mixed warehouse connections off', () => {
        flag.enabled = false;
        renderWithProviders(<Harness />);
        expect(screen.queryByLabelText('Database')).not.toBeInTheDocument();
        expect(screen.getByLabelText('Schema')).toHaveAttribute(
            'placeholder',
            'analytics',
        );
    });
});
