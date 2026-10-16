select b.id::integer as id, 'scale_11_fanin'::text as label,
       (239 + coalesce(r0.amount, 0) + coalesce(r1.amount, 0) + coalesce(r2.amount, 0) + coalesce(r3.amount, 0) + coalesce(r4.amount, 0) + coalesce(r5.amount, 0) + coalesce(r6.amount, 0) + coalesce(r7.amount, 0) + coalesce(r8.amount, 0) + coalesce(r9.amount, 0) + coalesce(r10.amount, 0) + coalesce(r11.amount, 0) + coalesce(r12.amount, 0) + coalesce(r13.amount, 0) + coalesce(r14.amount, 0) + coalesce(r15.amount, 0) + coalesce(r16.amount, 0) + coalesce(r17.amount, 0) + coalesce(r18.amount, 0))::numeric as amount, (b.id % 2 = 0) as active,
       (date '2026-01-01' + b.id) as event_date
from generate_series(1, 18) as b(id)
left join {{ ref('scale_00_fanout', 'customers') }} as r0 on b.id = r0.id
left join {{ ref('scale_01_leaf', 'customers') }} as r1 on b.id = r1.id
left join {{ ref('scale_02_samename', 'customers') }} as r2 on b.id = r2.id
left join {{ ref('scale_03_hub', 'scale_03_hub_0000') }} as r3 on b.id = r3.id
left join {{ ref('scale_04_hub', 'scale_04_hub_0000') }} as r4 on b.id = r4.id
left join {{ ref('scale_05_chain', 'scale_05_chain_0000') }} as r5 on b.id = r5.id
left join {{ ref('scale_06_chain', 'scale_06_chain_0000') }} as r6 on b.id = r6.id
left join {{ ref('scale_07_diamond', 'scale_07_diamond_0000') }} as r7 on b.id = r7.id
left join {{ ref('scale_08_versioned', 'scale_08_versioned_product') }} as r8 on b.id = r8.id
left join {{ ref('scale_09_mixed', 'scale_09_mixed_0000') }} as r9 on b.id = r9.id
left join {{ ref('scale_10_large', 'scale_10_large_0000') }} as r10 on b.id = r10.id
left join {{ ref('scale_12_leaf', 'scale_12_leaf_0000') }} as r11 on b.id = r11.id
left join {{ ref('scale_13_leaf', 'scale_13_leaf_0000') }} as r12 on b.id = r12.id
left join {{ ref('scale_14_chain', 'scale_14_chain_0000') }} as r13 on b.id = r13.id
left join {{ ref('scale_15_chain', 'scale_15_chain_0000') }} as r14 on b.id = r14.id
left join {{ ref('scale_16_chain', 'scale_16_chain_0000') }} as r15 on b.id = r15.id
left join {{ ref('scale_17_diamond', 'scale_17_diamond_0000') }} as r16 on b.id = r16.id
left join {{ ref('scale_18_diamond', 'scale_18_diamond_0000') }} as r17 on b.id = r17.id
left join {{ ref('scale_19_samename', 'customers') }} as r18 on b.id = r18.id
