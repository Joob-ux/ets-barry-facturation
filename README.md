# Facturation Ets Barry

Application web de facturation pour ETS MAMADOU SALIOU BARRY.

- Saisie : nom du client, adresse (origine), produits (désignation, quantité, prix unitaire), virement reçu et banque (CBAO, Ecobank, Banque Agricole, Banque Atlantique, Bank of Africa, Banque Islamique du Sénégal).
- Calcul : total = quantité × prix unitaire ; reste à payer = total − virement. Montants en FCFA.
- Facture PDF A4 téléchargée à l'enregistrement, et depuis l'historique.
- Historique avec recherche, modification, suppression, sauvegarde et restauration (fichier JSON).

Site statique, sans serveur : les factures sont gardées dans le navigateur de l'appareil.
Pour publier : importer ce dépôt dans Vercel (aucun réglage de build).

Bibliothèques incluses dans `lib/` : jsPDF 2.5.1 et jsPDF-AutoTable 3.8.2 (licence MIT).
