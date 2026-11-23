#!/usr/bin/env python3
"""Fabrique la version hors ligne (dossier + zip) à partir de la version en ligne.
Usage : python3 hors-ligne/construire.py <dossier_sortie>"""
import base64, os, shutil, sys, zipfile
ICI = os.path.dirname(os.path.abspath(__file__)); RACINE = os.path.dirname(ICI)
sortie = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.path.join(RACINE, 'dist'))
dossier = os.path.join(sortie, 'Facturation-Ets-Barry')
shutil.rmtree(dossier, ignore_errors=True); os.makedirs(os.path.join(dossier, 'lib'))

def remplacer(s, a, b):
    assert s.count(a) == 1, a
    return s.replace(a, b)

app = open(os.path.join(RACINE, 'app.js'), encoding='utf-8').read()
# Le logo ne peut pas être lu par fetch() depuis un fichier local : il est fourni en data URL.
app = remplacer(app, "fetch('logo.jpg').then(r => r.ok ? r.blob() : null).then(b => { if (!b) return; const fr = new FileReader(); fr.onload = () => logoData = fr.result; fr.readAsDataURL(b); }).catch(() => {});",
                "logoData = window.LOGO_DATA || null;")
app = remplacer(app, "const ACCES = 'ouvert';", "const ACCES = 'ouvert'; // version hors ligne : tout sur cet ordinateur")
app = remplacer(app, "const erreurReseau = e => \"Impossible d'enregistrer en ligne. Vérifiez la connexion internet et réessayez.\"",
                "const erreurReseau = e => \"Impossible d'enregistrer sur cet ordinateur.\"")
app = app.replace("Connexion impossible. Rechargez la page.", "Lecture des données impossible. Rechargez la page.")
# Restauration : remettre la sauvegarde telle quelle (mêmes codes, mêmes numéros), sans doublons.
app = remplacer(app, "    await importer(data, brut.clients || []);",
"""    const db = window.ETSBARRY_HORS_LIGNE.lire();
    let nc = 0, nf = 0;
    (brut.clients || []).forEach(c => { if (c && c.code && !db.etsbarry_clients.some(x => x.code === c.code)) { db.etsbarry_clients.push(c); nc++; } });
    const cle = f => [f.date, f.nom, JSON.stringify(f.lignes), f.vir].join('|');
    const deja = new Set(db.etsbarry_factures.map(cle));
    let max = db.etsbarry_factures.reduce((m, f) => Math.max(m, Number(f.no) || 0), 0);
    data.forEach(f => {
      if (!f || !Array.isArray(f.lignes) || deja.has(cle(f))) return;
      const g = { ...f }; if (!g.no || db.etsbarry_factures.some(x => x.no === g.no)) g.no = ++max; else max = Math.max(max, g.no);
      db.etsbarry_factures.push(g); deja.add(cle(f)); nf++;
    });
    window.ETSBARRY_HORS_LIGNE.ecrire(db);
    await charger(); remplirCodes(); afficherHistorique();
    $('importMsg').textContent = nf || nc ? nf + ' facture(s) et ' + nc + ' client(s) restauré(s).' : 'Rien à ajouter : tout ce fichier est déjà présent.';""")
open(os.path.join(dossier, 'app.js'), 'w', encoding='utf-8').write(app)

html = open(os.path.join(RACINE, 'index.html'), encoding='utf-8').read()
html = remplacer(html, '<script src="lib/supabase.js"></script>', '<script src="lib/stockage-local.js"></script>\n<script src="lib/logo.js"></script>')
# Pas d'internet : pas de polices Google (le navigateur prend ses polices habituelles).
html = '\n'.join(l for l in html.split('\n') if 'fonts.googleapis.com' not in l)
html = remplacer(html, 'Facturation Ets Barry</h1>', 'Facturation Ets Barry <small style="font-size:.6em;color:#6b7a72;font-weight:500">· hors ligne</small></h1>')
open(os.path.join(dossier, 'index.html'), 'w', encoding='utf-8').write(html)

shutil.copy(os.path.join(ICI, 'stockage-local.js'), os.path.join(dossier, 'lib'))
for f in ['jspdf.umd.min.js', 'jspdf.plugin.autotable.min.js', 'LICENSE-jspdf', 'LICENSE-jspdf-autotable']:
    shutil.copy(os.path.join(RACINE, 'lib', f), os.path.join(dossier, 'lib'))
shutil.copy(os.path.join(RACINE, 'logo.jpg'), dossier)
b64 = base64.b64encode(open(os.path.join(RACINE, 'logo.jpg'), 'rb').read()).decode()
open(os.path.join(dossier, 'lib', 'logo.js'), 'w').write("window.LOGO_DATA = 'data:image/jpeg;base64," + b64 + "';\n")
# Notice lisible par le Bloc-notes de Windows (BOM UTF-8 et fins de ligne Windows).
notice = open(os.path.join(ICI, 'LISEZ-MOI.txt'), encoding='utf-8').read().replace('\r\n', '\n').replace('\n', '\r\n')
open(os.path.join(dossier, 'LISEZ-MOI.txt'), 'w', encoding='utf-8-sig', newline='').write(notice)

z = os.path.join(sortie, 'Facturation-Ets-Barry-hors-ligne.zip')
with zipfile.ZipFile(z, 'w', zipfile.ZIP_DEFLATED) as zf:
    for base, _, fichiers in os.walk(dossier):
        for f in fichiers:
            p = os.path.join(base, f); zf.write(p, os.path.relpath(p, sortie))
print(z)
