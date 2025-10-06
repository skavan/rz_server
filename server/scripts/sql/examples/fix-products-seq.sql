-- Align products_id_seq to be greater than the current max(id)
SELECT setval('public.products_id_seq', COALESCE((SELECT MAX(id) FROM public.products), 0) + 1, false);
