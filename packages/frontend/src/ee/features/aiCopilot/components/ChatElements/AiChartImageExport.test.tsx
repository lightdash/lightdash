import { Button, MantineProvider, Menu } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef, useState } from 'react';
import { describe, expect, it } from 'vitest';
import { type EChartsReact } from '../../../../../components/EChartsReactWrapper';
import {
    AiChartImageExportMenuItem,
    AiChartImageExportModal,
} from './AiChartImageExport';

const TestImageExport = () => {
    const [opened, setOpened] = useState(false);

    return (
        <>
            <Menu>
                <Menu.Target>
                    <Button>Actions</Button>
                </Menu.Target>
                <Menu.Dropdown>
                    <AiChartImageExportMenuItem
                        onClick={() => setOpened(true)}
                    />
                </Menu.Dropdown>
            </Menu>
            <AiChartImageExportModal
                chartRef={createRef<EChartsReact>()}
                chartName="Orders by status"
                opened={opened}
                onClose={() => setOpened(false)}
            />
        </>
    );
};

describe('AiChartImageExport', () => {
    it('opens the existing image export controls', async () => {
        render(
            <MantineProvider>
                <TestImageExport />
            </MantineProvider>,
        );

        await userEvent.click(screen.getByRole('button', { name: 'Actions' }));
        await userEvent.click(
            await screen.findByRole('menuitem', { name: 'Export image' }),
        );

        expect(screen.getByRole('dialog')).toBeVisible();
        expect(screen.getByText('Export Image')).toBeVisible();
        expect(screen.getByRole('textbox')).toHaveValue('PNG');
    });
});
