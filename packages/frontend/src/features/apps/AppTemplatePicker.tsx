import { FeatureFlags, type DataAppTemplate } from '@lightdash/common';
import { Stack, Text, ThemeIcon } from '@mantine/core';
import { type CSSProperties, type FC } from 'react';
import { PolymorphicPaperButton } from '../../components/common/PolymorphicPaperButton';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import classes from './AppTemplatePicker.module.css';
import { getPickerTemplates } from './templates';

type Props = {
    selected: DataAppTemplate | null;
    onSelectedChange: (template: DataAppTemplate | null) => void;
};

// Fan geometry, derived from the card count. The fan keeps a FIXED footprint
// (the original hand-tuned four-card arch: outermost centres at ±249px,
// ±12° rotation, y rising 4px → 32px) and packs cards denser as the count
// grows, so more templates never overflow the panel. The vertical arch is
// quadratic so an odd count's centre card sits smoothly at the top of the
// curve. For four cards this reproduces the previously hardcoded values
// exactly (x ±83/±249, y 4/32, rot ±4°/±12°).
const FAN_X_MAX = 249;
const FAN_ROT_MAX = 12;
const FAN_Y_MIN = 0.5; // y at the fan's centre (unit = 0)
const FAN_Y_RANGE = 31.5; // added drop at the outermost card (unit = ±1)

const fanStyle = (index: number, count: number): CSSProperties => {
    const half = (count - 1) / 2;
    const unit = half === 0 ? 0 : (index - half) / half;
    return {
        '--x': `${unit * FAN_X_MAX}px`,
        '--y': `${FAN_Y_MIN + unit * unit * FAN_Y_RANGE}px`,
        '--rot': `${unit * FAN_ROT_MAX}deg`,
        zIndex: index + 1,
    } as CSSProperties;
};

const AppTemplatePicker: FC<Props> = ({ selected, onSelectedChange }) => {
    const templatesFlag = useServerFeatureFlag(
        FeatureFlags.EnableDataAppTemplates,
    );
    if (templatesFlag.isLoading) {
        // Hold the fan until the flag is known: painting the ungated cards
        // and then re-fanning when the flag resolves reads as the last card
        // popping in late. The empty fan keeps the layout height reserved.
        return <div className={classes.fan} />;
    }
    const pickerTemplates = getPickerTemplates(
        new Set(
            templatesFlag.data?.enabled
                ? [FeatureFlags.EnableDataAppTemplates]
                : [],
        ),
    );
    return (
        <div className={classes.fan}>
            {pickerTemplates.map((template, index) => {
                const Icon = template.icon;
                const isSelected = selected === template.id;
                return (
                    <PolymorphicPaperButton
                        key={template.id}
                        component="button"
                        type="button"
                        radius="md"
                        className={`${classes.card} ${isSelected ? classes.cardSelected : ''}`}
                        data-pos={index}
                        style={fanStyle(index, pickerTemplates.length)}
                        aria-pressed={isSelected}
                        data-selected={isSelected ? 'true' : undefined}
                        onClick={() =>
                            onSelectedChange(isSelected ? null : template.id)
                        }
                    >
                        <Stack gap="xs" align="flex-start">
                            <ThemeIcon
                                size="lg"
                                radius="md"
                                variant="light"
                                color="gray"
                                className={classes.cardIcon}
                            >
                                <Icon size={20} />
                            </ThemeIcon>
                            <Stack gap={4} className={classes.cardContent}>
                                <Text
                                    fw={600}
                                    size="sm"
                                    className={classes.cardTitle}
                                >
                                    {template.title}
                                </Text>
                                <Text size="xs" c="dimmed" lineClamp={3}>
                                    {template.description}
                                </Text>
                            </Stack>
                        </Stack>
                    </PolymorphicPaperButton>
                );
            })}
        </div>
    );
};

export default AppTemplatePicker;
