# Facturation Ets Barry

Application web de facturation pour ETS MAMADOU SADIO BARRY.

- Comptes clients : chaque client a un code (C001, C002…). On tape le code pour remplir la facture ou voir toutes ses factures.
- Saisie : code client, nom, adresse (origine), lignes « CAFÉ EN GRAINES » (quantité, prix unitaire), virement reçu et banque (CBAO, Ecobank, Banque Agricole, Banque Atlantique, Bank of Africa, Banque Islamique du Sénégal).
- Calcul : total = quantité × prix unitaire ; reste à payer = total − virement. Montants en FCFA.
- Facture PDF A4 téléchargée à l'enregistrement, et depuis l'historique.
- Historique avec recherche, modification, suppression, sauvegarde et restauration (fichier JSON).

Deux espaces :
- **Espace client** (page d'accueil) : le client tape son code et voit ses factures, sans connexion.
- **Espace administrateur** : caché sur la page publique, connexion e-mail + mot de passe (Supabase Auth). Seul un administrateur crée clients et factures.

Données en ligne dans Supabase (tables `etsbarry_*`, schéma dans `supabase/schema.sql`).
Les règles de sécurité (RLS) n'autorisent que les administrateurs listés dans `etsbarry_admins`.
L'espace client passe par la fonction `etsbarry_compte(code)`, qui ne renvoie qu'un seul compte.
Les codes clients sont tirés au hasard (6 caractères) pour ne pas pouvoir être devinés.

Ajouter un administrateur : créer l'utilisateur dans Supabase (Authentication > Users > Add user), puis
`insert into public.etsbarry_admins (user_id) select id from auth.users where email = '...';`
Pour publier : importer ce dépôt dans Vercel (aucun réglage de build).

Bibliothèques incluses dans `lib/` : jsPDF 2.5.1, jsPDF-AutoTable 3.8.2 et supabase-js 2.45.4 (licence MIT).
