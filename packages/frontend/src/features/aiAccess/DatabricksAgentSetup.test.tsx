import { WarehouseTypes, type DatabricksCredentials } from '@lightdash/common';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import { DatabricksAgentSetup } from './DatabricksAgentSetup';

const connection: DatabricksCredentials = {
    type: WarehouseTypes.DATABRICKS,
    serverHostName: 'workspace.example.test',
    httpPath: '/sql/warehouse',
    catalog: 'analytics`catalog',
    database: 'reporting`schema',
};

describe('Databricks agent setup', () => {
    it('copies escaped grants and explains workspace access and policy scope', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: { writeText },
        });
        renderWithProviders(
            <DatabricksAgentSetup
                connection={connection}
                hasCredentials={false}
                tested={false}
            />,
        );
        expect(
            screen.getByText(/Databricks account console/),
        ).toHaveTextContent('CAN USE on the SQL warehouse');
        expect(screen.getByText(/Unity Catalog row/)).toHaveTextContent(
            'column masks apply to this principal',
        );
        expect(screen.getByText(/repeat SELECT/)).toBeVisible();
        expect(
            screen.getByText(
                "Use the service principal's application ID as the Client ID.",
            ),
        ).toBeVisible();
        fireEvent.click(screen.getByRole('button', { name: 'Copy SQL' }));
        await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
        expect(writeText).toHaveBeenCalledWith(
            'GRANT USE CATALOG ON CATALOG `analytics``catalog` TO `<service-principal-application-id>`;\nGRANT USE SCHEMA ON SCHEMA `analytics``catalog`.`reporting``schema` TO `<service-principal-application-id>`;\nGRANT SELECT ON TABLE `analytics``catalog`.`reporting``schema`.`<table>` TO `<service-principal-application-id>`;',
        );
    });
    it('uses placeholders for an unknown catalog and schema', () => {
        renderWithProviders(
            <DatabricksAgentSetup
                connection={{ ...connection, catalog: '', database: '' }}
                hasCredentials={false}
                tested={false}
            />,
        );
        expect(screen.getByRole('region')).toHaveTextContent(
            '`<catalog>`.`<schema>`.`<table>`',
        );
    });
    it('collapses setup for saved credentials and marks a verified save complete', async () => {
        renderWithProviders(
            <DatabricksAgentSetup
                connection={connection}
                hasCredentials
                tested
            />,
        );
        const button = screen.getByRole('button', {
            name: 'How to set up the shared agent account',
        });
        expect(button).toHaveAttribute('aria-expanded', 'false');
        fireEvent.click(button);
        await waitFor(() =>
            expect(screen.getByLabelText('Step 3 done')).toBeVisible(),
        );
    });
});
