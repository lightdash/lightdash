import { type HomepageOpening } from '@lightdash/common';
import { Menu, Text } from '@mantine-8/core';
import { IconCheck, IconLayoutNavbarExpand } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import classes from './adminHomepageControls.module.css';
import { useHomepageAiState } from './hooks/useHomepageAiState';
import {
    useHomepageSettings,
    useUpdateHomepageOpening,
} from './hooks/useHomepageSettings';

const OPTIONS: {
    value: HomepageOpening;
    label: string;
    description: string;
    /** Which schematic row is the composer, top-down. */
    composerRow: 0 | 1;
}[] = [
    {
        value: 'ask-first',
        label: 'Ask first',
        description: 'Opens on the AI composer, with content below it.',
        composerRow: 0,
    },
    {
        value: 'content-first',
        label: 'Content first',
        description:
            'Opens on a greeting and quick actions. Ask AI stays a click away.',
        composerRow: 1,
    },
];

/** A schematic of where the composer sits, so the choice reads at a glance
 * rather than only as words. */
const OpeningPreview: FC<{ composerRow: 0 | 1 }> = ({ composerRow }) => (
    <div className={classes.previewFrame} aria-hidden="true">
        {[0, 1].map((row) => (
            <div
                key={row}
                className={
                    row === composerRow
                        ? classes.previewComposer
                        : classes.previewContent
                }
            />
        ))}
    </div>
);

/**
 * Lets an admin choose what the homepage opens on. Only rendered when the
 * project actually has AI available — without it there's no choice to make,
 * and offering one would imply a composer that can't answer anything.
 */
export const OpeningChoiceMenu: FC<{ projectUuid: string }> = ({
    projectUuid,
}) => {
    const { canAskAi } = useHomepageAiState(projectUuid);
    const { data: settings } = useHomepageSettings(projectUuid);
    const { mutate: setOpening } = useUpdateHomepageOpening(projectUuid);
    // No stored choice reads as ask-first here, which is what the viewer gets.
    const current = settings?.opening ?? 'ask-first';

    if (!canAskAi) return null;

    return (
        <Menu position="bottom-end" withinPortal>
            <Menu.Target>
                <button
                    type="button"
                    className={classes.tbBtn}
                    aria-label="Change what the homepage opens on"
                >
                    <MantineIcon icon={IconLayoutNavbarExpand} size={15} />
                    <span className={classes.tbBtnLabel} aria-hidden="true">
                        Opening
                    </span>
                </button>
            </Menu.Target>
            <Menu.Dropdown>
                <Menu.Label>What this homepage opens on</Menu.Label>
                {OPTIONS.map((option) => (
                    <Menu.Item
                        key={option.value}
                        onClick={() => setOpening(option.value)}
                        leftSection={
                            <OpeningPreview composerRow={option.composerRow} />
                        }
                        rightSection={
                            option.value === current ? (
                                <MantineIcon icon={IconCheck} size={14} />
                            ) : null
                        }
                    >
                        <Text size="sm" fw={500}>
                            {option.label}
                        </Text>
                        <Text size="xs" c="dimmed" maw={230}>
                            {option.description}
                        </Text>
                    </Menu.Item>
                ))}
            </Menu.Dropdown>
        </Menu>
    );
};
