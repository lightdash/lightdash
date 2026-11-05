import {
    ProjectType,
    WarehouseTypes,
    type CreateWarehouseCredentials,
    type Project,
} from '@lightdash/common';
import { screen } from '@testing-library/react';
import { type FC, type PropsWithChildren } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import { unusedDbtFormValues } from './connectionFormDefaults';
import { FormProvider, useForm } from './formContext';
import { ProjectForm } from './ProjectForm';
import { warehouseDefaultValues } from './WarehouseForms/defaultValues';

const savedProject = {
    projectUuid: 'project-uuid',
    organizationUuid: 'organization-uuid',
    type: ProjectType.DEFAULT,
} as Project;

vi.mock('./ConnectionsPanel', () => ({
    default: () => <div data-testid="connections-panel" />,
}));
vi.mock('./WarehouseSettingsForm', () => ({
    default: ({ children }: PropsWithChildren) => (
        <div data-testid="warehouse-form">{children}</div>
    ),
}));
vi.mock('./DbtSettingsForm', () => ({
    default: () => <div data-testid="dbt-form" />,
}));
vi.mock('./DbtSourcesPanel', () => ({ default: () => null }));
vi.mock('./useProjectFormContext', () => ({
    useProjectFormContext: () => ({ savedProject }),
}));

const FormHarness: FC = () => {
    const form = useForm({
        initialValues: {
            name: 'Jaffle shop',
            warehouse: {
                ...warehouseDefaultValues[WarehouseTypes.POSTGRES],
            } as CreateWarehouseCredentials,
            ...unusedDbtFormValues,
        },
    });
    return (
        <FormProvider form={form}>
            <ProjectForm showGeneralSettings={false} disabled={false} />
        </FormProvider>
    );
};

describe('ProjectForm', () => {
    it('renders the connections panel inside the warehouse connection card, above its form', () => {
        renderWithProviders(<FormHarness />);

        const panel = screen.getByTestId('connections-panel');
        const warehouseCard = screen
            .getByText('Warehouse connection')
            .closest('[data-connection-card]');
        expect(warehouseCard).toContainElement(panel);
        expect(warehouseCard).toContainElement(
            screen.getByTestId('warehouse-form'),
        );
        expect(
            panel.compareDocumentPosition(
                screen.getByTestId('warehouse-form'),
            ) & Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
        expect(
            screen
                .getByText('Semantic layer connection')
                .closest('[data-connection-card]'),
        ).not.toContainElement(panel);
        expect(screen.getAllByTestId('connections-panel')).toHaveLength(1);
    });
});
