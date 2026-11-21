// Facturation Ets Barry : saisie, aperçu, historique (stocké dans le navigateur) et PDF A4.
const ENTREPRISE = {
  nom: 'ETS MAMADOU SALIOU BARRY',
  adresse: "Café l'Arbre, Central Park ex 4C, bureau 2019",
  ninea: '00527234',
  rc: 'SNDKR 2015A17272'
};
const CLE = 'etsbarry-factures-v1';

const $ = id => document.getElementById(id);
// Espaces ordinaires : les polices du PDF n'affichent pas l'espace fine insécable.
const nombre = n => new Intl.NumberFormat('fr-FR').format(Math.round(n || 0)).replace(/[  ]/g, ' ');
const fcfa = n => nombre(n) + ' FCFA';
const aujourdhui = () => new Date().toLocaleDateString('fr-FR');
const numero = no => String(no).padStart(4, '0');
const totalDe = lignes => lignes.reduce((s, l) => s + l.q * l.v, 0);

let factures = [];
let logoData = null; // logo en data URL pour le PDF
fetch('logo.jpg').then(r => r.ok ? r.blob() : null).then(b => { if (!b) return; const fr = new FileReader(); fr.onload = () => logoData = fr.result; fr.readAsDataURL(b); }).catch(() => {});
let enEdition = null; // numéro de la facture en cours de modification

function charger() {
  try { const s = JSON.parse(localStorage.getItem(CLE) || '[]'); if (Array.isArray(s)) factures = s; } catch (e) { factures = []; }
}
function sauver() {
  try { localStorage.setItem(CLE, JSON.stringify(factures)); return true; }
  catch (e) { return false; }
}
const prochainNumero = () => factures.reduce((m, x) => Math.max(m, x.no), 0) + 1;

// ---------- Lignes de produits ----------
let idLigne = 0;
function ajouterLigne(d = '', q = '', v = '') {
  const i = ++idLigne, div = document.createElement('div');
  div.className = 'line';
  div.innerHTML =
    '<label>Désignation<input id="d' + i + '" autocomplete="off"></label>' +
    '<label>Quantité<input id="q' + i + '" type="number" min="0" step="any" inputmode="decimal"></label>' +
    '<label>Valeur (FCFA)<input id="v' + i + '" type="number" min="0" step="1" inputmode="numeric"></label>' +
    '<button type="button" class="del" aria-label="Retirer ce produit">✕</button>';
  $('lines').appendChild(div);
  $('d' + i).value = d; $('q' + i).value = q; $('v' + i).value = v;
  div.querySelectorAll('input').forEach(x => x.addEventListener('input', apercu));
  div.querySelector('.del').addEventListener('click', () => {
    if ($('lines').children.length > 1) { div.remove(); apercu(); }
  });
}
function lireLignes() {
  return [...$('lines').children].map(l => {
    const [d, q, v] = l.querySelectorAll('input');
    return { d: d.value.trim(), q: +q.value || 0, v: +v.value || 0 };
  }).filter(l => l.d || l.q || l.v);
}

// ---------- Aperçu ----------
function apercu() {
  const ls = lireLignes(), vir = +$('virement').value || 0, t = totalDe(ls);
  $('pNo').textContent = 'N° ' + numero(enEdition || prochainNumero());
  $('pDate').textContent = enEdition ? factures.find(f => f.no === enEdition).date : aujourdhui();
  $('pNom').textContent = $('nom').value || '—';
  $('pAdr').textContent = $('adresse').value || '—';
  const tb = $('pLines'); tb.innerHTML = '';
  (ls.length ? ls : [{ d: '—', q: 0, v: 0 }]).forEach(l => {
    const tr = document.createElement('tr');
    [[l.d || 'Marchandise', ''], [nombre(l.q), 'num'], [fcfa(l.v), 'num'], [fcfa(l.q * l.v), 'num']].forEach(([x, c]) => {
      const td = document.createElement('td'); td.textContent = x; if (c) td.className = c; tr.appendChild(td);
    });
    tb.appendChild(tr);
  });
  $('pT').textContent = fcfa(t);
  $('pVir').textContent = fcfa(vir);
  $('pR').textContent = fcfa(Math.max(0, t - vir));
}

function viderFormulaire() {
  enEdition = null;
  $('formTitle').textContent = 'Nouvelle facture';
  $('saveBtn').textContent = 'Enregistrer et télécharger le PDF';
  ['nom', 'adresse', 'virement'].forEach(id => $(id).value = '');
  $('lines').innerHTML = ''; ajouterLigne();
  apercu();
}

