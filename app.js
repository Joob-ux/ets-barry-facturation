// Facturation Ets Barry : saisie, aperçu, historique (stocké dans le navigateur) et PDF A4.
const ENTREPRISE = {
  nom: 'ETS MAMADOU SADIO BARRY',
  adresse: "Café Graine, Central Park ex 4C, bureau 2019",
  ninea: '00527234',
  rc: 'SNDKR 2015A17272',
  slogan: 'Vente de café en graines en gros, demi-gros et détail'
};
// Réglage de l'accès sans connexion (phase de test) :
//   'ouvert'  = tout le monde peut tout faire (factures, clients) — test en cours
//   'lecture' = tout le monde voit tout, sans rien modifier
//   'code'    = espace client par code (version normale)
// Pour revenir à 'code', lancer aussi supabase/fermer-acces-public.sql dans Supabase.
const ACCES = 'ouvert';
const BANQUES = ['CBAO', 'Ecobank', 'Banque Agricole', 'Banque Atlantique', 'Bank of Africa', 'Banque Islamique du Sénégal'];
const CLE = 'etsbarry-factures-v1';
const CLE_CLIENTS = 'etsbarry-clients-v1';
const PRODUIT = 'CAFÉ EN GRAINES';

const $ = id => document.getElementById(id);
// Espaces ordinaires : les polices du PDF n'affichent pas l'espace fine insécable.
const nombre = n => new Intl.NumberFormat('fr-FR').format(Math.round(n || 0)).replace(/[  ]/g, ' ');
const fcfa = n => nombre(n) + ' FCFA';
const aujourdhui = () => new Date().toLocaleDateString('fr-FR');
const numero = no => String(no).padStart(4, '0');
const totalDe = lignes => lignes.reduce((s, l) => s + l.q * l.v, 0);

let factures = [];
let clients = []; // { code: 'C001', nom, adresse }
let logoData = null; // logo en data URL pour le PDF
fetch('logo.jpg').then(r => r.ok ? r.blob() : null).then(b => { if (!b) return; const fr = new FileReader(); fr.onload = () => logoData = fr.result; fr.readAsDataURL(b); }).catch(() => {});
let enEdition = null; // numéro de la facture en cours de modification

// ---------- Base en ligne (Supabase) ----------
// La clé publique ne donne accès à rien seule : les règles de la base n'autorisent
// que les administrateurs connectés, et l'espace client ne lit qu'un compte par son code.
const SUPABASE_URL = 'https://yjxwwruceolwkwmmknul.supabase.co';
const SUPABASE_KEY = 'sb_publishable_FQTKc9ddrtuQ9j5o2x-Dhg_H-wAELPY';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const T_CLIENTS = 'etsbarry_clients', T_FACTURES = 'etsbarry_factures';
const enNombres = f => ({ ...f, no: Number(f.no), vir: Number(f.vir) || 0, lignes: (f.lignes || []).map(l => ({ d: l.d, q: Number(l.q) || 0, v: Number(l.v) || 0 })) });

async function charger() {
  const [c, f] = await Promise.all([
    sb.from(T_CLIENTS).select('code,nom,adresse').order('code'),
    sb.from(T_FACTURES).select('no,code,date,nom,adresse,lignes,vir,banque,compte').order('no')
  ]);
  if (c.error || f.error) throw (c.error || f.error);
  clients = c.data; factures = f.data.map(enNombres);
}
async function enregistrerClient(c) {
  const { error } = await sb.from(T_CLIENTS).upsert({ code: c.code, nom: c.nom, adresse: c.adresse });
  if (error) throw error;
}
async function enregistrerFacture(f) {
  const ligne = { code: f.code, date: f.date, nom: f.nom, adresse: f.adresse, lignes: f.lignes, vir: f.vir, banque: f.banque || '', compte: f.compte || '' };
  if (f.no) ligne.no = f.no;
  const { data, error } = await sb.from(T_FACTURES).upsert(ligne).select('no').single();
  if (error) throw error;
  f.no = Number(data.no);
}
async function supprimerFacture(no) {
  const { error } = await sb.from(T_FACTURES).delete().eq('no', no);
  if (error) throw error;
}
// Un nouveau client, avec le code choisi par le gérant.
async function creerClient(code, nom, adresse) {
  const c = { code, nom: nom.trim(), adresse: (adresse || '').trim() };
  const { error } = await sb.from(T_CLIENTS).insert(c);
  if (error) throw error.code === '23505' ? new Error('Le code ' + code + ' est déjà utilisé par un autre client.') : error;
  clients.push(c); return c;
}
// Code saisi par le gérant : majuscules, chiffres et tirets (les espaces deviennent des tirets).
const normaliserCode = v => (v || '').trim().toUpperCase().replace(/\s+/g, '-');
const codeValide = v => /^[A-Z0-9-]{1,20}$/.test(v);
const erreurReseau = e => "Impossible d'enregistrer en ligne. Vérifiez la connexion internet et réessayez." + (e && e.message ? ' (' + e.message + ')' : '');

