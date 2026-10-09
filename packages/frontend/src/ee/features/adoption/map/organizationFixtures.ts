import { type DepartmentWithMetrics } from '@lightdash/common';
import {
    dept,
    metricsFixture,
    withServerHeadcounts,
} from '../utils/adoptionFixtures';

// Two organizations the map is checked against at every panel width: department names and counts
// only, shaped like a deep 6,000-headcount organization and a flat one of about 2,000

type Row = [
    name: string,
    parent: string | null,
    headcount: number | null,
    members: number,
    active: number,
    directMembers: number,
    directActive: number,
];

const toDepartments = (rows: Row[]): DepartmentWithMetrics[] =>
    withServerHeadcounts(
        rows.map(
            ([
                name,
                parent,
                headcount,
                members,
                active,
                directMembers,
                directActive,
            ]) =>
                dept(name, parent, null, {
                    headcount,
                    metrics: metricsFixture(members, null, {
                        activeCount30d: active,
                        activeCount12w: active,
                    }),
                    directMetrics: metricsFixture(directMembers, null, {
                        activeCount30d: directActive,
                        activeCount12w: directActive,
                    }),
                }),
        ),
    );

// Four levels deep, 56 departments and 1,763 people placed; 5,582 headcount entered at the top level, 5,587
// effective as People's 120 is below its sub-departments' 125
export const deepOrganization = toDepartments([
    ['Commercial', null, 1900, 834, 495, 3, 2],
    ['Customer Success', 'Commercial', 700, 312, 179, 1, 1],
    ['Customer Success Managers', 'Customer Success', 150, 108, 64, 108, 64],
    ['Onboarding', 'Customer Success', 60, 29, 18, 29, 18],
    ['Renewals', 'Customer Success', 45, 33, 20, 33, 20],
    ['Support', 'Customer Success', 400, 141, 76, 6, 4],
    ['Support Leadership', 'Support', 20, 15, 8, 15, 8],
    ['Tier 1 Support', 'Support', 250, 70, 36, 70, 36],
    ['Tier 2 Support', 'Support', 110, 50, 28, 50, 28],
    ['Marketing', 'Commercial', 180, 99, 62, 2, 2],
    ['Brand', 'Marketing', 40, 24, 13, 24, 13],
    ['Growth', 'Marketing', 70, 49, 30, 49, 30],
    ['Marketing Operations', 'Marketing', 25, 10, 7, 10, 7],
    ['Product Marketing', 'Marketing', null, 14, 10, 14, 10],
    ['Sales', 'Commercial', 760, 420, 252, 14, 9],
    ['Enterprise Sales', 'Sales', 220, 155, 92, 155, 92],
    ['Mid-market Sales', 'Sales', 300, 168, 102, 168, 102],
    ['Sales Development', 'Sales', 180, 53, 31, 53, 31],
    ['Sales Operations', 'Sales', 40, 30, 18, 30, 18],
    ['Data & Analytics', null, 70, 67, 67, 5, 5],
    ['Analytics Engineering', 'Data & Analytics', 18, 18, 18, 18, 18],
    ['Business Intelligence', 'Data & Analytics', 22, 21, 21, 21, 21],
    ['Data Governance', 'Data & Analytics', 8, 9, 9, 9, 9],
    ['Data Science', 'Data & Analytics', 15, 14, 14, 14, 14],
    ['Executive Office', null, 12, 8, 7, 8, 7],
    ['Finance', null, 420, 187, 115, 24, 15],
    ['Controllership', 'Finance', 120, 49, 32, 49, 32],
    ['FP&A', 'Finance', 60, 48, 30, 48, 30],
    ['Internal Audit', 'Finance', 25, 9, 5, 9, 5],
    ['Procurement', 'Finance', 90, 25, 14, 25, 14],
    ['Tax', 'Finance', 40, 12, 7, 12, 7],
    ['Treasury', 'Finance', 35, 20, 12, 20, 12],
    ['Legal & Compliance', null, 60, 0, 0, 0, 0],
    ['Operations', null, 2350, 221, 126, 2, 1],
    ['Facilities', 'Operations', 120, 12, 7, 12, 7],
    ['Health & Safety', 'Operations', 45, 8, 5, 8, 5],
    ['Quality', 'Operations', 90, 29, 17, 29, 17],
    ['Supply Chain', 'Operations', 1750, 170, 96, 0, 0],
    ['Demand Planning', 'Supply Chain', 120, 75, 45, 75, 45],
    ['Logistics', 'Supply Chain', 600, 48, 27, 48, 27],
    ['Procurement Operations', 'Supply Chain', 80, 35, 21, 35, 21],
    ['Warehousing', 'Supply Chain', 900, 12, 3, 12, 3],
    ['People', null, 120, 61, 36, 0, 0],
    ['HR Business Partners', 'People', 40, 18, 10, 18, 10],
    ['Learning & Development', 'People', 20, 9, 6, 9, 6],
    ['People Operations', 'People', 30, 15, 9, 15, 9],
    ['Talent Acquisition', 'People', 35, 19, 11, 19, 11],
    ['Product & Engineering', null, 650, 385, 230, 2, 2],
    ['Design', 'Product & Engineering', 40, 20, 13, 20, 13],
    ['Engineering', 'Product & Engineering', 440, 313, 185, 12, 7],
    ['Applications', 'Engineering', 180, 128, 75, 128, 75],
    ['Data Platform', 'Engineering', 45, 39, 25, 39, 25],
    ['Platform', 'Engineering', 120, 80, 48, 80, 48],
    ['Quality Engineering', 'Engineering', 60, 30, 16, 30, 16],
    ['Site Reliability', 'Engineering', 35, 24, 14, 24, 14],
    ['Product Management', 'Product & Engineering', 60, 50, 30, 50, 30],
]);

// Two levels, 13 departments, one with more accounts than headcount
export const flatOrganization = toDepartments([
    ['Partners', null, 60, 14, 14, 14, 14],
    ['Customer Service', null, 420, 290, 164, 290, 164],
    ['Data & Analytics', null, 110, 191, 85, 84, 43],
    ['Analytics', 'Data & Analytics', 64, 63, 29, 63, 29],
    ['Data Engineering', 'Data & Analytics', 34, 33, 10, 33, 10],
    ['Data Science', 'Data & Analytics', 12, 11, 3, 11, 3],
    ['Engineering', null, 140, 52, 18, 52, 18],
    ['Finance', null, 70, 0, 0, 0, 0],
    ['Marketing', null, 130, 106, 48, 106, 48],
    ['Operations', null, 1150, 560, 317, 157, 0],
    ['Testing', 'Operations', 520, 403, 317, 403, 317],
    ['Product', null, 80, 68, 35, 68, 35],
    ['Sales', null, 95, 72, 31, 72, 31],
]);
