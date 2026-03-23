-- 100k lat/long points clustered around major Texas cities
-- Used for testing map scatter chart clustering performance
-- Points are distributed with realistic density: heavy in cities, sparse in rural areas

with cities as (
    -- Major Texas cities with relative population weights
    select * from (values
        ('Houston',      29.760, -95.370, 35),
        ('San Antonio',  29.425, -98.495, 20),
        ('Dallas',       32.780, -96.800, 18),
        ('Austin',       30.267, -97.743, 14),
        ('Fort Worth',   32.755, -97.331, 10),
        ('El Paso',      31.762, -106.445, 8),
        ('Corpus Christi',27.801, -97.396, 5),
        ('Lubbock',      33.577, -101.845, 4),
        ('Amarillo',     35.222, -101.831, 3),
        ('Laredo',       27.506, -99.507, 3),
        ('Midland',      31.997, -102.077, 2),
        ('Brownsville',  25.902, -97.497, 2)
    ) as t(city, lat, lon, weight)
),

-- Expand each city by its weight (higher weight = more points)
city_expanded as (
    select
        c.city,
        c.lat,
        c.lon
    from cities c
    cross join generate_series(1, c.weight * 807) as s(i)
),

-- Add random offset around each city center (gaussian-like via summing randoms)
generated as (
    select
        row_number() over () as location_id,
        city,
        lat + (random() + random() + random() - 1.5) * 0.3 as latitude,
        lon + (random() + random() + random() - 1.5) * 0.4 as longitude,
        floor(random() * 10000)::integer as revenue_usd,
        case floor(random() * 5)::integer
            when 0 then 'Retail'
            when 1 then 'Warehouse'
            when 2 then 'Office'
            when 3 then 'Restaurant'
            when 4 then 'Gas Station'
        end as category
    from city_expanded
)

select * from generated
