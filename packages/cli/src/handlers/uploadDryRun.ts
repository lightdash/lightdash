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

export type UploadDryRunAction = 'UPLOAD' | 'NO_CHANGES';

export type UploadDryRunItem = {
    slug: string;
    action: UploadDryRunAction;
};

export type UploadDryRunGroup = {
    label: string;
    singular: string;
    items: UploadDryRunItem[];
};

export const addUploadDryRunOption = (command: Command): Command =>
    command.option(
        '--dry-run',
        'Preview the upload without writing to the instance or recording a last-applied snapshot',
        false,
    );

const toPlanItems = (
    slugs: string[],
    action: UploadDryRunAction = 'UPLOAD',
): UploadDryRunItem[] =>
    [...new Set(slugs)]
        .sort((left, right) => left.localeCompare(right))
        .map((slug) => ({ slug, action }));

export const createUploadDryRunGroup = ({
    label,
    singular,
    slugs,
    unchangedSlugs = [],
}: {
    label: string;
    singular: string;
    slugs: string[];
    unchangedSlugs?: string[];
}): UploadDryRunGroup | null => {
    const unchanged = new Set(unchangedSlugs);
    const items = [
        ...toPlanItems(
            slugs.filter((slug) => !unchanged.has(slug)),
            'UPLOAD',
        ),
        ...toPlanItems(unchangedSlugs, 'NO_CHANGES'),
    ];
    if (items.length === 0) {
        return null;
    }
    return { label, singular, items };
};

export const printUploadDryRunPlan = (groups: UploadDryRunGroup[]): void => {
    console.info(styles.success('Dry run — no changes will be made.'));
    if (groups.length === 0) {
        console.info(styles.secondary('Nothing would be uploaded.'));
        return;
    }

    console.info('');
    groups.forEach((group) => {
        console.info(styles.bold(group.label));
        group.items.forEach((item) => {
            if (item.action === 'NO_CHANGES') {
                console.info(
                    `  would skip ${group.singular} ${item.slug} (no local changes)`,
                );
                return;
            }
            console.info(`  would upload ${group.singular} ${item.slug}`);
        });
        console.info('');
    });
    console.info(
        styles.secondary('No files were written and no content was uploaded.'),
    );
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
