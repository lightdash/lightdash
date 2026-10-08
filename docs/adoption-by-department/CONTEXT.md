# Adoption by department

How an organization's use of Lightdash is broken down by the parts of the business that use it. An admin describes the organization as a tree of departments, says how many people each should have, and Lightdash shows how many of them are on Lightdash and active, so enablement goes where it is needed. Everything is derived on each request from users, groups, and existing usage tables; nothing about who belongs where is stored except what an admin enters.

## Language

### Structure

**Department**:
A named part of the organization, such as Finance or North region, unique by name within the organization. May sit under one parent department.
_Avoid_: team, business unit, org unit, division, group (a group is a Lightdash user group)

**Sub-department**:
A department whose parent is another department. "Child" is fine in code and in tree language ("children").
_Avoid_: team, nested department

**Top-level department**:
A department with no parent.
_Avoid_: root department, parent-less department

**Linked group**:
A Lightdash user group connected to a department. Everyone in the group is placed in that department unless something more specific applies. A group links to at most one department.
_Avoid_: mapped group, synced group, attached group

**Owner**:
A user or a group responsible for a department's adoption. A department has an ordered list of owners and the first is the one shown.
_Avoid_: lead, manager, admin, steward

### Placing people

**Assigned person**:
A person an admin placed in a department by hand. An assignment beats every linked group, and the application keeps a person to one in an organization.
_Avoid_: manual member, pinned user, override

**Resolution**:
The decision of where one person counts: in one department, in none because of a conflict, or in none because nothing applies. Computed on every read, never stored.
_Avoid_: mapping, allocation, sync

**Most specific wins**:
The rule for people placed through linked groups: when a person is reached through groups linked to a department and to one of its descendants, only the descendant counts.
_Avoid_: lowest wins, child wins, priority

**Conflict**:
A person reached through linked groups of departments in different branches, so no single department is most specific. They count nowhere until someone with `manage:OrganizationAdoption` assigns them.
_Avoid_: clash, overlap, duplicate

**Unassigned**:
A person who is on Lightdash but reached by no assignment and no linked group. They count in no department.
_Avoid_: unplaced, orphan, ungrouped

**Member**:
A person who resolves to a department, or to any department beneath it. A parent's members are its own people plus all its descendants'. "Direct member" means resolved to that department itself.
_Avoid_: user (when the department is meant), employee, headcount

**Internal user**:
A Lightdash-created account such as a service account. Never a member or owner and never counted.
_Avoid_: system user, bot

### Size

**Headcount**:
The number of people a department should have on Lightdash, entered by an admin. Unknown is null, not zero.
_Avoid_: size, seats, licences, employees

**Headcount note**:
Free text saying where a headcount came from.
_Avoid_: comment, source, description

**Effective headcount**:
The headcount used in calculations: the department's own when set, otherwise the sum of its sub-departments' effective headcounts, otherwise unknown.
_Avoid_: total headcount, rolled-up headcount, computed headcount

**Headcount below children**:
A flag raised when a department's own headcount is lower than the sum of its sub-departments'. The own value is still used.
_Avoid_: headcount mismatch, headcount warning

**On Lightdash**:
Has an account in the organization and is not an internal user. This includes invited people who have not logged in and deactivated users.
_Avoid_: licensed, provisioned, seated

### Measures

**Active**:
Ran a query themselves, or viewed a chart or dashboard, in this organization in the last 30 days. Scheduled, API, agent and MCP runs do not count. Weekly counts use the same activity per UTC week.
_Avoid_: engaged, retained, MAU

**Coverage**:
Members divided by effective headcount, as a percentage. Null without a headcount.
_Avoid_: penetration, reach, adoption rate

**Active percentage**:
Active members divided by effective headcount. Null without a headcount. Uncapped, so it can exceed 100.
_Avoid_: adoption, usage rate

**Target**:
A number of active people a department aims for, with an optional date. Progress shows the remaining people and the weeks left.
_Avoid_: goal, OKR, quota

**Weeks left**:
Whole weeks to the target date, rounded up. Null with no date, 0 on the day, negative when overdue.
_Avoid_: days remaining, deadline

**Weekly active**:
Distinct active members per UTC week (Monday start) over the last 12 weeks.
_Avoid_: WAU, trend line

**Org average**:
On a department's trend, the mean weekly active count across departments at the same depth in the tree.
_Avoid_: benchmark, baseline, peer average

**Top content**:
The dashboards, explores and AI agents a department's members used most in the last 30 days.
_Avoid_: popular content, favourites, what they use

### Views

**Map**:
The default index view: departments as nested circles with one dot per person, coloured by activity, role or last activity.
_Avoid_: bubble chart, treemap, org chart

**List**:
The index view as a table of departments with their measures.
_Avoid_: grid, table view

**Attention**:
The counts of conflicts and unassigned people shown above the index, with a way for anyone holding `manage:OrganizationAdoption` (admins by default, custom roles can grant it) to place them.
_Avoid_: alerts, issues, to-do

## Relationships

- A **department** has zero or one parent, any number of **sub-departments**, any number of **linked groups**, any number of **assigned people** and an ordered list of **owners**.
- A **person** resolves to at most one department. An **assigned person** resolves where assigned; otherwise **most specific wins** among linked groups; reaching several branches is a **conflict**; reaching none is **unassigned**.
- **Members** roll up the tree: a parent counts its descendants' members. **Headcount** rolls up only as a fallback when the parent has none of its own.
- **Coverage** and **active percentage** are measured against **effective headcount**, so both are null without one and the page shows counts.

## Flagged ambiguities

- The word "group" always means a Lightdash user group. A department is not a group, and linking a group to a department does not change the group.
- "Active" means activity in the last 30 days everywhere except **weekly active**, which counts per week. The map's "Active in 12 weeks" is a separate colouring, not the active measure.
- The code and API say `unassigned`. Do not introduce "unplaced" in code, docs or copy.
