import {
    assertUnreachable,
    getContrastTextColor,
    type HomepageCtaAlign,
    type HomepageCtaBackground,
    type HomepageCtaBlock,
    type HomepageCtaTarget,
    type HomepageCtaTheme,
    type OrganizationBrandColor,
} from '@lightdash/common';
import {
    ColorInput,
    Group,
    SegmentedControl,
    Select,
    Stack,
    Text,
    TextInput,
    Tooltip,
} from '@mantine-8/core';
import { type CSSProperties, type FC } from 'react';
import { Link } from 'react-router';
import { useProjectColorPalette } from '../../../../hooks/appearance/useProjectColorPalette';
import { useOrganizationBrand } from '../../../../hooks/organization/useOrganizationBrand';
import useTracking from '../../../../providers/Tracking/useTracking';
import { EventName } from '../../../../types/Events';
import { useHomepageAiState } from '../hooks/useHomepageAiState';
import { useReportRuntimeEmpty } from '../hooks/useRuntimeEmptyBlocks';
import classes from './blockStyles.module.css';
import { type BlockComponentProps, type BuildComponentProps } from './types';

type CtaConfig = HomepageCtaBlock['config'];

const targetUrl = (target: HomepageCtaTarget, projectUuid: string): string => {
    switch (target.type) {
        case 'ask-ai':
            return `/projects/${projectUuid}/ai-agents`;
        case 'run-query':
            return `/projects/${projectUuid}/tables`;
        case 'browse-dashboards':
            return `/projects/${projectUuid}/dashboards`;
        case 'browse-spaces':
            return `/projects/${projectUuid}/spaces`;
        case 'dashboard':
            return `/projects/${projectUuid}/dashboards/${target.dashboardUuid}/view`;
        case 'link':
            return target.url;
        default:
            return assertUnreachable(target, 'Unknown CTA target');
    }
};

const pickBrandHex = (
    colors: OrganizationBrandColor[] | undefined,
    kind: 'brand' | 'accent',
): string | null => {
    if (!colors || colors.length === 0) return null;
    const preferred =
        kind === 'brand'
            ? ['brand', 'accent', 'dark']
            : ['accent', 'brand', 'dark'];
    for (const type of preferred) {
        const match = colors.find(
            (color) =>
                color.type === type && /^#?[0-9a-f]{6}$/i.test(color.hex),
        );
        if (match)
            return match.hex.startsWith('#') ? match.hex : `#${match.hex}`;
    }
    return null;
};

const DARK_SURFACE = '#101113';

const isHex = (value: string | undefined): value is string =>
    !!value && /^#[0-9a-f]{6}$/i.test(value.trim());

/** What a theme token paints with, before deciding where it's applied. */
type CtaPaint = { kind: 'neutral' } | { kind: 'solid'; hex: string };

const resolveCtaPaint = (
    theme: HomepageCtaTheme,
    brandColors: OrganizationBrandColor[] | undefined,
    customColor: string | undefined,
): CtaPaint => {
    switch (theme) {
        case 'neutral':
            return { kind: 'neutral' };
        case 'dark':
            return { kind: 'solid', hex: DARK_SURFACE };
        case 'custom':
            return {
                kind: 'solid',
                hex: isHex(customColor) ? customColor : DARK_SURFACE,
            };
        case 'brand':
        case 'accent': {
            const hex = pickBrandHex(brandColors, theme);
            return { kind: 'solid', hex: hex ?? DARK_SURFACE };
        }
        default:
            return assertUnreachable(theme, 'Unknown CTA theme');
    }
};

const textOn = (hex: string): string =>
    getContrastTextColor(hex) === 'black' ? '#1a1b1e' : '#ffffff';

/** Inline paint vars for one surface (the banner or the button). */
const paintStyle = (paint: CtaPaint, prefix: 'cta' | 'cta-btn') => {
    if (paint.kind === 'neutral') return undefined;
    return {
        [`--${prefix}-bg`]: paint.hex,
        [`--${prefix}-fg`]: textOn(paint.hex),
    } as CSSProperties;
};

