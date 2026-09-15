import type { Meta, StoryObj } from '@storybook/react-vite';
import { IconAppWindow, IconPencil } from '@tabler/icons-react';
import { QueryClientProvider } from '@tanstack/react-query';
import { useEffect, type FC, type PropsWithChildren } from 'react';
import { expect, fn } from 'storybook/test';
import AppUpdateModal from '../components/common/modal/AppUpdateModal';
import { createQueryClient } from '../providers/ReactQuery/createQueryClient';

const storyQueryClient = createQueryClient();

const MockUpdateRequest: FC<PropsWithChildren> = ({ children }) => {
    useEffect(() => {
        const originalFetch = window.fetch;
        window.fetch = async (input, init) => {
            const requestUrl =
                input instanceof Request ? input.url : input.toString();
            if (
                requestUrl.includes(
                    '/ee/projects/project-uuid/apps/chart-type-uuid',
                )
            ) {
                return new Response(
                    JSON.stringify({ status: 'ok', results: {} }),
                    { headers: { 'Content-Type': 'application/json' } },
                );
            }

            return originalFetch(input, init);
        };

        return () => {
            window.fetch = originalFetch;
        };
    }, []);

    return <>{children}</>;
};

const expectIconToAlignWithNameInput = async (
    icon: HTMLElement,
    nameInput: HTMLInputElement,
) => {
    await expect(
        Math.abs(
            icon.getBoundingClientRect().top -
                nameInput.getBoundingClientRect().top,
        ),
    ).toBeLessThanOrEqual(1);
};

const meta = {
    title: 'Chart types/Edit details modal',
    component: AppUpdateModal,
    args: {
        opened: true,
        onClose: fn(),
        projectUuid: 'project-uuid',
        uuid: 'chart-type-uuid',
        initialName: 'Stacked area chart',
        initialDescription: 'Compare revenue across regions over time.',
        resourceLabel: 'Chart Type',
        icon: IconPencil,
        iconPicker: { initialIcon: 'chart-area-line' },
    },
    decorators: [
        (renderStory) => (
            <MockUpdateRequest>
                <QueryClientProvider client={storyQueryClient}>
                    {renderStory()}
                </QueryClientProvider>
            </MockUpdateRequest>
        ),
    ],
} satisfies Meta<typeof AppUpdateModal>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Standard chart type details, including the icon/name control alignment. */
export const Default: Story = {};

/** The shared app form remains a straightforward two-field dialog. */
export const DataApp: Story = {
    args: {
        initialName: 'Sales insights',
        initialDescription: 'A concise view of weekly sales performance.',
        resourceLabel: 'Data App',
        icon: IconAppWindow,
        iconPicker: null,
    },
};

/** Long copy verifies wrapping and vertical rhythm in a normal desktop dialog. */
export const LongContent: Story = {
    args: {
        initialName:
            'Revenue, retention, and conversion by acquisition channel',
        initialDescription:
            'Compare revenue, customer retention, and conversion performance across acquisition channels, campaign cohorts, and reporting periods.',
    },
};

/** Clear the required name field to inspect validation alongside the icon picker. */
export const ValidationError: Story = {
    play: async ({ canvasElement, userEvent }) => {
        const modal =
            canvasElement.ownerDocument.querySelector<HTMLElement>(
                '[role="dialog"]',
            );
        const icon = modal?.querySelector<HTMLElement>(
            'button[aria-label="Chart type icon"]',
        );
        const nameInput = modal?.querySelector<HTMLInputElement>(
            'input[data-path="name"]',
        );
        if (!icon || !nameInput) {
            throw new Error('Chart type edit controls did not render');
        }

        await expectIconToAlignWithNameInput(icon, nameInput);
        await userEvent.clear(nameInput);
        await expectIconToAlignWithNameInput(icon, nameInput);
    },
};

/** The modal keeps both form controls usable at a phone-width viewport. */
export const NarrowViewport: Story = {
    parameters: {
        chromatic: { viewports: [390] },
    },
};
