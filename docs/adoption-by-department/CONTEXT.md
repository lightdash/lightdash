# Adoption by department

How an organization's use of Lightdash is broken down by the parts of the business that use it. An admin describes the organization as a tree of departments, says how many people each should have, and Lightdash shows how many of them are on Lightdash and active, so enablement goes where it is needed. Everything is derived on each request from users, groups, and existing usage tables; nothing about who belongs where is stored except what an admin enters.

## Language

### Structure

**Department**:
A named part of the organization, such as Finance or North region, unique by name within the organization whatever the case. May sit under one parent department.
_Avoid_: team, business unit, org unit, division, group (a group is a Lightdash user group)

**Sub-department**:
A department whose parent is another department. "Child" is fine in code and in tree language ("children").
_Avoid_: team, nested department

**Top-level department**:
A department with no parent.
_Avoid_: root department, parent-less department

**Linked group**:
A Lightdash user group connected to a department. Everyone in the group is placed in that department unless something more specific applies. A group can be linked to several departments, and everyone in it is placed in each.
_Avoid_: mapped group, synced group, attached group

**Owner**:
A user or a group responsible for a department's adoption. A department has an ordered list of owners and the first is the one shown.
_Avoid_: lead, manager, admin, steward

### Placing people

**Assigned person**:
A person an admin placed in a department by hand. An assignment adds a placement beside the person's linked groups rather than overriding them, and a person can be assigned to several departments.
_Avoid_: manual member, pinned user, override

**Placement**:
A department a person is in: one they are assigned to, or one a group of theirs is linked to, after most specific wins. Worked out on every read, never stored. The API sorts a person's placements by department uuid; the pages sort them by name.
_Avoid_: resolution, mapping, allocation, sync

**Most specific wins**:
The rule for placements: when a person is placed in a department and in one of its descendants, by assignment or through a group, only the descendant is a placement.
_Avoid_: lowest wins, child wins, priority

**Shared person**:
A person with two or more placements. With no primary department they count in each of them; with one, only there. Being in several departments is information, not an error. `kind` is `shared` in the API.
_Avoid_: conflict, clash, duplicate, multi-department member

**Primary department**:
The one department a shared person counts in, chosen by someone with `manage:OrganizationAdoption`. The person's other placements stay visible as "also in". A stored primary that is no longer one of the person's placements is ignored.
_Avoid_: main department, home department, default department

**Counts in**:
The departments a person is counted in: their primary department alone when they have one, otherwise every placement. `countedDepartmentUuids` in the API, and "Counts in" in the placement modal.
_Avoid_: belongs to, resolves to

**Unassigned**:
A person who is on Lightdash but has no placement. They count in no department.
_Avoid_: unplaced, orphan, ungrouped

**Member**:
A person who counts in a department, or in any department beneath it. A parent's members are its own people plus all its descendants', each person once, so a person in two of its sub-departments is one member of it. "Direct member" means counted in that department itself.
_Avoid_: user (when the department is meant), employee, headcount

**Overlap**:
For a department, another department neither above nor below it whose members include some of its own; the overlap is the people in both. Departments above and below always hold the department's people, so they are never overlaps.
_Avoid_: intersection (fine in code), shared department, crossover

**Internal user**:
A Lightdash-created account such as a service account. Never a member or owner and never counted.
_Avoid_: system user, bot

### Size

**Headcount**:
The number of people a department should have on Lightdash, entered by an admin. Unknown is null, not zero.
_Avoid_: size, seats, licences, employees

**Residual headcount**:
The headcount a department with sub-departments keeps for the people directly in it: its effective headcount less its children's total, and never fewer than those people. The map draws it as the department's "Directly in" circle, and `directMetrics` percentages are of it.
_Avoid_: leftover, own headcount, direct headcount

**Headcount note**:
Free text saying where a headcount came from.
_Avoid_: comment, source, description

**Children's total**:
What a department's sub-departments hold between them: their people on Lightdash, each once however many of the sub-departments a person counts in, plus each sub-department's people without an account (its effective headcount less its members). With nobody shared it is the sum of their effective headcounts. `getChildrenHeadcount` in common.
_Avoid_: sum of children, children's headcount

**Effective headcount**:
The headcount used in calculations: the department's own when set, otherwise its children's total plus the people on Lightdash directly in it, and never fewer than that (for a department without sub-departments, never fewer than its members), so a headcount only ever adds people without an account. A department with no headcount counts its members.
_Avoid_: total headcount, rolled-up headcount, computed headcount

**Headcount below children**:
A flag raised when the headcount entered on a department with sub-departments is lower than its children's total plus the people on Lightdash directly in it. The department counts that total instead.
_Avoid_: headcount mismatch, headcount warning

