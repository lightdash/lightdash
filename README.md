# Analytics dashboard visual QA — PR #31573

Before/after screenshots captured in the isolated local app on 26 October 2026.
All data is synthetic; no customer data is included. Matched pairs use the same dataset and filters.
The after captures correspond to the retained presentation at code commit 47eeefb150576548db7061d6afd6a9419d4312dd.

- Monthly queries: volume bars and percentage-change line.
- People: KPI/trend layout and table bars.
- Content: readable names and activity bars. Tied rows may appear in a different order.
- Tokens: chart spacing, palette, labels and exact event counts.

The rejected user/app heatmap is excluded. The corrected date-based query calendar is included as a companion to the existing daily trend. Calendar captures show 390 observed UTC days / 29,874 queries with the same synthetic fixture; the panel comparison is 573px wide and the mobile check 375px wide. The ownership donut was already included in the original PR.
This separate evidence branch contains no product source and is not intended to merge.
