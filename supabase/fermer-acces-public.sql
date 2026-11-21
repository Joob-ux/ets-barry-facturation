-- À lancer pour remettre les factures en privé (fin du test d'accès public).
-- Ensuite, mettre ACCES_PUBLIC = false dans app.js : l'accueil redevient l'espace client par code.
drop policy if exists "lecture publique des clients" on public.etsbarry_clients;
drop policy if exists "lecture publique des factures" on public.etsbarry_factures;