**On Lightdash**:
Has an active account in the organization, is not an internal user, and has a password, a single sign-on identity or a verified primary email. People provisioned through SCIM count from the moment they are provisioned, because SCIM verifies their email. Deactivated users and invited people who have not joined are not on Lightdash; they show up only as part of the headcount without an account.
_Avoid_: licensed, provisioned, seated

### Measures

**Active**:
In this organization in the last 30 days, ran a query from a dashboard, explore, saved chart, SQL runner or metrics explorer, viewed underlying data, asked the AI agent, or used MCP; or viewed a chart or dashboard. API, CLI, scheduled deliveries and alerts as queries, syncs, auto-refreshed dashboards and embeds do not count. A scheduled delivery still writes a chart view under its owner, so it can make the owner active.
_Avoid_: engaged, retained, MAU

**Activity bucket**:
Where a member falls by their latest activity, from the same sources as active: healthy with activity in the last 30 days (so healthy and active count the same people), at risk with activity in the last 90 days but not the last 30, and lost with none in the last 90 days or none ever. People without an account are no account, not lost. The bounds are `HEALTHY_ACTIVITY_DAYS` (30) and `AT_RISK_ACTIVITY_DAYS` (90) in common.
_Avoid_: churned, dormant, inactive, lapsed

**Coverage**:
Members divided by effective headcount, as a percentage, so never above 100. A department with no headcount entered on it or below it shows no coverage, as it would only read 100 %; the pages ask for a headcount instead.
_Avoid_: penetration, reach, adoption rate

**Active percentage**:
Active members divided by effective headcount, so never above 100.
_Avoid_: adoption, usage rate

**Target**:
A number of active people a department aims for, with an optional date. The API reports progress as the people remaining and the weeks left; no page shows or edits targets.
_Avoid_: goal, OKR, quota

**Weeks left**:
Whole weeks to the target date, rounded up. Null with no date, 0 on the day, negative when overdue.
_Avoid_: days remaining, deadline

**Weekly active**:
Distinct members with a chart or dashboard view per UTC week (Monday start) over the last 12 weeks. Queries are not counted here, because query history is only kept for about a month.
_Avoid_: WAU, trend line

**At the organization's rate**:
The dashed line on a department's trend: the organization's weekly active share applied to this department's people on Lightdash, so a 96 %-active department of 70 and a 5 %-active department of 2,000 are each compared with the same rate. The API's `orgAverage` (the mean across departments at the same depth) is no longer drawn.
_Avoid_: average department, benchmark, baseline, peer average

**Key content**:
The dashboards, explores and AI agents a department's members used most in the last 30 days, each linked to the content. The API field is `topContent`.
_Avoid_: popular content, favourites, what they use, what this department uses

### Views

**Map**:
The default index view: departments as nested circles with one dot per person, coloured by activity bucket (the default) or role. A person who counts in several departments has a dot in each, ringed. Dots show how a department is doing, not where to find someone; to find a person, use the department page's people list.
_Avoid_: bubble chart, treemap, org chart

**List**:
The index view as a table of departments with their measures.
_Avoid_: grid, table view

**Attention**:
The counts shown above the index: unassigned people, and shared people with no primary department. Anyone holding `manage:OrganizationAdoption` (admins by default, custom roles can grant it) can place the first and choose where the second count. Only unassigned people make it a warning.
_Avoid_: alerts, issues, to-do

## Relationships

- A **department** has zero or one parent, any number of **sub-departments**, any number of **linked groups**, any number of **assigned people** and an ordered list of **owners**. A **linked group** can belong to several departments.
- A **person** has zero or more **placements**: every department they are assigned to or reach through a linked group, after **most specific wins**. None is **unassigned**, two or more is a **shared person**. A person **counts in** every placement, or only in their **primary department** when one is set.
- **Members** roll up the tree as a set: a parent counts each of its descendants' members once. **Headcount** rolls up only as a fallback when the parent has none of its own, through the **children's total**, and **effective headcount** never falls below the members.
- An **overlap** of a department is a department outside its branch whose members it shares.
- **Coverage** and **active percentage** are measured against **effective headcount**, so neither exceeds 100.

## Flagged ambiguities

- The word "group" always means a Lightdash user group. A department is not a group, and linking a group to a department does not change the group.
- "Active" means activity in the last 30 days everywhere except **weekly active**, which counts chart and dashboard views per week and leaves queries out. On the map, healthy is the same people as active.
- The code and API say `unassigned`. Do not introduce "unplaced" in code, docs or copy.
- Function and type names still say "resolve" (`resolveDepartmentMembership`, `ResolvedMemberRow`, `getResolvedMemberRows`): they work out placements and where people count. Say placement, not resolution.
- "Shared" has two scopes. `kind: 'shared'` and the placement modal's Shared tab are everyone with two or more placements; the attention strip's count, `attention.sharedCount`, leaves out those with a primary department, as they count in one department only. A department's `sharedCount` is its people who count in another department too, so it also leaves them out.
