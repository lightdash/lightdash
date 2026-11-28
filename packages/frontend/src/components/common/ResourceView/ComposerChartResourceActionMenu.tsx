import { type ResourceViewComposerChartItem } from '@lightdash/common';
import { ActionIcon, Menu, Tooltip } from '@mantine/core';
import {
    IconDots,
    IconEdit,
    IconFolderSymlink,
    IconTrash,
} from '@tabler/icons-react';
import { AskAiAgentMenuItem } from '../../../ee/features/aiCopilot/components/AskAiAgentMenuItem/AskAiAgentMenuItem';
import { useAskAiAgentAction } from '../../../ee/features/aiCopilot/components/AskAiAgentMenuItem/useAskAiAgentAction';
import { useCanWriteComposerChart } from '../../../features/composerCharts/hooks/useCanWriteComposerChart';
import MantineIcon from '../MantineIcon';
import type { ResourceViewActionMenuProps } from './ResourceActionMenu';
import { ResourceViewItemAction } from './types';

type Props = Omit<ResourceViewActionMenuProps, 'item'> & {
    item: ResourceViewComposerChartItem;
};

/** Pin, favourite, duplicate, verify, promote and sharing do not apply to composer charts. */
const ComposerChartResourceActionMenu = ({
    item,
    disabled,
    isOpen,
    onOpen,
    onClose,
    onAction,
}: Props) => {
    const { projectUuid, uuid, spaceUuid } = item.data;
    const askAiProps = {
        projectUuid,
        composerChartUuid: uuid,
        clickedFrom: 'resource_action_menu',
    } as const;
    const { canAsk } = useAskAiAgentAction(askAiProps);
    const canWrite = useCanWriteComposerChart(projectUuid, spaceUuid);
    if (!canAsk && !canWrite) return null;
    return (
        <Menu
            disabled={disabled}
            opened={isOpen}
            onOpen={onOpen}
            onClose={onClose}
        >
            <Menu.Target>
                <Tooltip label="Chart actions">
                    <ActionIcon
                        disabled={disabled}
                        aria-label="Chart actions"
                        data-testid={`ResourceViewActionMenu/${item.data.name}`}
                    >
                        <MantineIcon icon={IconDots} />
                    </ActionIcon>
                </Tooltip>
            </Menu.Target>
            <Menu.Dropdown>
                {canWrite && (
                    <>
                        <Menu.Item
                            leftSection={<MantineIcon icon={IconEdit} />}
                            onClick={() =>
                                onAction({
                                    type: ResourceViewItemAction.UPDATE,
                                    item,
                                })
                            }
                        >
                            Rename
                        </Menu.Item>
                        <Menu.Item
                            leftSection={
                                <MantineIcon icon={IconFolderSymlink} />
                            }
                            onClick={() =>
                                onAction({
                                    type: ResourceViewItemAction.TRANSFER_TO_SPACE,
                                    item,
                                })
                            }
                        >
                            Move
                        </Menu.Item>
                    </>
                )}
                {canAsk && <AskAiAgentMenuItem {...askAiProps} />}
                {canWrite && (
                    <>
                        <Menu.Divider />
                        <Menu.Item
                            color="red"
                            leftSection={<MantineIcon icon={IconTrash} />}
                            onClick={() =>
                                onAction({
                                    type: ResourceViewItemAction.DELETE,
                                    item,
                                })
                            }
                        >
                            Delete
                        </Menu.Item>
                    </>
                )}
            </Menu.Dropdown>
        </Menu>
    );
};

export default ComposerChartResourceActionMenu;
