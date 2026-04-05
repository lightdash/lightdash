import { SEED_ORG_1 } from '@lightdash/common';
import { Knex } from 'knex';
import { OrganizationColorPaletteTableName } from '../../entities/organizationColorPalettes';

type SeededPalette = {
    color_palette_uuid: string;
    organization_uuid: string;
    name: string;
    colors: string[];
    dark_colors: string[] | null;
};

const SEEDED_PALETTES: SeededPalette[] = [
    {
        color_palette_uuid: '53eac606-b655-4edc-a9e9-a702e2c68f63',
        organization_uuid: SEED_ORG_1.organization_uuid,
        name: 'Customer Segments Sunrise',
        colors: [
            '#1D3557',
            '#457B9D',
            '#A8DADC',
            '#F1FAEE',
            '#E63946',
            '#FF7F51',
            '#FFB703',
            '#FB8500',
            '#8ECAE6',
            '#219EBC',
            '#2A9D8F',
            '#43AA8B',
            '#90BE6D',
            '#F9C74F',
            '#F9844A',
            '#F3722C',
            '#577590',
            '#6D597A',
            '#B56576',
            '#E56B6F',
        ],
        dark_colors: [
            '#B8D8FF',
            '#8FC5F3',
            '#72E4DF',
            '#F1FAEE',
            '#FF8A8A',
            '#FFB38A',
            '#FFD166',
            '#FF9F1C',
            '#A8E6FF',
            '#7BDFF2',
            '#66D1C1',
            '#7AE582',
            '#A7F070',
            '#FFE066',
            '#FFBA7A',
            '#FF934F',
            '#9BB1FF',
            '#CDB4DB',
            '#FFAFCC',
            '#FF8FAB',
        ],
    },
    {
        color_palette_uuid: '0150adb1-6aba-45b8-b8e6-1e24f6d6164c',
        organization_uuid: SEED_ORG_1.organization_uuid,
        name: 'Customer Segments Aurora',
        colors: [
            '#0B132B',
            '#1C2541',
            '#3A506B',
            '#5BC0BE',
            '#6FFFE9',
            '#2EC4B6',
            '#06D6A0',
            '#38B000',
            '#70E000',
            '#9EF01A',
            '#CCFF33',
            '#F4D35E',
            '#EE964B',
            '#F95738',
            '#D7263D',
            '#7B2CBF',
            '#9D4EDD',
            '#C77DFF',
            '#4895EF',
            '#4CC9F0',
        ],
        dark_colors: [
            '#9FB3FF',
            '#B8C0FF',
            '#9DB4C0',
            '#7AE7E1',
            '#B2FFF4',
            '#6EE7D8',
            '#5AF2C3',
            '#7EF07A',
            '#A3FF8F',
            '#C8FF85',
            '#E6FF8A',
            '#FFE28A',
            '#FFC38A',
            '#FF9B7A',
            '#FF6B81',
            '#C8A2FF',
            '#D8B4FE',
            '#E7C6FF',
            '#8EC5FF',
            '#90F1FF',
        ],
    },
];

export async function seed(knex: Knex): Promise<void> {
    await knex(OrganizationColorPaletteTableName)
        .insert(SEEDED_PALETTES)
        .onConflict('color_palette_uuid')
        .merge(['name', 'colors', 'dark_colors']);
}
