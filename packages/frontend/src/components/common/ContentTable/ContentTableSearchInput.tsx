import {
    ActionIcon,
    TextInput,
    Tooltip,
    type TextInputProps,
} from '@mantine-8/core';
import { IconSearch, IconX } from '@tabler/icons-react';
import { memo, type CSSProperties } from 'react';
import MantineIcon from '../MantineIcon';
import classes from './ContentTable.module.css';

type CssSize = number | string;

export type ContentTableSearchInputProps = Omit<
    TextInputProps,
    | 'classNames'
    | 'leftSection'
    | 'onChange'
    | 'rightSection'
    | 'style'
    | 'type'
    | 'value'
> & {
    collapsedWidth?: CssSize;
    expandedWidth?: CssSize;
    onChange: (value: string) => void;
    style?: CSSProperties;
    tooltipLabel?: string;
    value: string;
};

const toCssSize = (value: CssSize | undefined) =>
    typeof value === 'number' ? `${value}px` : value;

const ContentTableSearchInputComponent = ({
    collapsedWidth,
    expandedWidth,
    onChange,
    placeholder = 'Search...',
    style,
    tooltipLabel,
    value,
    ...rest
}: ContentTableSearchInputProps) => {
    const hasValue = value.length > 0;
    const input = (
        <TextInput
            {...rest}
            size={rest.size ?? 'xs'}
            radius={rest.radius ?? 'md'}
            type="search"
            variant={rest.variant ?? 'default'}
            placeholder={placeholder}
            value={value}
            classNames={{
                input: hasValue
                    ? `${classes.searchInput} ${classes.searchInputWithValue}`
                    : classes.searchInput,
            }}
            leftSection={
                <MantineIcon size="md" color="ldGray.6" icon={IconSearch} />
            }
            rightSection={
                hasValue ? (
                    <ActionIcon
                        aria-label="Clear search"
                        onClick={() => onChange('')}
                        variant="transparent"
                        size="xs"
                        color="ldGray.5"
                    >
                        <MantineIcon icon={IconX} />
                    </ActionIcon>
                ) : null
            }
            onChange={(event) => onChange(event.currentTarget.value)}
            style={
                {
                    '--content-table-search-width': toCssSize(collapsedWidth),
                    '--content-table-search-expanded-width':
                        toCssSize(expandedWidth),
                    ...style,
                } as CSSProperties
            }
        />
    );

    if (!tooltipLabel) {
        return input;
    }

    return (
        <Tooltip withinPortal variant="xs" label={tooltipLabel}>
            {input}
        </Tooltip>
    );
};

export const ContentTableSearchInput = memo(ContentTableSearchInputComponent);
ContentTableSearchInput.displayName = 'ContentTableSearchInput';
