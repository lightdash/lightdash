select * from {{ ref('versioned_ring_b', 'dim', v=3) }}
