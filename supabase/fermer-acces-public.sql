-- À lancer pour remettre les factures en privé (fin du test).
-- Ensuite, mettre ACCES = 'code' dans app.js : l'accueil redevient l'espace client par code.
drop policy if exists "test ouvert clients" on public.etsbarry_clients;
drop policy if exists "test ouvert factures" on public.etsbarry_factures;
drop policy if exists "lecture publique des clients" on public.etsbarry_clients;
drop policy if exists "lecture publique des factures" on public.etsbarry_factures;
