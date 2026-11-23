#!/usr/bin/env python3
"""Fabrique la version hors ligne (dossier + zip) à partir de la version en ligne.
Tout tient dans un seul fichier HTML : il marche même ouvert sans extraire le zip.
Usage : python3 hors-ligne/construire.py <dossier_sortie>"""
import base64, os, shutil, sys, zipfile
ICI = os.path.dirname(os.path.abspath(__file__)); RACINE = os.path.dirname(ICI)
sortie = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.path.join(RACINE, 'dist'))
dossier = os.path.join(sortie, 'Ets-Barry-Facturation')
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
    const cle = f => [nettoyerDate(f.date), f.nom, JSON.stringify(f.lignes), f.vir].join('|');
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
# Avertissement si le navigateur ne peut pas garder les données.
app += """
if (!window.ETSBARRY_HORS_LIGNE.stockageOk) {
  const d = document.createElement('div');
  d.style.cssText = 'margin:16px 0;padding:14px 16px;border:2px solid #b91c1c;border-radius:8px;background:#fef2f2;color:#7f1d1d;line-height:1.5';
  d.innerHTML = '<b>Attention : ce navigateur ne garde pas les factures.</b><br>Elles seront perdues en fermant la page. Avant de fermer, cliquez sur Historique puis « Sauvegarder l\\'historique (fichier) ».';
  document.querySelector('h1').insertAdjacentElement('afterend', d);
}
"""
# Si l'application ne démarre pas, ce message reste visible ; app.js le retire à la fin.
app += "\ndocument.getElementById('demarrage').remove();\n"

import subprocess
ESBUILD = os.environ.get('ESBUILD', 'esbuild')
def ancien(js):
    # Syntaxe compatible avec l'ancien Edge de Windows 10 (EdgeHTML 17-18 : ES2017) .
    return subprocess.run([ESBUILD, '--target=es2017,edge18', '--loader=js', '--charset=utf8', '--log-level=error'],
                          input=js, capture_output=True, text=True, check=True).stdout

def lib(nom):
    t = open(os.path.join(RACINE, 'lib', nom), encoding='utf-8').read() if nom != 'stockage-local.js' else ancien(open(os.path.join(ICI, nom), encoding='utf-8').read())
    return t.replace('</script', '<\\/script')

logo = 'data:image/jpeg;base64,' + base64.b64encode(open(os.path.join(RACINE, 'logo.jpg'), 'rb').read()).decode()
html = open(os.path.join(RACINE, 'index.html'), encoding='utf-8').read()
# Pas d'internet : pas de polices Google (le navigateur prend ses polices habituelles).
html = '\n'.join(l for l in html.split('\n') if 'fonts.googleapis.com' not in l)
html = html.replace('logo.jpg', logo)
html = remplacer(html, 'Facturation Ets Barry</h1>', 'Facturation Ets Barry <small style="font-size:.6em;color:#6b7a72;font-weight:500">· hors ligne</small></h1>')
avert = ('<div id="demarrage" style="margin:16px 0;padding:14px 16px;border:2px solid #b45309;border-radius:8px;background:#fff7ed;color:#7c2d12;line-height:1.5">'
         '<b>L\'application ne démarre pas.</b><br>'
         '1. Si vous avez ouvert le fichier depuis le zip : faites clic droit sur le zip, « Extraire tout », puis ouvrez le fichier extrait.<br>'
         '2. Sinon, ouvrez ce fichier avec Microsoft Edge (clic droit sur le fichier, « Ouvrir avec », « Microsoft Edge »).<br>'
         '<span id="demarrageErreur" style="font-size:.85em;opacity:.8"></span></div>'
         '<script>window.onerror=function(m){var e=document.getElementById("demarrageErreur");if(e)e.textContent="Détail : "+m;};</script>')
i = html.index('</h1>') + len('</h1>')
html = html[:i] + '\n' + avert + html[i:]
scripts = '<script src="lib/supabase.js"></script>\n<script src="lib/jspdf.umd.min.js"></script>\n<script src="lib/jspdf.plugin.autotable.min.js"></script>\n<script src="app.js"></script>'
assert scripts in html
html = html.replace(scripts, ''.join('<script>\n' + t + '\n</script>\n' for t in [lib('stockage-local.js'), lib('jspdf.umd.min.js'), lib('jspdf.plugin.autotable.min.js'), "window.LOGO_DATA = '" + logo + "';", ancien(app).replace('</script', '<\\/script')]))
import datetime
version = datetime.datetime.now().strftime('%d/%m/%Y %H:%M')
i = html.rindex('</body>')
html = html[:i] + '<p style="text-align:center;color:#8a9690;font-size:12px;margin:24px 0">Version hors ligne du ' + version + '</p>\n' + html[i:]
open(os.path.join(dossier, 'Ets-Barry-Facturation-hors-ligne.html'), 'w', encoding='utf-8').write(html)
for f in ['LICENSE-jspdf', 'LICENSE-jspdf-autotable']:
    shutil.copy(os.path.join(RACINE, 'lib', f), os.path.join(dossier, 'lib'))
# Notice lisible par le Bloc-notes de Windows (BOM UTF-8 et fins de ligne Windows).
notice = open(os.path.join(ICI, 'LISEZ-MOI.txt'), encoding='utf-8').read().replace('\r\n', '\n').replace('\n', '\r\n')
open(os.path.join(dossier, 'LISEZ-MOI.txt'), 'w', encoding='utf-8-sig', newline='').write(notice)

z = os.path.join(sortie, 'Ets-Barry-Facturation-hors-ligne.zip')
with zipfile.ZipFile(z, 'w', zipfile.ZIP_DEFLATED) as zf:
    for base, _, fichiers in os.walk(dossier):
        for f in fichiers:
            p = os.path.join(base, f); zf.write(p, os.path.relpath(p, sortie))
print(z)
