import { Menu } from '@mantine-8/core';
import { IconClipboardPlus } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { useCreateIssueAction } from './useCreateIssueAction';

type Props = {
    projectUuid: string | undefined;
    chartUuid?: string;
    dashboardUuid?: string;
    tileUuid?: string;
    /**
     * Render a `<Menu.Divider />` after the item. Only rendered when the item
     * itself is visible, so callers don't need to gate it.
     */
    withDivider?: boolean;
};

/**
 * Menu item that opens the create-issue modal pre-filled with the content's
 * context. Renders nothing when the user can't create issues (not org admin,
 * AI agents disabled, or no project).
 */
export const CreateIssueMenuItem: FC<Props> = ({
    projectUuid,
    chartUuid,
    dashboardUuid,
    tileUuid,
    withDivider = false,
}) => {
    const { canCreate, handleClick } = useCreateIssueAction({
        projectUuid,
        chartUuid,
        dashboardUuid,
        tileUuid,
    });

    if (!canCreate) return null;

    return (
        <>
            <Menu.Item
                leftSection={<MantineIcon icon={IconClipboardPlus} />}
                onClick={handleClick}
            >
                Create issue
            </Menu.Item>
            {withDivider && <Menu.Divider />}
        </>
    );
};
