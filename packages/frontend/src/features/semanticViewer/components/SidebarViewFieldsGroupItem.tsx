import {
    assertUnreachable,
    FieldType as FieldKind,
    type SemanticLayerField,
    type SemanticLayerTimeDimension,
} from '@lightdash/common';
import { ActionIcon, Highlight, NavLink } from '@mantine/core';
import { useDisclosure, useHover } from '@mantine/hooks';
import { IconDots } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { getSelectedField } from '../store/selectors';
import {
    deselectField,
    isSemanticLayerStateTimeDimension,
    selectField,
    updateTimeDimensionGranularity,
} from '../store/semanticViewerSlice';
import FieldIcon from './FieldIcon';
import TimeDimensionGranularityPicker from './TimeDimensionGranularityPicker';

const getNavbarColorByFieldKind = (kind: SemanticLayerField['kind']) => {
    switch (kind) {
        case FieldKind.DIMENSION:
            return 'blue';
        case FieldKind.METRIC:
            return 'orange';
        default:
            return assertUnreachable(kind, `Unknown field kind ${kind}`);
    }
};

type SidebarViewFieldGroupItemProps = {
    field: SemanticLayerField;
    searchQuery: string;
};

const SidebarViewFieldGroupItem: FC<SidebarViewFieldGroupItemProps> = ({
    field,
    searchQuery,
}) => {
    const { ref, hovered } = useHover<HTMLAnchorElement>();
    const [isMenuOpen, { open: menuOpen, close: menuClose }] =
        useDisclosure(false);

    const dispatch = useAppDispatch();
    const selectedField = useAppSelector(getSelectedField(field.name));

    const handleSelect = <T extends SemanticLayerField>(f: T) => {
        dispatch(selectField(f));
    };

    const handleDeselect = <T extends SemanticLayerField>(f: T) => {
        dispatch(deselectField(f));
    };

    const handleUpdateTimeDimensionGranularity = (
        f: SemanticLayerTimeDimension,
    ) => {
        dispatch(updateTimeDimensionGranularity(f));
    };

    return (
        <NavLink
            ref={ref}
            label={
                <Highlight fz="xs" highlight={searchQuery.split(' ')} truncate>
                    {field.label}
                </Highlight>
            }
            component="a"
            disabled={!field.visible}
            active={!!selectedField}
            h={28}
            color={getNavbarColorByFieldKind(field.kind)}
            sx={(theme) => ({
                backgroundColor: theme.fn.lighten(theme.colors.gray[0], 0.5),
            })}
            icon={<FieldIcon field={field} size="md" />}
            rightSection={
                (selectedField || hovered || isMenuOpen) &&
                field.availableGranularities.length > 0 ? (
                    <TimeDimensionGranularityPicker
                        menuProps={{
                            opened: isMenuOpen,
                            onOpen: menuOpen,
                            onClose: menuClose,
                            arrowOffset: 10,
                            offset: -4,
                        }}
                        availableGranularities={field.availableGranularities}
                        value={
                            selectedField &&
                            isSemanticLayerStateTimeDimension(selectedField)
                                ? selectedField.granularity ?? null
                                : null
                        }
                        onChange={(granularity) =>
                            selectedField
                                ? handleUpdateTimeDimensionGranularity({
                                      ...field,
                                      ...selectedField,
                                      granularity,
                                  })
                                : handleSelect({
                                      ...field,
                                      granularity,
                                  })
                        }
                    >
                        <ActionIcon
                            component="div"
                            variant="transparent"
                            onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                            }}
                        >
                            <MantineIcon
                                icon={IconDots}
                                color="gray"
                                size="md"
                            />
                        </ActionIcon>
                    </TimeDimensionGranularityPicker>
                ) : null
            }
            onClick={() =>
                !!selectedField ? handleDeselect(field) : handleSelect(field)
            }
        />
    );
};

export default SidebarViewFieldGroupItem;