const CtaBanner: FC<{
    config: CtaConfig;
    projectUuid: string;
    interactive: boolean;
    onNavigate?: () => void;
}> = ({ config, projectUuid, interactive, onNavigate }) => {
    const { data: brand } = useOrganizationBrand();
    const theme = config.theme ?? 'brand';
    const background = config.background ?? 'none';
    const align = config.align ?? 'center';
    const paint = resolveCtaPaint(theme, brand?.colors, config.customColor);
    // A themed background carries the paint and the button inverts it; any
    // other background leaves the paint to the button itself.
    const onBanner =
        background === 'theme' ? paint : { kind: 'neutral' as const };
    const onButton =
        background !== 'theme' ? paint : { kind: 'neutral' as const };
    const fill = background === 'theme' ? 'banner' : 'button';
    const styleVars = {
        ...paintStyle(onBanner, 'cta'),
        ...paintStyle(onButton, 'cta-btn'),
    } as CSSProperties;
    const hasTitle = (config.title ?? '').trim() !== '';
    const body = (
        <>
            {hasTitle ? (
                <div className={classes.ctaBody}>
                    <div className={classes.ctaTitle}>{config.title}</div>
                    {config.description ? (
                        <div className={classes.ctaDesc}>
                            {config.description}
                        </div>
                    ) : null}
                </div>
            ) : null}
            <span className={classes.ctaButton} data-fill={fill}>
                {config.buttonLabel}
            </span>
        </>
    );
    const shared = {
        className: interactive
            ? `${classes.ctaBanner} ${classes.plainLink} ${classes.clickable}`
            : classes.ctaBanner,
        'data-theme': theme,
        'data-bg': background,
        'data-align': align,
        'data-buttononly': !hasTitle,
        style: styleVars,
    };
    if (!interactive) {
        return <div {...shared}>{body}</div>;
    }
    const url = targetUrl(config.target, projectUuid);
    return config.target.type === 'link' ? (
        <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onNavigate}
            {...shared}
        >
            {body}
        </a>
    ) : (
        <Link to={url} onClick={onNavigate} {...shared}>
            {body}
        </Link>
    );
};

export const CtaBlockView: FC<BlockComponentProps> = ({
    block,
    projectUuid,
}) => {
    const { canAskAi } = useHomepageAiState(projectUuid);
    const { track } = useTracking();
    const config = block.type === 'cta' ? block.config : null;
    // An ask-ai CTA is a dead button for viewers without AI — the page is
    // told at runtime so the row collapses instead of leaving a gap.
    const hidden = config?.target.type === 'ask-ai' && !canAskAi;
    useReportRuntimeEmpty(block.id, hidden === true, false);
    if (!config || hidden) return null;
    return (
        <CtaBanner
            config={config}
            projectUuid={projectUuid}
            interactive
            onNavigate={() =>
                track({
                    name: EventName.HOMEPAGE_QUICK_ACTION_CLICKED,
                    properties: { actionType: `cta-${config.target.type}` },
                })
            }
        />
    );
};

const THEME_OPTIONS: {
    value: Exclude<HomepageCtaTheme, 'custom'>;
    label: string;
}[] = [
    { value: 'brand', label: 'Brand' },
    { value: 'accent', label: 'Accent' },
    { value: 'dark', label: 'Dark' },
    { value: 'neutral', label: 'Neutral' },
];

const ThemeSwatches: FC<{
    value: HomepageCtaTheme;
    customColor: string | undefined;
    paletteSwatches: string[];
    onChange: (theme: HomepageCtaTheme, customColor?: string) => void;
}> = ({ value, customColor, paletteSwatches, onChange }) => {
    const { data: brand } = useOrganizationBrand();
    return (
        <Group gap={6} wrap="nowrap">
            {THEME_OPTIONS.map((option) => {
                const paint = resolveCtaPaint(
                    option.value,
                    brand?.colors,
                    undefined,
                );
                const style = paintStyle(paint, 'cta');
                return (
                    <Tooltip
                        key={option.value}
                        label={option.label}
                        openDelay={200}
                    >
                        <button
                            type="button"
                            aria-label={`${option.label} theme`}
                            className={classes.ctaSwatch}
                            data-selected={value === option.value}
                            data-neutral={paint.kind === 'neutral'}
                            style={style}
                            onClick={() => onChange(option.value)}
                        />
                    </Tooltip>
                );
            })}
            <ColorInput
                size="xs"
                w={130}
                placeholder="Custom"
                value={value === 'custom' ? (customColor ?? '') : ''}
                swatches={paletteSwatches}
                swatchesPerRow={paletteSwatches.length > 0 ? 10 : undefined}
                onChangeEnd={(hex) => onChange('custom', hex)}
            />
        </Group>
    );
};

type TargetChoice =
    | 'run-query'
    | 'ask-ai'
    | 'browse-dashboards'
    | 'browse-spaces'
    | 'link';

