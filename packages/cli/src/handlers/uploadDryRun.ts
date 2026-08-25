import { assertUnreachable } from '@lightdash/common'; // pragma: allowlist secret
import { Command } from 'commander';
import { promises as fs } from 'fs';
import * as styles from '../styles';
import {
    assertCodeResourceFilesValid,
    readCodeResourceFiles,
} from './contentAsCode/resource';
import { getDownloadFolder } from './contentAsCodePaths';
import { CUSTOM_ROLE_CODE_RESOURCE } from './organizationContent/customRoles';
import { GROUP_CODE_RESOURCE } from './organizationContent/groups';
import { getThemesFolder } from './organizationContent/themePackage';
import { USER_CODE_RESOURCE } from './organizationContent/users';

export type UploadDryRunAction =
    | 'create'
    | 'update'
    | 'no_change'
    | 'skip_ahead';

export type UploadDryRunItem = {
    slug: string;
    action: UploadDryRunAction;
};

export type UploadDryRunGroup = {
    label: string;
    singular: string;
    items: UploadDryRunItem[];
};

export type UploadDryRunTotals = {
    create: number;
    update: number;
    no_change: number;
    skip_ahead: number;
};

export type UploadDryRunReport = {
    dryRun: true;
    totals: UploadDryRunTotals;
    groups: UploadDryRunGroup[];
};

export const addUploadDryRunOption = (command: Command): Command =>
    command
        .option(
            '--dry-run',
            'Preview the upload without writing to the instance or recording a last-applied snapshot',
            false,
        )
        .option(
            '--json',
            'Print the dry-run plan as JSON. Only used with --dry-run',
            false,
        )
        .option(
            '--strict',
            'Exit 1 when a dry-run would create, update, or skip ahead content. Preview still prints; without --strict the exit code is 0',
            false,
        );

const toPlanItems = (
    slugs: string[],
    action: UploadDryRunAction,
): UploadDryRunItem[] =>
    [...new Set(slugs)]
        .sort((left, right) => left.localeCompare(right))
        .map((slug) => ({ slug, action }));

export const createUploadDryRunGroup = ({
    label,
    singular,
    slugs,
    unchangedSlugs = [],
    createSlugs = [],
    skipAheadSlugs = [],
}: {
    label: string;
    singular: string;
    slugs: string[];
    unchangedSlugs?: string[];
    createSlugs?: string[];
    skipAheadSlugs?: string[];
}): UploadDryRunGroup | null => {
    const reserved = new Set([
        ...unchangedSlugs,
        ...createSlugs,
        ...skipAheadSlugs,
    ]);
    const items = [
        ...toPlanItems(createSlugs, 'create'),
        ...toPlanItems(
            slugs.filter((slug) => !reserved.has(slug)),
            'update',
        ),
        ...toPlanItems(unchangedSlugs, 'no_change'),
        ...toPlanItems(skipAheadSlugs, 'skip_ahead'),
    ];
    if (items.length === 0) {
        return null;
    }
    return { label, singular, items };
};

export const summarizeUploadDryRun = (
    groups: UploadDryRunGroup[],
): UploadDryRunTotals => {
    const totals: UploadDryRunTotals = {
        create: 0,
        update: 0,
        no_change: 0,
        skip_ahead: 0,
    };
    groups.forEach((group) => {
        group.items.forEach((item) => {
            totals[item.action] += 1;
        });
    });
    return totals;
};

export const uploadDryRunWouldChange = (totals: UploadDryRunTotals): boolean =>
    totals.create + totals.update + totals.skip_ahead > 0;

const actionLine = (singular: string, item: UploadDryRunItem): string => {
    switch (item.action) {
        case 'create':
            return `  would create ${singular} ${item.slug}`;
        case 'update':
            return `  would update ${singular} ${item.slug}`;
        case 'no_change':
            return `  no change ${singular} ${item.slug}`;
        case 'skip_ahead':
            return `  would skip ${singular} ${item.slug} (instance ahead)`;
        default:
            return assertUnreachable(
                item.action,
                `Unknown dry-run action: ${item.action}`,
            );
    }
};

export const printUploadDryRunPlan = (
    groups: UploadDryRunGroup[],
    { json = false }: { json?: boolean } = {},
): UploadDryRunReport => {
    const report: UploadDryRunReport = {
        dryRun: true,
        totals: summarizeUploadDryRun(groups),
        groups,
    };

    if (json) {
        console.info(JSON.stringify(report));
        return report;
    }

    console.info(styles.success('Dry run — no changes will be made.'));
    if (groups.length === 0) {
        console.info(styles.secondary('Nothing would be uploaded.'));
        return report;
    }

    console.info('');
    groups.forEach((group) => {
        console.info(styles.bold(group.label));
        group.items.forEach((item) => {
            console.info(actionLine(group.singular, item));
        });
        console.info('');
    });
    console.info(
        styles.secondary(
            `Totals: ${report.totals.create} create, ${report.totals.update} update, ${report.totals.no_change} no change, ${report.totals.skip_ahead} skip ahead.`,
        ),
    );
    console.info(
        styles.secondary('No files were written and no content was uploaded.'),
    );
    return report;
};

const readThemeSlugs = async (customPath?: string): Promise<string[]> => {
    const themesFolder = getThemesFolder(getDownloadFolder(customPath));
    try {
        const entries = await fs.readdir(themesFolder, {
            withFileTypes: true,
        });
        return entries
            .filter(
                (entry) => entry.isDirectory() && !entry.name.startsWith('.'),
            )
            .map((entry) => entry.name)
            .sort((left, right) => left.localeCompare(right));
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return [];
        }
        throw error;
    }
};

export const collectOrganizationUploadPlan = async (
    customPath?: string,
): Promise<UploadDryRunGroup[]> => {
    const basePath = getDownloadFolder(customPath);

    const customRoles = await readCodeResourceFiles({
        definition: CUSTOM_ROLE_CODE_RESOURCE,
        basePath,
    });
    assertCodeResourceFilesValid(customRoles);

    const users = await readCodeResourceFiles({
        definition: USER_CODE_RESOURCE,
        basePath,
    });
    assertCodeResourceFilesValid(users);

    const groups = await readCodeResourceFiles({
        definition: GROUP_CODE_RESOURCE,
        basePath,
    });
    assertCodeResourceFilesValid(groups);

    return [
        createUploadDryRunGroup({
            label: 'Custom roles',
            singular: 'custom role',
            slugs: customRoles.files.map(({ document }) => document.name),
        }),
        createUploadDryRunGroup({
            label: 'Users',
            singular: 'user',
            slugs: users.files.map(({ document }) => document.email),
        }),
        createUploadDryRunGroup({
            label: 'Groups',
            singular: 'group',
            slugs: groups.files.map(({ document }) => document.name),
        }),
        createUploadDryRunGroup({
            label: 'Themes',
            singular: 'theme',
            slugs: await readThemeSlugs(customPath),
        }),
    ].filter((group): group is UploadDryRunGroup => group !== null);
};
