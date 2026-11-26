/** Icons for sources and fields. */
import { type WarehouseTypes } from '@lightdash/common';
import { Image } from '@mantine/core';
import { IconBroadcast, IconDatabase, IconFileSpreadsheet, IconFileTypeCsv, IconFolder, IconSql, type Icon } from '@tabler/icons-react';
import clsx from 'clsx';
import { type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import dbtLogo from '../../components/ProjectConnection/ProjectConnectFlow/Assets/dbt.svg';
import { WarehouseTypeLabels } from '../../components/ProjectConnection/ProjectConnectFlow/utils';
import {
    getLiveSource,
    getLiveSourceIconClass,
} from '../../features/externalConnections/liveSources/liveSourceCatalog';
import googleSheetsLogo from '../../svgs/google-sheets.svg';
import { KindTypeIcon } from './KindTypeIcon';
import {
    getExplore,
    getSource,
    sourceWarehouse,
    type Field,
    type FieldKind,
    type Kind,
    type NodeRef,
    type Project,
    type Source,
} from './model';
import classes from './shared.module.css';
import { TableIcon } from '../../components/common/ContentIcons';

// ---------------------------------------------------------------------------
// Icons

const Logo: FC<{ src: string; size: number }> = ({ src, size }) => (
    <Image
        src={src}
        alt=""
        w={size}
        h={size}
        className={clsx(classes.logo, getLiveSourceIconClass(src))}
    />
);

const WarehouseLogo: FC<{ type: string; size: number }> = ({ type, size }) => {
    const item = WarehouseTypeLabels.find(
        ({ key }) => key === (type as WarehouseTypes),
    );
    return item?.iconType === 'image' ? (
        <Logo src={item.image} size={size} />
    ) : (
        <MantineIcon icon={IconDatabase} size={size} color="dimmed" />
    );
};

const KIND_ICONS: Record<Kind, Icon> = {
    modelled: IconDatabase,
    sqlViews: IconSql,
    files: IconFileSpreadsheet,
    live: IconBroadcast,
};

const SourceLogo: FC<{ source: Source; size?: number }> = ({
    source,
    size = 16,
}) => {
    switch (source.type) {
        case 'dbt':
            return <Logo src={dbtLogo} size={size} />;
        case 'sqlView':
            return <MantineIcon icon={IconSql} size={size} color="dimmed" />;
        case 'csv':
            return (
                <MantineIcon
                    icon={IconFileTypeCsv}
                    size={size}
                    color="dimmed"
                />
            );
        case 'sheets':
            return <Logo src={googleSheetsLogo} size={size} />;
        case 'live':
            return source.integration ? (
                <Logo
                    src={getLiveSource(source.integration).icon}
                    size={size}
                />
            ) : (
                <MantineIcon icon={IconBroadcast} size={size} color="dimmed" />
            );
        default:
            return null;
    }
};

export const KindIcon: FC<{ kind: Kind; size?: number }> = ({
    kind,
    size = 16,
}) => <MantineIcon icon={KIND_ICONS[kind]} size={size} color="dimmed" />;

export const FieldTypeIcon: FC<{ field: Field; size?: 'md' | 'lg' }> = ({
    field,
    size = 'md',
}) => (
    <KindTypeIcon
        fieldKind={field.fieldKind}
        type={field.type}
        name={field.name}
        size={size}
    />
);

/** The icon for any node: the source's own logo wins over generic icons. */
export const NodeIcon: FC<{
    project: Project;
    nodeRef: NodeRef;
    size?: number;
    /** Search results know a field's kind before its explore loads. */
    fieldKind?: FieldKind;
}> = ({ project, nodeRef, size = 16, fieldKind = 'dimension' }) => {
    switch (nodeRef.type) {
        case 'kind':
            // The semantic layer is the warehouse it runs on.
            return nodeRef.kind === 'modelled' && project.warehouse ? (
                <WarehouseLogo type={project.warehouse.type} size={size} />
            ) : (
                <KindIcon kind={nodeRef.kind} size={size} />
            );
        case 'source': {
            const source = getSource(project, nodeRef.sourceId);
            const warehouse =
                source.kind === 'modelled'
                    ? sourceWarehouse(project, source)
                    : undefined;
            return warehouse ? (
                <WarehouseLogo type={warehouse.type} size={size} />
            ) : (
                <SourceLogo source={source} size={size} />
            );
        }
        case 'group':
            return <MantineIcon icon={IconFolder} size={size} color="dimmed" />;
        case 'explore': {
            const explore = getExplore(project, nodeRef.exploreId);
            const source = getSource(project, explore.sourceId);
            // A live source shows its logo on the source row above its
            // explores, however many it has
            return source.type === 'dbt' || source.type === 'live' ? (
                <MantineIcon icon={TableIcon} size={size} color="dimmed" />
            ) : (
                <SourceLogo source={source} size={size} />
            );
        }
        case 'field':
            return (
                <KindTypeIcon
                    fieldKind={fieldKind}
                    type={fieldKind === 'metric' ? 'number' : 'string'}
                    name={nodeRef.fieldId}
                />
            );
        default:
            return null;
    }
};
