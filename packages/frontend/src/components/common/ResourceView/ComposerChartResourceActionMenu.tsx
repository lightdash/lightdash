import { type ResourceViewComposerChartItem } from '@lightdash/common';
import { ActionIcon, Menu, Tooltip } from '@mantine/core';
import { IconDots } from '@tabler/icons-react';
import { AskAiAgentMenuItem } from '../../../ee/features/aiCopilot/components/AskAiAgentMenuItem/AskAiAgentMenuItem';
import { useAskAiAgentAction } from '../../../ee/features/aiCopilot/components/AskAiAgentMenuItem/useAskAiAgentAction';
import MantineIcon from '../MantineIcon';
import type { ResourceViewActionMenuProps } from './ResourceActionMenu';

type Props = Omit<ResourceViewActionMenuProps, 'item'> & {
    item: ResourceViewComposerChartItem;
};

/** Ask AI only for now; the menu is hidden when the user cannot ask. */
const ComposerChartResourceActionMenu = ({
    item,
    disabled,
    isOpen,
    onOpen,
    onClose,
}: Props) => {
    const { projectUuid, uuid } = item.data;
    const askAiProps = {
        projectUuid,
        composerChartUuid: uuid,
        clickedFrom: 'resource_action_menu',
    } as const;
    const { canAsk } = useAskAiAgentAction(askAiProps);
    if (!canAsk) return null;
    return (
        <Menu
            disabled={disabled}
            opened={isOpen}
            onOpen={onOpen}
            onClose={onClose}
        >
            <Menu.Target>
                <Tooltip label="Chart actions">
                    <ActionIcon disabled={disabled} aria-label="Chart actions">
                        <MantineIcon icon={IconDots} />
                    </ActionIcon>
                </Tooltip>
            </Menu.Target>
            <Menu.Dropdown>
                <AskAiAgentMenuItem {...askAiProps} />
            </Menu.Dropdown>
        </Menu>
    );
};

export default ComposerChartResourceActionMenu;
