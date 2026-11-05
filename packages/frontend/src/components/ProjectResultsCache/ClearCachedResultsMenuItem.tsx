import { Menu } from '@mantine/core';
import { IconDatabaseX } from '@tabler/icons-react';
import { type FC } from 'react';
import {
    useInvalidateContentResultsCache,
    type ResultsCacheContent,
} from '../../hooks/useProjectResultsCacheSettings';
import MantineIcon from '../common/MantineIcon';
import MantineModal from '../common/MantineModal';
import { useCanClearCachedResults } from './useCanClearCachedResults';

type MenuItemProps = {
    projectUuid: string | undefined;
    onClick: () => void;
};

export const ClearCachedResultsMenuItem: FC<MenuItemProps> = ({
    projectUuid,
    onClick,
}) => {
    const canClearCache = useCanClearCachedResults(projectUuid);
    if (!canClearCache) return null;

    return (
        <Menu.Item
            leftSection={<MantineIcon icon={IconDatabaseX} />}
            onClick={onClick}
        >
            Clear cache for everyone
        </Menu.Item>
    );
};

const DESCRIPTIONS: Record<ResultsCacheContent['type'], string> = {
    chart: 'Cached results for this chart are cleared for every user, including on dashboards and embeds. The next person to open it waits for a fresh warehouse query.',
    dashboard:
        'Cached results for every tile on this dashboard are cleared for every user, including embedded viewers. The next person to open it waits for fresh warehouse queries.',
};

type ModalProps = {
    opened: boolean;
    onClose: () => void;
    content: ResultsCacheContent;
};

export const ClearCachedResultsModal: FC<ModalProps> = ({
    opened,
    onClose,
    content,
}) => {
    const { mutate: invalidateCache, isLoading } =
        useInvalidateContentResultsCache();

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title="Clear cached results for everyone?"
            role="alertdialog"
            description={DESCRIPTIONS[content.type]}
            confirmLabel="Clear for everyone"
            confirmLoading={isLoading}
            onConfirm={() => invalidateCache(content, { onSettled: onClose })}
        />
    );
};