// ---------- Clients ----------
const normal = t => (t || '').trim().toLowerCase();
const trouverClient = code => clients.find(c => normal(c.code) === normal(code));
const LETTRES_CODE = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sans 0/O, 1/I/L pour éviter les confusions
function nouveauCode() {
  const r = crypto.getRandomValues(new Uint32Array(6));
  return [...r].map(x => LETTRES_CODE[x % LETTRES_CODE.length]).join('');
}
const facturesDe = code => factures.filter(f => f.code === code).sort((a, b) => b.no - a.no);
function remplirCodes() {
  const dl = $('codesList'); dl.innerHTML = '';
  clients.forEach(c => { const o = document.createElement('option'); o.value = c.code; o.label = c.nom; dl.appendChild(o); });
}
function verifierCode() {
  const v = $('code').value.trim(), h = $('codeHint');
  h.className = 'hint';
  if (!v) { h.textContent = "Tapez le code d'un client existant, ou un nouveau code pour créer le client."; return; }
  const c = trouverClient(v);
  if (c) { h.textContent = 'Client trouvé : ' + c.nom; h.classList.add('ok'); $('nom').value = c.nom; $('adresse').value = c.adresse; }
  else if (!codeValide(normaliserCode(v))) { h.textContent = 'Code non valide : lettres, chiffres et tirets seulement.'; h.classList.add('bad'); }
  else { h.textContent = 'Nouveau client : il sera créé avec le code ' + normaliserCode(v) + '.'; }
  apercu();
}

// ---------- Lignes de produits ----------
let idLigne = 0;
function ajouterLigne(q = '', v = '') {
  const d = PRODUIT;
  const i = ++idLigne, div = document.createElement('div');
  div.className = 'line';
  div.innerHTML =
    '<label>Désignation<input id="d' + i + '" readonly tabindex="-1"></label>' +
    '<label>Quantité<input id="q' + i + '" type="number" min="0" step="any" inputmode="decimal"></label>' +
    '<label>Prix unitaire (FCFA)<input id="v' + i + '" type="number" min="0" step="1" inputmode="numeric"></label>' +
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
    return { d: PRODUIT, q: +q.value || 0, v: +v.value || 0 };
  }).filter(l => l.q || l.v);
}

// ---------- Aperçu ----------
function apercu() {
  const ls = lireLignes(), vir = +$('virement').value || 0, t = totalDe(ls);
  $('pNo').textContent = enEdition ? 'N° ' + numero(enEdition) : 'N° (à l\'enregistrement)';
  $('pDate').textContent = enEdition ? factures.find(f => f.no === enEdition).date : aujourdhui();
  $('pNom').textContent = $('nom').value || '—';
  const cc = trouverClient($('code').value);
  $('pCode').textContent = cc ? '· Code client ' + cc.code : '';
  $('pAdr').textContent = $('adresse').value || '—';
  const tb = $('pLines'); tb.innerHTML = '';
  (ls.length ? ls : [{ d: PRODUIT, q: 0, v: 0 }]).forEach(l => {
    const tr = document.createElement('tr');
    [[l.d || 'Marchandise', ''], [nombre(l.q), 'num'], [fcfa(l.v), 'num'], [fcfa(l.q * l.v), 'num']].forEach(([x, c]) => {
      const td = document.createElement('td'); td.textContent = x; if (c) td.className = c; tr.appendChild(td);
    });
    tb.appendChild(tr);
  });
  $('pT').textContent = fcfa(t);
  $('pVir').textContent = fcfa(vir);
  $('pBanque').textContent = $('banque').value ? 'Banque : ' + $('banque').value + ($('compte').value.trim() ? ' · N° ' + $('compte').value.trim() : '') : '';
  $('pR').textContent = fcfa(Math.max(0, t - vir));
}