function message(t, erreur) { const m = $('msg'); m.textContent = t; m.classList.toggle('err', !!erreur); }

// ---------- Montant en lettres ----------
function enLettres(n) {
  n = Math.round(n);
  if (n === 0) return 'zéro';
  const u = ['', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize'];
  const d = ['', 'dix', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante'];
  const sous100 = x => {
    if (x < 17) return u[x];
    if (x < 20) return 'dix-' + u[x - 10];
    if (x < 70) { const t = Math.floor(x / 10), r = x % 10; return d[t] + (r === 1 ? ' et un' : r ? '-' + u[r] : ''); }
    if (x < 80) return 'soixante' + (x === 71 ? ' et onze' : '-' + sous100(x - 60));
    if (x === 80) return 'quatre-vingts';
    return 'quatre-vingt-' + sous100(x - 80);
  };
  const sous1000 = x => {
    const c = Math.floor(x / 100), r = x % 100;
    let t = c === 0 ? '' : c === 1 ? 'cent' : u[c] + ' cent' + (r === 0 ? 's' : '');
    if (r) t += (t ? ' ' : '') + sous100(r);
    return t;
  };
  const echelles = [[1e12, 'billion'], [1e9, 'milliard'], [1e6, 'million'], [1e3, 'mille']];
  let out = [], reste = n;
  for (const [v, nom] of echelles) {
    const q = Math.floor(reste / v); reste %= v;
    if (!q) continue;
    if (nom === 'mille') out.push(q === 1 ? 'mille' : sous1000(q).replace(/(cent|vingt)s$/, '$1') + ' mille');
    else out.push(enLettres(q) + ' ' + nom + (q > 1 ? 's' : ''));
  }
  if (reste) out.push(sous1000(reste));
  return out.join(' ');
}

// ---------- PDF A4 ----------
function telechargerPDF(f) {
  if (!window.jspdf) { alert("Le module PDF n'a pas pu se charger. Vérifiez la connexion internet."); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const vert = [15, 107, 79], gris = [93, 107, 100];
  const W = 210, M = 18;

  let X = M;
  if (logoData) { try { doc.addImage(logoData, 'JPEG', M, 15, 20, 20); X = M + 25; } catch (e) {} }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(...vert);
  doc.text(ENTREPRISE.nom, X, 22);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...gris);
  doc.text(ENTREPRISE.adresse, X, 28);
  doc.text('NINEA : ' + ENTREPRISE.ninea + '   ·   RC : ' + ENTREPRISE.rc, X, 33);

  doc.setTextColor(23, 32, 28); doc.setFontSize(18); doc.setFont('helvetica', 'bold');
  doc.text('FACTURE', W - M, 22, { align: 'right' });
  doc.setFontSize(10); doc.setFont('helvetica', 'normal');
  doc.text('N° ' + numero(f.no), W - M, 28, { align: 'right' });
  doc.text('Date : ' + f.date, W - M, 33, { align: 'right' });

  doc.setDrawColor(...vert); doc.setLineWidth(0.8); doc.line(M, 40, W - M, 40);

  // Bloc client, encadré
  const encre = [23, 32, 28];
  const adr = doc.splitTextToSize('Adresse (origine) : ' + (f.adresse || '—'), 82);
  const hClient = 16 + adr.length * 5;
  doc.setDrawColor(211, 219, 214); doc.setLineWidth(0.3);
  doc.roundedRect(M, 46, 92, hClient, 1.5, 1.5);
  doc.setFontSize(8); doc.setTextColor(...gris); doc.text('FACTURÉ À', M + 5, 52);
  doc.setFontSize(11); doc.setTextColor(...encre); doc.setFont('helvetica', 'bold');
  doc.text(doc.splitTextToSize(f.nom || '—', 82)[0], M + 5, 58);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  doc.text(adr, M + 5, 64);

  // Tableau des produits
  const total = totalDe(f.lignes), reste = Math.max(0, total - f.vir);
  doc.autoTable({
    startY: 46 + hClient + 8, margin: { left: M, right: M },
    head: [['Désignation', 'Quantité', 'Valeur (FCFA)', 'Montant (FCFA)']],
    body: f.lignes.map(l => [l.d || 'Marchandise', nombre(l.q), nombre(l.v), nombre(l.q * l.v)]),
    styles: { font: 'helvetica', fontSize: 10, cellPadding: 2.5, textColor: encre, lineColor: [211, 219, 214], lineWidth: 0.2 },
    headStyles: { fillColor: vert, textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [244, 247, 245] },
    columnStyles: { 0: { cellWidth: 'auto' }, 1: { halign: 'right', cellWidth: 24 }, 2: { halign: 'right', cellWidth: 36 }, 3: { halign: 'right', cellWidth: 42 } },
    didParseCell: d => { if (d.section === 'head' && d.column.index > 0) d.cell.styles.halign = 'right'; }
  });

  // Totaux : petit tableau aligné à droite, la largeur s'adapte aux montants
  doc.autoTable({
    startY: doc.lastAutoTable.finalY + 6, margin: { left: W - M - 90, right: M }, tableWidth: 90,
    body: [['Total', fcfa(total)], ['Virement reçu', fcfa(f.vir)], ['Reste à payer', fcfa(reste)]],
    theme: 'plain',
    styles: { font: 'helvetica', fontSize: 10.5, cellPadding: 2.2, textColor: encre },
    columnStyles: { 0: { cellWidth: 34 }, 1: { halign: 'right' } },
    didParseCell: d => {
      if (d.row.index === 0) { d.cell.styles.fontStyle = 'bold'; d.cell.styles.fillColor = [226, 236, 231]; }
      if (d.row.index === 2) { d.cell.styles.fontStyle = 'bold'; d.cell.styles.textColor = reste > 0 ? [164, 86, 11] : vert; }
    }
  });

  // Montant en lettres
  let y = doc.lastAutoTable.finalY + 10;
  doc.setFontSize(10); doc.setTextColor(...encre);
  const lettres = doc.splitTextToSize('Arrêtée la présente facture à la somme de : ' + enLettres(total) + ' francs CFA.', W - 2 * M);
  doc.setFont('helvetica', 'italic'); doc.text(lettres, M, y);
  y += lettres.length * 5 + 12;

  // Signature
  if (y > 250) { doc.addPage(); y = 30; }
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  doc.text('Signature et cachet', W - M, y, { align: 'right' });

  // Pied de page
  doc.setDrawColor(211, 219, 214); doc.setLineWidth(0.3); doc.line(M, 279, W - M, 279);
  doc.setFontSize(8); doc.setTextColor(...gris);
  doc.text(ENTREPRISE.nom + ' · ' + ENTREPRISE.adresse + ' · NINEA ' + ENTREPRISE.ninea + ' · RC ' + ENTREPRISE.rc, W / 2, 284, { align: 'center' });
  doc.text('Merci de votre confiance.', W / 2, 288, { align: 'center' });

  doc.save('Facture-' + numero(f.no) + '-' + (f.nom || 'client').replace(/[^\p{L}\p{N}]+/gu, '-') + '.pdf');
}

// ---------- Historique ----------
function afficherHistorique() {
  const q = $('search').value.trim().toLowerCase();
  const liste = factures
    .filter(f => !q || [f.nom, f.adresse, numero(f.no)].join(' ').toLowerCase().includes(q))
    .sort((a, b) => b.no - a.no);
  const tb = $('hist'); tb.innerHTML = '';
  liste.forEach(f => {
    const total = totalDe(f.lignes), payee = f.vir >= total;
    const tr = document.createElement('tr');
    [numero(f.no), f.date, f.nom, f.adresse].forEach(t => { const td = document.createElement('td'); td.textContent = t; tr.appendChild(td); });
    const tt = document.createElement('td'); tt.className = 'num'; tt.textContent = fcfa(total); tr.appendChild(tt);
    const st = document.createElement('td'); const p = document.createElement('span');
    p.className = 'pill' + (payee ? '' : ' part'); p.textContent = payee ? 'Payée' : 'Reste ' + fcfa(total - f.vir);
    st.appendChild(p); tr.appendChild(st);
    const ac = document.createElement('td'); const box = document.createElement('div'); box.className = 'acts';
    const b = (txt, cls, fn) => { const x = document.createElement('button'); x.type = 'button'; x.className = cls + ' small'; x.textContent = txt; x.addEventListener('click', fn); box.appendChild(x); return x; };
    b('PDF', 'ghost', () => telechargerPDF(f));
    b('Modifier', 'ghost', () => modifier(f.no));
    const sup = b('Supprimer', 'danger', () => {
      if (sup.dataset.ok) { factures = factures.filter(x => x.no !== f.no); sauver(); afficherHistorique(); }
      else { sup.dataset.ok = '1'; sup.textContent = 'Confirmer ?'; setTimeout(() => { delete sup.dataset.ok; sup.textContent = 'Supprimer'; }, 3000); }
    });
    ac.appendChild(box); tr.appendChild(ac);
    tb.appendChild(tr);
  });
  $('histEmpty').hidden = factures.length > 0;
  const tot = factures.reduce((s, f) => s + totalDe(f.lignes), 0);
  const recu = factures.reduce((s, f) => s + Math.min(f.vir, totalDe(f.lignes)), 0);
  $('stats').innerHTML = '';
  [['Factures', nombre(factures.length)], ['Total facturé', fcfa(tot)], ['Reçu par virement', fcfa(recu)], ['Reste à encaisser', fcfa(tot - recu)]]
    .forEach(([k, v]) => { const d = document.createElement('div'); d.textContent = k; const bb = document.createElement('b'); bb.textContent = v; d.appendChild(bb); $('stats').appendChild(d); });
}

function modifier(no) {
  const f = factures.find(x => x.no === no); if (!f) return;
  enEdition = no;
  $('formTitle').textContent = 'Modifier la facture N° ' + numero(no);
  $('saveBtn').textContent = 'Enregistrer les changements et télécharger le PDF';
  $('nom').value = f.nom; $('adresse').value = f.adresse; $('virement').value = f.vir || '';
  $('lines').innerHTML = ''; f.lignes.forEach(l => ajouterLigne(l.d, l.q, l.v));
  if (!f.lignes.length) ajouterLigne();
  montrer('new'); apercu(); message('');
}

function montrer(vue) {
  $('viewNew').hidden = vue !== 'new';
  $('viewHist').hidden = vue !== 'hist';
  $('tabNew').toggleAttribute('aria-current', vue === 'new'); if (vue === 'new') $('tabNew').setAttribute('aria-current', 'page');
  $('tabHist').toggleAttribute('aria-current', vue === 'hist'); if (vue === 'hist') $('tabHist').setAttribute('aria-current', 'page');
  if (vue === 'hist') afficherHistorique();
}

// ---------- Événements ----------
$('f').addEventListener('submit', e => {
  e.preventDefault();
  const lignes = lireLignes();
  if (!$('nom').value.trim()) return message('Indiquez le nom du client.', true);
  if (!lignes.length || lignes.some(l => l.q <= 0)) return message('Ajoutez au moins un produit avec une quantité.', true);
  if (lignes.some(l => l.v > 1e10 || l.q > 1e7) || totalDe(lignes) > 1e13) return message('Un montant est trop grand. Vérifiez les quantités et les valeurs.', true);
  const data = { nom: $('nom').value.trim(), adresse: $('adresse').value.trim(), lignes, vir: +$('virement').value || 0 };
  let f;
  if (enEdition) { f = factures.find(x => x.no === enEdition); Object.assign(f, data); }
  else { f = { no: prochainNumero(), date: aujourdhui(), ...data }; factures.push(f); }
  const ok = sauver();
  telechargerPDF(f);
  viderFormulaire();
  message(ok ? 'Facture N° ' + numero(f.no) + ' enregistrée.' : "Facture créée, mais le navigateur n'a pas pu l'enregistrer dans l'historique.", !ok);
});
['nom', 'adresse', 'virement'].forEach(id => $(id).addEventListener('input', apercu));
$('addLine').addEventListener('click', () => { ajouterLigne(); apercu(); });
$('reset').addEventListener('click', () => { viderFormulaire(); message(''); });
$('tabNew').addEventListener('click', () => montrer('new'));
$('tabHist').addEventListener('click', () => montrer('hist'));
$('search').addEventListener('input', afficherHistorique);

$('exportBtn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(factures, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = 'historique-ets-barry-' + new Date().toISOString().slice(0, 10) + '.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
$('importFile').addEventListener('change', async e => {
  const file = e.target.files[0]; if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data)) throw new Error();
    const parNo = new Map(factures.map(f => [f.no, f]));
    data.forEach(f => { if (f && f.no && Array.isArray(f.lignes)) parNo.set(f.no, f); });
    factures = [...parNo.values()]; sauver(); afficherHistorique();
  } catch (err) { alert("Ce fichier n'est pas une sauvegarde de l'historique."); }
  e.target.value = '';
});

$('coName').textContent = ENTREPRISE.nom;
$('coInfo').innerHTML = '';
[ENTREPRISE.adresse, 'NINEA : ' + ENTREPRISE.ninea + ' · RC : ' + ENTREPRISE.rc].forEach((t, i) => {
  if (i) $('coInfo').appendChild(document.createElement('br')); $('coInfo').appendChild(document.createTextNode(t));
});

charger();
viderFormulaire();
