import { Box, Button, List, Text, Title } from '@mantine/core';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import MantineIcon from '../../components/common/MantineIcon';
import {
    getGroupDescription,
    getGroupLabel,
    GROUP_ORDER,
    type LearnModule,
} from './catalogue';
import { GROUP_ICONS, groupVars } from './groupVisuals';
import styles from './Learn.module.css';

type Props = {
    /** Whether the viewer may enable Learn (an organization admin). */
    canEnable: boolean;
    enabling: boolean;
    error: string | null;
    onEnable: () => void;
    /** The library that enabling unlocks, for the summary. */
    catalogue: LearnModule[];
};

/**
 * What the Learn page shows before the organization has a training
 * project (CS-257): what enabling unlocks, a button for admins and a
 * pointer to an admin for everyone else.
 */
export const EnableLearnPanel: FC<Props> = ({
    canEnable,
    enabling,
    error,
    onEnable,
    catalogue,
}) => {
    const { t } = useTranslation('learn');
    const groups = GROUP_ORDER.filter((group) =>
        catalogue.some((module) => module.group === group),
    );

    return (
        <Box className={styles.enableShell} data-learn-enable-panel>
            <Box className={styles.enableColumn}>
                <Box>
                    <Text
                        component="span"
                        className={`${styles.overline} ${styles.overlineAccent}`}
                    >
                        {t('enable.overline')}
                    </Text>
                    <Title order={1} className={styles.enableTitle}>
                        {t('enable.title')}
                    </Title>
                    <Text component="p" className={styles.enableLede}>
                        {t('enable.lede')}
                    </Text>
                </Box>

                <Box className={styles.enableGrid}>
                    <Box className={styles.enableGroups}>
                        {groups.map((group) => {
                            const Glyph = GROUP_ICONS[group];
                            return (
                                <Box
                                    key={group}
                                    className={styles.enableGroup}
                                    style={groupVars(group)}
                                >
                                    <Box
                                        component="span"
                                        className={styles.enableGroupIcon}
                                    >
                                        <MantineIcon icon={Glyph} size={18} />
                                    </Box>
                                    <Box>
                                        <Title order={3}>
                                            {getGroupLabel(group)}
                                        </Title>
                                        <Text component="p">
                                            {getGroupDescription(group)}
                                        </Text>
                                    </Box>
                                </Box>
                            );
                        })}
                    </Box>

                    <Box component="aside" className={styles.enableCard}>
                        <Text component="span" className={styles.overline}>
                            {t('enable.notEnabled')}
                        </Text>
                        {canEnable ? (
                            <>
                                <Title order={2}>
                                    {t('enable.adminTitle')}
                                </Title>
                                <Text component="p">
                                    {t('enable.adminIntro')}
                                </Text>
                                <List>
                                    <List.Item>
                                        {t('enable.effects.createsProject')}
                                    </List.Item>
                                    <List.Item>
                                        {t('enable.effects.grantsPermissions')}
                                    </List.Item>
                                    <List.Item>
                                        {t('enable.effects.makesAdmin')}
                                    </List.Item>
                                </List>
                                <Button
                                    color="indigo"
                                    size="md"
                                    mt={6}
                                    loading={enabling}
                                    onClick={onEnable}
                                    data-learn-enable
                                >
                                    {t('enable.button')}
                                </Button>
                            </>
                        ) : (
                            <>
                                <Title order={2}>
                                    {t('enable.askAdminTitle')}
                                </Title>
                                <Text component="p" data-learn-ask-admin>
                                    {t('enable.askAdminBody')}
                                </Text>
                            </>
                        )}
                        {error && (
                            <Text c="red" fz="sm" data-learn-enable-error>
                                {error}
                            </Text>
                        )}
                    </Box>
                </Box>
            </Box>
        </Box>
    );
};