function viderFormulaire() {
  enEdition = null;
  $('formTitle').textContent = 'Nouvelle facture';
  $('saveBtn').textContent = 'Enregistrer et télécharger le PDF';
  ['code', 'nom', 'adresse', 'virement', 'banque', 'compte'].forEach(id => $(id).value = '');
  verifierCode();
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
  doc.setFont('helvetica', 'bold'); doc.setTextColor(23, 32, 28); doc.text(ENTREPRISE.slogan, X, 27.5);
  doc.setFont('helvetica', 'normal'); doc.setTextColor(...gris);
  doc.text(ENTREPRISE.adresse, X, 32);
  doc.text('NINEA : ' + ENTREPRISE.ninea + '   ·   RC : ' + ENTREPRISE.rc, X, 36.5);

  doc.setTextColor(23, 32, 28); doc.setFontSize(18); doc.setFont('helvetica', 'bold');
  doc.text('FACTURE', W - M, 22, { align: 'right' });
  doc.setFontSize(10); doc.setFont('helvetica', 'normal');
  doc.text('N° ' + numero(f.no), W - M, 28, { align: 'right' });
  doc.text('Date : ' + f.date, W - M, 33, { align: 'right' });

  doc.setDrawColor(...vert); doc.setLineWidth(0.8); doc.line(M, 41, W - M, 41);

  // Bloc client, encadré
  const encre = [23, 32, 28];
  const adr = doc.splitTextToSize('Adresse (origine) : ' + (f.adresse || '—'), 82);
  const hClient = 16 + adr.length * 5;
  doc.setDrawColor(211, 219, 214); doc.setLineWidth(0.3);
  doc.roundedRect(M, 46, 92, hClient, 1.5, 1.5);
  doc.setFontSize(8); doc.setTextColor(...gris); doc.text('FACTURÉ À' + (f.code ? '   ·   CODE CLIENT : ' + f.code : ''), M + 5, 52);
  doc.setFontSize(11); doc.setTextColor(...encre); doc.setFont('helvetica', 'bold');
  doc.text(doc.splitTextToSize(f.nom || '—', 82)[0], M + 5, 58);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  doc.text(adr, M + 5, 64);

  // Tableau des produits
  const total = totalDe(f.lignes), reste = Math.max(0, total - f.vir);
  doc.autoTable({
    startY: 46 + hClient + 8, margin: { left: M, right: M },
    head: [['Désignation', 'Quantité', 'Prix unitaire (FCFA)', 'Montant (FCFA)']],
    body: f.lignes.map(l => [l.d || 'Marchandise', nombre(l.q), nombre(l.v), nombre(l.q * l.v)]),
    styles: { font: 'helvetica', fontSize: 10, cellPadding: 2.5, textColor: encre, lineColor: [211, 219, 214], lineWidth: 0.2 },
    headStyles: { fillColor: vert, textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [244, 247, 245] },
    columnStyles: { 0: { cellWidth: 'auto' }, 1: { halign: 'right', cellWidth: 24 }, 2: { halign: 'right', cellWidth: 38 }, 3: { halign: 'right', cellWidth: 42 } },
    didParseCell: d => { if (d.section === 'head' && d.column.index > 0) d.cell.styles.halign = 'right'; }
  });

  // Totaux : petit tableau aligné à droite, la largeur s'adapte aux montants
  doc.autoTable({
    startY: doc.lastAutoTable.finalY + 6, margin: { left: W - M - 100, right: M }, tableWidth: 100,
    body: [['Total', fcfa(total)], ['Virement reçu', fcfa(f.vir)], ...(f.banque ? [['Banque', f.banque]] : []), ...(f.banque && f.compte ? [['N° de compte', f.compte]] : []), ['Net à payer', fcfa(reste)]],
    theme: 'plain',
    styles: { font: 'helvetica', fontSize: 10.5, cellPadding: 2.2, textColor: encre },
    columnStyles: { 0: { cellWidth: 36 }, 1: { halign: 'right' } },
    didParseCell: d => {
      if (d.row.index === 0) { d.cell.styles.fontStyle = 'bold'; d.cell.styles.fillColor = [226, 236, 231]; }
      if (d.row.raw[0] === 'Banque' || d.row.raw[0] === 'N° de compte') { d.cell.styles.textColor = gris; d.cell.styles.fontSize = 9.5; }
      if (d.row.raw[0] === 'Net à payer') { d.cell.styles.fontStyle = 'bold'; d.cell.styles.textColor = reste > 0 ? [164, 86, 11] : vert; }
    }
  });

  // Montant en lettres
  let y = doc.lastAutoTable.finalY + 10;
  doc.setFontSize(10); doc.setTextColor(...encre);
  const lettres = doc.splitTextToSize('Arrêtée la présente facture à la somme de : ' + enLettres(total) + ' francs CFA.', W - 2 * M);
  doc.setFont('helvetica', 'italic'); doc.text(lettres, M, y);
  y += lettres.length * 5 + 12;

  // Signature
  if (y > 245) { doc.addPage(); y = 30; }
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
  doc.text('LE GÉRANT', W - M, y, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(93, 107, 100);
  doc.text('Signature et cachet', W - M, y + 5, { align: 'right' });

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
    .filter(f => !q || [f.nom, f.adresse, numero(f.no), f.banque || '', f.code || ''].join(' ').toLowerCase().includes(q))
    .sort((a, b) => b.no - a.no);
  const tb = $('hist'); tb.innerHTML = '';
  liste.forEach(f => {
    const total = totalDe(f.lignes), payee = f.vir >= total;
    const tr = document.createElement('tr');
    [numero(f.no), f.date, (f.code ? f.code + ' · ' : '') + f.nom, f.adresse].forEach(t => { const td = document.createElement('td'); td.textContent = t; tr.appendChild(td); });
    const tt = document.createElement('td'); tt.className = 'num'; tt.textContent = fcfa(total); tr.appendChild(tt);
    const bq = document.createElement('td'); bq.textContent = f.banque || '—'; tr.appendChild(bq);
    const st = document.createElement('td'); const p = document.createElement('span');
    p.className = 'pill' + (payee ? '' : ' part'); p.textContent = payee ? 'Payée' : 'Reste ' + fcfa(total - f.vir);
    st.appendChild(p); tr.appendChild(st);
    const ac = document.createElement('td'); const box = document.createElement('div'); box.className = 'acts';
    const b = (txt, cls, fn) => { const x = document.createElement('button'); x.type = 'button'; x.className = cls + ' small'; x.textContent = txt; x.addEventListener('click', fn); box.appendChild(x); return x; };
    b('PDF', 'ghost', () => telechargerPDF(f));
    b('Modifier', 'ghost admin-only', () => modifier(f.no));
    const sup = b('Supprimer', 'danger admin-only', () => {
      if (sup.dataset.ok) {
        supprimerFacture(f.no).then(() => { factures = factures.filter(x => x.no !== f.no); afficherHistorique(); })
          .catch(e => { sup.textContent = 'Erreur'; console.error(e); });
      }
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

function afficherClients() {
  const q = normal($('codeSearch').value);
  const exact = q && trouverClient(q);
  const liste = exact ? [exact] : clients.filter(c => !q || normal(c.code).includes(q) || normal(c.nom).includes(q));
  const tb = $('clientsBody'); tb.innerHTML = '';
  liste.sort((a, b) => a.code.localeCompare(b.code)).forEach(c => {
    const fs = facturesDe(c.code), tot = fs.reduce((s, f) => s + totalDe(f.lignes), 0);
    const reste = fs.reduce((s, f) => s + Math.max(0, totalDe(f.lignes) - f.vir), 0);
    const tr = document.createElement('tr');
    [[c.code, 'code'], [c.nom, ''], [c.adresse, ''], [nombre(fs.length), 'num'], [fcfa(tot), 'num'], [fcfa(reste), 'num']].forEach(([t, cl]) => {
      const td = document.createElement('td'); td.textContent = t; if (cl) td.className = cl; tr.appendChild(td);
    });
    const td = document.createElement('td'); const bx = document.createElement('div'); bx.className = 'acts';
    const b1 = document.createElement('button'); b1.type = 'button'; b1.className = 'ghost small'; b1.textContent = 'Voir les factures';
    b1.textContent = 'Ouvrir le compte';
    const ouvrir = () => { $('codeSearch').value = c.code; afficherClients(); $('clientDetail').scrollIntoView({ behavior: 'smooth', block: 'start' }); };
    b1.addEventListener('click', e => { e.stopPropagation(); ouvrir(); });
    tr.addEventListener('click', ouvrir);
    tr.tabIndex = 0; tr.addEventListener('keydown', e => { if (e.key === 'Enter') ouvrir(); });
    bx.appendChild(b1); td.appendChild(bx); tr.appendChild(td);
    tb.appendChild(tr);
  });
  $('clientsEmpty').hidden = clients.length > 0;

  const det = $('clientDetail'); det.innerHTML = ''; det.hidden = !exact;
  if (!exact) return;
  det.appendChild(carteCompte(exact, facturesDe(exact.code), true));
}

// Carte d'un compte client (espace admin et espace client).
function carteCompte(c, fs, admin) {
  const tot = fs.reduce((s, f) => s + totalDe(f.lignes), 0), recu = fs.reduce((s, f) => s + Math.min(f.vir, totalDe(f.lignes)), 0);
  const card = document.createElement('div'); card.className = 'card';
  const h = document.createElement('h3'); h.textContent = c.code + ' · ' + c.nom; card.appendChild(h);
  const sub = document.createElement('div'); sub.className = 'stats';
  [['Origine', c.adresse || '—'], ['Factures', nombre(fs.length)], ['Total facturé', fcfa(tot)], ['Reçu', fcfa(recu)], ['Reste à payer', fcfa(tot - recu)]]
    .forEach(([k, v]) => { const d = document.createElement('div'); d.textContent = k; const bb = document.createElement('b'); bb.textContent = v; d.appendChild(bb); sub.appendChild(d); });
  card.appendChild(sub);
  const wrap = document.createElement('div'); wrap.className = 'tbl';
  const t = document.createElement('table');
  t.innerHTML = '<thead><tr><th>N°</th><th>Date</th><th class="num">Quantité</th><th class="num">Total</th><th>Banque</th><th>État</th><th></th></tr></thead>';
  const body = document.createElement('tbody');
  fs.forEach(f => {
    const total = totalDe(f.lignes), payee = f.vir >= total;
    const tr = document.createElement('tr');
    [[numero(f.no), ''], [f.date, ''], [nombre(f.lignes.reduce((s, l) => s + l.q, 0)), 'num'], [fcfa(total), 'num'], [f.banque || '—', '']].forEach(([x, cl]) => {
      const td = document.createElement('td'); td.textContent = x; if (cl) td.className = cl; tr.appendChild(td);
    });
    const st = document.createElement('td'); const p = document.createElement('span');
    p.className = 'pill' + (payee ? '' : ' part'); p.textContent = payee ? 'Payée' : 'Reste ' + fcfa(total - f.vir); st.appendChild(p); tr.appendChild(st);
    const td = document.createElement('td'); const b = document.createElement('button'); b.type = 'button'; b.className = 'ghost small'; b.textContent = 'PDF';
    b.addEventListener('click', () => telechargerPDF(f)); td.appendChild(b); tr.appendChild(td);
    body.appendChild(tr);
  });
  t.appendChild(body); wrap.appendChild(t);
  if (fs.length) card.appendChild(wrap);
  else { const v = document.createElement('div'); v.className = 'empty'; v.textContent = 'Aucune facture pour le moment.'; card.appendChild(v); }
  if (!admin) return card;
  const acts = document.createElement('div'); acts.className = 'row-actions';
  const nb = document.createElement('button'); nb.type = 'button'; nb.className = 'primary small admin-only'; nb.textContent = 'Nouvelle facture pour ce client';
  nb.addEventListener('click', () => { viderFormulaire(); $('code').value = c.code; verifierCode(); montrer('new'); message(''); });
  acts.appendChild(nb);
  const ed = document.createElement('button'); ed.type = 'button'; ed.className = 'ghost small admin-only'; ed.textContent = 'Modifier le client';
  ed.addEventListener('click', () => ouvrirFormClient(c)); acts.appendChild(ed);
  const back = document.createElement('button'); back.type = 'button'; back.className = 'ghost small'; back.textContent = 'Tous les clients';
  back.addEventListener('click', () => { $('codeSearch').value = ''; afficherClients(); }); acts.appendChild(back);
  card.appendChild(acts);
  return card;
}

// ---------- Ajouter / modifier un client ----------
let clientEnEdition = null;
function ouvrirFormClient(c) {
  clientEnEdition = c || null;
  $('clientForm').hidden = false;
  $('clientFormTitle').textContent = c ? 'Modifier le client ' + c.code : 'Nouveau client';
  $('cSave').textContent = c ? 'Enregistrer' : 'Créer le client';
  $('cNom').value = c ? c.nom : ''; $('cAdresse').value = c ? c.adresse : '';
  $('cCode').value = c ? c.code : ''; $('cCode').readOnly = !!c;
  $('cCodeHint').textContent = c ? 'Le code client ne peut pas être changé.' : 'Choisissez le code du client : lettres, chiffres et tirets (ex. BARRY-01).';
  $('cMsg').textContent = '';
  (c ? $('cNom') : $('cCode')).focus();
}
$('addClientBtn').addEventListener('click', () => ouvrirFormClient(null));
$('cCancel').addEventListener('click', () => { $('clientForm').hidden = true; });
$('clientForm').addEventListener('submit', async e => {
  e.preventDefault();
  const nom = $('cNom').value.trim(), adresse = $('cAdresse').value.trim();
  const m = $('cMsg'); m.classList.add('err');
  const code = normaliserCode($('cCode').value);
  if (!clientEnEdition) {
    if (!code) { m.textContent = 'Indiquez le code du client.'; return; }
    if (!codeValide(code)) { m.textContent = 'Code non valide : lettres, chiffres et tirets seulement, 20 caractères au plus.'; return; }
    if (trouverClient(code)) { m.textContent = 'Le code ' + code + ' est déjà utilisé par ' + trouverClient(code).nom + '.'; return; }
  }
  if (!nom) { m.textContent = 'Indiquez le nom du client.'; return; }
  const meme = clients.find(x => normal(x.nom) === normal(nom) && x !== clientEnEdition);
  if (meme) { m.textContent = 'Ce client existe déjà avec le code ' + meme.code + '.'; return; }
  let c = clientEnEdition;
  $('cSave').disabled = true;
  try {
    if (c) { c.nom = nom; c.adresse = adresse; await enregistrerClient(c); }
    else c = await creerClient(code, nom, adresse);
  } catch (err) { m.textContent = err.message && err.message.startsWith('Le code') ? err.message : erreurReseau(err); return; }
  finally { $('cSave').disabled = false; }
  remplirCodes();
  $('clientForm').hidden = true;
  $('codeSearch').value = c.code; afficherClients();
});

function modifier(no) {
  const f = factures.find(x => x.no === no); if (!f) return;
  enEdition = no;
  $('formTitle').textContent = 'Modifier la facture N° ' + numero(no);
  $('saveBtn').textContent = 'Enregistrer les changements et télécharger le PDF';
  $('code').value = f.code || ''; verifierCode();
  $('nom').value = f.nom; $('adresse').value = f.adresse; $('virement').value = f.vir || ''; $('banque').value = f.banque || ''; $('compte').value = f.compte || '';
  $('lines').innerHTML = ''; f.lignes.forEach(l => ajouterLigne(l.q, l.v));
  if (!f.lignes.length) ajouterLigne();
  montrer('new'); apercu(); message('');
}

function montrer(vue) {
  $('viewNew').hidden = vue !== 'new';
  $('viewHist').hidden = vue !== 'hist';
  $('viewClients').hidden = vue !== 'clients';
  $('tabClients').toggleAttribute('aria-current', vue === 'clients'); if (vue === 'clients') $('tabClients').setAttribute('aria-current', 'page');
  if (vue === 'clients') afficherClients();
  $('tabNew').toggleAttribute('aria-current', vue === 'new'); if (vue === 'new') $('tabNew').setAttribute('aria-current', 'page');
  $('tabHist').toggleAttribute('aria-current', vue === 'hist'); if (vue === 'hist') $('tabHist').setAttribute('aria-current', 'page');
  if (vue === 'hist') afficherHistorique();
}

// ---------- Événements ----------
$('f').addEventListener('submit', async e => {
  e.preventDefault();
  const lignes = lireLignes();
  if (!$('nom').value.trim()) return message('Indiquez le nom du client.', true);
  if (!lignes.length || lignes.some(l => l.q <= 0)) return message('Ajoutez au moins un produit avec une quantité.', true);
  if (lignes.some(l => l.v > 1e10 || l.q > 1e7) || totalDe(lignes) > 1e13) return message('Un montant est trop grand. Vérifiez les quantités et les prix unitaires.', true);
  if ((+$('virement').value || 0) > 0 && !$('banque').value) return message('Choisissez la banque du virement.', true);
  const nom = $('nom').value.trim(), adresse = $('adresse').value.trim();
  const code = normaliserCode($('code').value);
  if (!code) return message('Indiquez le code client.', true);
  let client = trouverClient(code);
  if (!client && !codeValide(code)) return message('Code client non valide : lettres, chiffres et tirets seulement.', true);
  $('saveBtn').disabled = true; message('Enregistrement en ligne…');
  let f;
  try {
    if (!client) client = await creerClient(code, nom, adresse);
    else if (client.nom !== nom || client.adresse !== adresse) { client.nom = nom; client.adresse = adresse; await enregistrerClient(client); }
    const data = { code: client.code, nom, adresse, lignes, vir: +$('virement').value || 0, banque: $('banque').value, compte: $('banque').value ? $('compte').value.trim() : '' };
    if (enEdition) f = { ...factures.find(x => x.no === enEdition), ...data };
    else f = { date: aujourdhui(), ...data };
    await enregistrerFacture(f);
  } catch (err) { $('saveBtn').disabled = false; return message(err.message && err.message.startsWith('Le code') ? err.message : erreurReseau(err), true); }
  $('saveBtn').disabled = false;
  const i = factures.findIndex(x => x.no === f.no);
  if (i >= 0) factures[i] = f; else factures.push(f);
  telechargerPDF(f);
  viderFormulaire();
  remplirCodes();
  message('Facture N° ' + numero(f.no) + ' enregistrée pour le client ' + f.code + '.');
});
['nom', 'adresse', 'virement', 'banque'].forEach(id => $(id).addEventListener('input', apercu));
$('code').addEventListener('input', verifierCode);
$('tabClients').addEventListener('click', () => montrer('clients'));
$('codeSearch').addEventListener('input', afficherClients);
$('banque').addEventListener('change', () => {
  // Reprend le dernier numéro de compte utilisé avec cette banque.
  const b = $('banque').value, der = factures.slice().reverse().find(f => f.banque === b && f.compte);
  $('compte').value = der ? der.compte : '';
  apercu();
});
$('compte').addEventListener('input', apercu);
$('addLine').addEventListener('click', () => { ajouterLigne(); apercu(); });
$('reset').addEventListener('click', () => { viderFormulaire(); message(''); });
$('tabNew').addEventListener('click', () => montrer('new'));
$('tabHist').addEventListener('click', () => montrer('hist'));
$('search').addEventListener('input', afficherHistorique);

$('exportBtn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ factures, clients }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = 'historique-ets-barry-' + new Date().toISOString().slice(0, 10) + '.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
// Envoie en ligne des factures venant d'une sauvegarde ou de l'ancien stockage du navigateur.
// Les anciens numéros ne sont pas gardés : la base donne un nouveau numéro à chaque facture.
async function importer(liste, anciensClients) {
  const codes = new Map(); // ancien code ou nom -> client en ligne
  let n = 0;
  for (const f of liste.slice().sort((a, b) => a.no - b.no)) {
    if (!f || !Array.isArray(f.lignes)) continue;
    const ancien = anciensClients.find(c => c.code === f.code);
    const nom = (ancien ? ancien.nom : f.nom) || 'Client', adresse = (ancien ? ancien.adresse : f.adresse) || '';
    const cle = normal(nom);
    let c = codes.get(cle) || clients.find(x => normal(x.nom) === cle);
    if (!c) { let k = nouveauCode(); while (trouverClient(k)) k = nouveauCode(); c = await creerClient(k, nom, adresse); }
    codes.set(cle, c);
    const nf = { code: c.code, date: f.date || aujourdhui(), nom: c.nom, adresse: c.adresse,
      lignes: f.lignes.map(l => ({ d: PRODUIT, q: +l.q || 0, v: +l.v || 0 })), vir: +f.vir || 0, banque: f.banque || '', compte: f.compte || '' };
    await enregistrerFacture(nf); factures.push(nf); n++;
  }
  remplirCodes(); afficherHistorique();
  $('importMsg').textContent = n + ' facture(s) envoyée(s) en ligne.';
  return n;
}

$('importFile').addEventListener('change', async e => {
  const file = e.target.files[0]; if (!file) return;
  try {
    const brut = JSON.parse(await file.text());
    const data = Array.isArray(brut) ? brut : brut && brut.factures;
    if (!Array.isArray(data)) throw new Error('format');
    await importer(data, brut.clients || []);
  } catch (err) { $('importMsg').textContent = err && err.message === 'format' || err instanceof SyntaxError ? "Ce fichier n'est pas une sauvegarde de l'historique." : erreurReseau(err); }
  e.target.value = '';
});

BANQUES.forEach(b => { const o = document.createElement('option'); o.value = o.textContent = b; $('banque').appendChild(o); });
$('coName').textContent = ENTREPRISE.nom;
$('coSlogan').textContent = ENTREPRISE.slogan;
$('coInfo').innerHTML = '';
[ENTREPRISE.adresse, 'NINEA : ' + ENTREPRISE.ninea + ' · RC : ' + ENTREPRISE.rc].forEach((t, i) => {
  if (i) $('coInfo').appendChild(document.createElement('br')); $('coInfo').appendChild(document.createTextNode(t));
});

// ---------- Connexion et espaces ----------
function montrerEspace(espace) {
  $('espaceClient').hidden = espace !== 'client';
  $('espaceLogin').hidden = espace !== 'login';
  $('espaceAdmin').hidden = espace !== 'admin';
  $('adminNav').hidden = espace !== 'admin';
}
// Lecture publique (choix de diop) : tout le monde voit clients et factures, sans rien pouvoir changer.
function accueil() { if (ACCES === 'ouvert') demarrerOuvert(); else if (ACCES === 'lecture') demarrerLecture(); else { document.body.classList.remove('lecture'); montrerEspace('client'); } }
async function demarrerOuvert() {
  document.body.classList.remove('lecture');
  document.body.classList.add('ouvert');
  montrerEspace('admin');
  try { await charger(); } catch (e) { message('Connexion impossible. Rechargez la page.', true); }
  remplirCodes(); viderFormulaire(); montrer('new');
}
async function demarrerLecture() {
  document.body.classList.add('lecture');
  montrerEspace('admin');
  try { await charger(); } catch (e) { $('importMsg').textContent = 'Connexion impossible. Rechargez la page.'; }
  remplirCodes(); montrer('clients');
}
async function demarrerAdmin() {
  const { data, error } = await sb.rpc('etsbarry_est_admin');
  if (error) { montrerEspace('login'); $('loginMsg').textContent = 'Vérification impossible. Rechargez la page et réessayez.'; return; }
  if (!data) {
    await sb.auth.signOut();
    montrerEspace('login'); $('loginMsg').textContent = "Ce compte n'est pas administrateur."; return;
  }
  document.body.classList.remove('lecture', 'ouvert');
  montrerEspace('admin');
  try { await charger(); } catch (e) { message(erreurReseau(e), true); }
  remplirCodes(); viderFormulaire(); montrer('new');
  // Anciennes factures gardées dans ce navigateur : proposer de les envoyer en ligne.
  let locales = [];
  try { locales = JSON.parse(localStorage.getItem(CLE) || '[]'); } catch (e) {}
  $('localImport').hidden = !(Array.isArray(locales) && locales.length);
  $('localCount').textContent = locales.length;
}
$('localImportBtn').addEventListener('click', async () => {
  let locales = [], anciens = [];
  try { locales = JSON.parse(localStorage.getItem(CLE) || '[]'); anciens = JSON.parse(localStorage.getItem(CLE_CLIENTS) || '[]'); } catch (e) {}
  $('localImportBtn').disabled = true;
  try {
    await importer(locales, anciens);
    try { localStorage.removeItem(CLE); localStorage.removeItem(CLE_CLIENTS); } catch (e) {}
    $('localImport').hidden = true; montrer('hist');
  } catch (e) { $('importMsg').textContent = erreurReseau(e); $('localImportBtn').disabled = false; }
});
// Connexion admin : aucune trace sur la page publique, on y accède par une adresse que seul l'admin connaît.
const ADRESSE_ADMIN = '#gestion-barry';
function verifierAdresse() { if (location.hash === ADRESSE_ADMIN && ($('espaceAdmin').hidden || document.body.classList.contains('lecture'))) { montrerEspace('login'); $('loginEmail').focus(); } }
window.addEventListener('hashchange', verifierAdresse);
$('backToClient').addEventListener('click', () => { history.replaceState(null, '', location.pathname); accueil(); });
$('logoutBtn').addEventListener('click', async () => { await sb.auth.signOut(); factures = []; clients = []; history.replaceState(null, '', location.pathname); accueil(); });
$('loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  $('loginMsg').textContent = 'Connexion…';
  const { error } = await sb.auth.signInWithPassword({ email: $('loginEmail').value.trim(), password: $('loginPass').value });
  if (error) { $('loginMsg').textContent = 'E-mail ou mot de passe incorrect.'; return; }
  $('loginPass').value = ''; $('loginMsg').textContent = '';
  history.replaceState(null, '', location.pathname);
  demarrerAdmin();
});

// Espace client : on tape son code pour voir ses factures.
$('espaceForm').addEventListener('submit', async e => {
  e.preventDefault();
  const code = $('espaceCode').value.trim().toUpperCase(), out = $('espaceResultat');
  out.innerHTML = '';
  if (!code) return;
  $('espaceMsg').textContent = 'Recherche…';
  const { data, error } = await sb.rpc('etsbarry_compte', { p_code: code });
  if (error) { $('espaceMsg').textContent = 'Connexion impossible. Réessayez dans un instant.'; return; }
  if (!data) { $('espaceMsg').textContent = 'Aucun compte avec ce code. Vérifiez le code donné par Ets Barry.'; return; }
  $('espaceMsg').textContent = '';
  out.appendChild(carteCompte(data.client, data.factures.map(enNombres), false));
});

(async () => {
  const { data } = await sb.auth.getSession();
  if (data.session) demarrerAdmin(); else if (location.hash === ADRESSE_ADMIN) verifierAdresse(); else accueil();
})();
