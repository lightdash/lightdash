select * from {{ ref(
    'dyn_upstream',
    'dim_b'
) }}
