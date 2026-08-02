import { Group, Text } from '@mantine-8/core';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { PolymorphicGroupButton } from '../../../../../components/common/PolymorphicGroupButton';
import suggestionStyles from '../../../../../components/common/SuggestionList/SuggestionList.module.css';
import { type SlashCommandItem } from './slashCommandItems';
import classes from './SlashCommandMenuItem.module.css';

export const renderSlashCommandItem = (
    item: SlashCommandItem,
    isSelected: boolean,
    onClick: () => void,
) => (
    <PolymorphicGroupButton
        onClick={onClick}
        className={`${suggestionStyles.suggestionItem} ${classes.item}`}
        data-selected={isSelected}
    >
        <Group wrap="nowrap" gap={8}>
            <MantineIcon icon={item.icon} size={14} className={classes.icon} />
            <Text className={classes.label}>{item.label}</Text>
        </Group>
    </PolymorphicGroupButton>
);
