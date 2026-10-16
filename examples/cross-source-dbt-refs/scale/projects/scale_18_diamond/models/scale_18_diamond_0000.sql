select b.id::integer as id, 'scale_18_diamond'::text as label,
       (952 + coalesce(r0.amount, 0) + coalesce(r1.amount, 0) + coalesce(r2.amount, 0))::numeric as amount, (b.id % 2 = 0) as active,
       (date '2026-01-01' + b.id) as event_date
from generate_series(1, 16) as b(id)
left join {{ ref('scale_00_fanout', 'customers') }} as r0 on b.id = r0.id
left join {{ ref('scale_17_diamond', 'scale_17_diamond_0000') }} as r1 on b.id = r1.id
left join {{ ref('scale_07_diamond', 'scale_07_diamond_0000') }} as r2 on b.id = r2.id
