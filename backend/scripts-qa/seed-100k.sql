-- QA: 100k synthetic fragrances (description = 'QA-PERF') for EXPLAIN/timing of ?search=
INSERT INTO fragrances (name, brand, description, concentration)
SELECT
  (ARRAY['Noir','Bleu','Rose','Oud','Amber','Musk','Vanilla','Santal','Iris','Cedar','Sauvage','Aventus','Eros','Angel','Black','Opium','Tobacco','Citrus','Fresh','Velvet'])[1 + (i % 20)]
  || ' ' || (ARRAY['Intense','Elixir','Noble','Royal','Sport','Night','Absolu','Extreme','Classic','Prive'])[1 + ((i / 20) % 10)]
  || ' ' || md5(i::text),
  'Brand ' || (ARRAY['Alpha','Bravo','Chanel','Dior','Gucci','Prada','Tom','Yves','Zeta','Maison'])[1 + (i % 10)] || ' ' || (i % 500),
  'QA-PERF',
  CASE WHEN i % 3 = 0 THEN 'EDP' ELSE 'EDT' END
FROM generate_series(1, 100000) AS i;
ANALYZE fragrances;
