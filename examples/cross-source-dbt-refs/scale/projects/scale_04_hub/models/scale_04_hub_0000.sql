select b.id::integer as id, 'scale_04_hub'::text as label,
       (168 + coalesce(r0.amount, 0) + coalesce(r1.amount, 0))::numeric as amount, (b.id % 2 = 0) as active,
       (date '2026-01-01' + b.id) as event_date
from generate_series(1, 11) as b(id)
left join {{ ref('scale_00_fanout', 'customers') }} as r0 on b.id = r0.id
left join {{ ref('scale_03_hub', 'scale_03_hub_0000') }} as r1 on b.id = r1.id