const TARGET_OPTIONS: { value: TargetChoice; label: string }[] = [
    { value: 'run-query', label: 'Run a query' },
    { value: 'ask-ai', label: 'Ask AI' },
    { value: 'browse-dashboards', label: 'Browse dashboards' },
    { value: 'browse-spaces', label: 'Browse spaces' },
    { value: 'link', label: 'Custom link' },
];

export const CtaBlockBuild: FC<BuildComponentProps> = ({
    block,
    projectUuid,
    onChange,
}) => {
    // Custom-color swatches come from the project's resolved chart palette,
    // which already falls back to the org's active palette.
    const { data: palette } = useProjectColorPalette(projectUuid);
    if (block.type !== 'cta') return null;
    const config = block.config;
    const patch = (partial: Partial<CtaConfig>) =>
        onChange({ ...block, config: { ...config, ...partial } });
    // A stored dashboard target (config-as-code) keeps rendering; the picker
    // covers the built-in destinations plus a free URL.
    const targetChoice: TargetChoice =
        config.target.type === 'dashboard' ? 'link' : config.target.type;
    return (
        <Stack gap="sm">
            <CtaBanner
                config={config}
                projectUuid={projectUuid}
                interactive={false}
            />
            <Group gap="xs" align="flex-end" wrap="nowrap">
                <TextInput
                    size="xs"
                    label="Title"
                    placeholder="Optional — leave empty for a button-only banner"
                    fw={600}
                    flex={1}
                    value={config.title ?? ''}
                    onChange={(e) =>
                        patch({ title: e.currentTarget.value || undefined })
                    }
                />
            </Group>
            <TextInput
                size="xs"
                label="Supporting line"
                placeholder="Optional"
                value={config.description ?? ''}
                onChange={(e) =>
                    patch({ description: e.currentTarget.value || undefined })
                }
            />
            <Group gap="xs" align="flex-end" wrap="nowrap">
                <TextInput
                    size="xs"
                    label="Button label"
                    w={180}
                    value={config.buttonLabel}
                    onChange={(e) =>
                        patch({ buttonLabel: e.currentTarget.value })
                    }
                />
                <Select
                    size="xs"
                    label="Button leads to"
                    flex={1}
                    data={TARGET_OPTIONS}
                    value={targetChoice}
                    allowDeselect={false}
                    onChange={(next) => {
                        if (!next) return;
                        patch({
                            target:
                                next === 'link'
                                    ? { type: 'link', url: '' }
                                    : {
                                          type: next as Exclude<
                                              TargetChoice,
                                              'link'
                                          >,
                                      },
                        });
                    }}
                />
            </Group>
            {config.target.type === 'link' && (
                <TextInput
                    size="xs"
                    label="URL"
                    placeholder="https://…"
                    value={config.target.url}
                    onChange={(e) =>
                        patch({
                            target: {
                                type: 'link',
                                url: e.currentTarget.value,
                            },
                        })
                    }
                />
            )}
            <Group gap="lg" align="flex-end">
                <Stack gap={4}>
                    <Text size="xs" fw={500}>
                        Theme
                    </Text>
                    <ThemeSwatches
                        value={config.theme ?? 'brand'}
                        customColor={config.customColor}
                        paletteSwatches={palette?.colors ?? []}
                        onChange={(theme, customColor) =>
                            patch(
                                theme === 'custom'
                                    ? { theme, customColor }
                                    : { theme },
                            )
                        }
                    />
                </Stack>
                <Stack gap={4}>
                    <Text size="xs" fw={500}>
                        Background
                    </Text>
                    <SegmentedControl
                        size="xs"
                        value={config.background ?? 'none'}
                        onChange={(next) =>
                            patch({
                                background: next as HomepageCtaBackground,
                            })
                        }
                        data={[
                            { value: 'none', label: 'None' },
                            { value: 'card', label: 'Card' },
                            { value: 'theme', label: 'Themed' },
                        ]}
                    />
                </Stack>
                {(config.title ?? '').trim() === '' && (
                    <Stack gap={4}>
                        <Text size="xs" fw={500}>
                            Align
                        </Text>
                        <SegmentedControl
                            size="xs"
                            value={config.align ?? 'center'}
                            onChange={(next) =>
                                patch({ align: next as HomepageCtaAlign })
                            }
                            data={[
                                { value: 'left', label: 'Left' },
                                { value: 'center', label: 'Middle' },
                                { value: 'right', label: 'Right' },
                            ]}
                        />
                    </Stack>
                )}
            </Group>
            <Text size="xs" c="dimmed">
                Brand, Accent, and the gradients use your organization's brand
                colors from Settings → Appearance.
            </Text>
        </Stack>
    );
};
