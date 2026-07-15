import { Group, Stack, Text } from '@mantine-8/core';
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
        className={suggestionStyles.suggestionItem}
        data-selected={isSelected}
    >
        <Group wrap="nowrap" gap="xs">
            <div className={classes.iconSquare}>
                <MantineIcon icon={item.icon} size={14} />
            </div>
            <Stack gap={0} className={classes.text}>
                <Text className={classes.label}>{item.label}</Text>
                <Text className={classes.description} truncate>
                    {item.description}
                </Text>
            </Stack>
        </Group>
    </PolymorphicGroupButton>
);
