select b.id::integer as id, 'scale_10_large'::text as label,
       (315 + coalesce(r0.amount, 0))::numeric as amount, (b.id % 2 = 0) as active,
       (date '2026-01-01' + b.id) as event_date
from generate_series(1, 20) as b(id)
left join {{ ref('scale_08_versioned', 'scale_08_versioned_product') }} as r0 on b.id = r0.id
