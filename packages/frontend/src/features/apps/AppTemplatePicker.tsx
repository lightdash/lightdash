import {
    type DataAppTemplate,
    type DataAppTemplateSummary,
} from '@lightdash/common';
import { Stack, Text, ThemeIcon } from '@mantine/core';
import { IconTemplate, type Icon as TablerIcon } from '@tabler/icons-react';
import { useState, type CSSProperties, type FC } from 'react';
import { PolymorphicPaperButton } from '../../components/common/PolymorphicPaperButton';
import classes from './AppTemplatePicker.module.css';
import { useTemplateGallery } from './hooks/useTemplateGallery';
import TemplateGalleryModal from './TemplateGalleryModal';
import { getPickerTemplates } from './templates';

type Props = {
    selected: DataAppTemplate | null;
    onSelectedChange: (template: DataAppTemplate | null) => void;
    // Organization template picked in the gallery; exclusive with `selected`.
    selectedOrgTemplate: DataAppTemplateSummary | null;
    onSelectedOrgTemplateChange: (
        template: DataAppTemplateSummary | null,
    ) => void;
};

// Fan geometry, derived from the card count. The fan keeps a FIXED footprint
// (the original hand-tuned four-card arch: outermost centres at ±249px,
// ±12° rotation) and packs cards denser as the count grows, so more templates
// never overflow the panel. The vertical arch is quadratic so an odd count's
// centre card sits smoothly at the top of the curve. For four cards this
// reproduces the previously hardcoded values exactly (x ±83/±249, y 4/32,
// rot ±4°/±12°).
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

type FanCardContent = {
    key: string;
    title: string;
    description: string;
    icon: TablerIcon;
    pressed: boolean;
    onClick: () => void;
};

const FanCard: FC<{ card: FanCardContent; index: number; count: number }> = ({
    card,
    index,
    count,
}) => {
    const Icon = card.icon;
    return (
        <PolymorphicPaperButton
            component="button"
            type="button"
            radius="md"
            className={`${classes.card} ${card.pressed ? classes.cardSelected : ''}`}
            data-pos={index}
            style={fanStyle(index, count)}
            aria-pressed={card.pressed}
            data-selected={card.pressed ? 'true' : undefined}
            onClick={card.onClick}
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
                    <Text fw={600} size="sm" className={classes.cardTitle}>
                        {card.title}
                    </Text>
                    <Text size="xs" c="dimmed" lineClamp={3}>
                        {card.description}
                    </Text>
                </Stack>
            </Stack>
        </PolymorphicPaperButton>
    );
};

const AppTemplatePicker: FC<Props> = ({
    selected,
    onSelectedChange,
    selectedOrgTemplate,
    onSelectedOrgTemplateChange,
}) => {
    const gallery = useTemplateGallery();
    const [galleryOpen, setGalleryOpen] = useState(false);
    if (gallery.isLoading) {
        // Hold the fan until the gallery's availability is known: painting
        // the built-in cards and then re-fanning when it resolves reads as
        // the last card popping in late. The empty fan keeps the layout
        // height reserved, and AppGenerate gates its first paint on these
        // same queries, so in practice the cache is settled before we mount.
        return <div className={classes.fan} />;
    }
    const pickerTemplates = getPickerTemplates();

    const cards: FanCardContent[] = pickerTemplates.map((template) => ({
        key: template.id,
        title: template.title,
        description: template.description,
        icon: template.icon,
        pressed: selected === template.id,
        onClick: () => {
            onSelectedOrgTemplateChange(null);
            onSelectedChange(selected === template.id ? null : template.id);
        },
    }));
    if (gallery.templates.length > 0) {
        // The gallery's entry point rides the fan as a synthetic card: it
        // never selects itself, it opens the gallery, and it reflects the
        // gallery selection (pressed state + the chosen template's name).
        cards.push({
            key: 'from-template',
            title: 'From Template',
            description: selectedOrgTemplate
                ? selectedOrgTemplate.name
                : 'Start from a ready-made app in the template gallery.',
            icon: IconTemplate,
            pressed: selectedOrgTemplate !== null,
            onClick: () => setGalleryOpen(true),
        });
    }

    return (
        <>
            <div className={classes.fan}>
                {cards.map((card, index) => (
                    <FanCard
                        key={card.key}
                        card={card}
                        index={index}
                        count={cards.length}
                    />
                ))}
            </div>
            <TemplateGalleryModal
                opened={galleryOpen}
                onClose={() => setGalleryOpen(false)}
                templates={gallery.templates}
                selectedSlug={selectedOrgTemplate?.slug ?? null}
                onSelect={(template) => {
                    onSelectedChange(null);
                    onSelectedOrgTemplateChange(
                        selectedOrgTemplate?.slug === template.slug
                            ? null
                            : template,
                    );
                    setGalleryOpen(false);
                }}
            />
        </>
    );
};

export default AppTemplatePicker;
