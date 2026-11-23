// Test complet de la version hors ligne, en imitant l'ancien Edge (Playwright).
// Usage : S=<dossier contenant full2/Ets-Barry-Facturation-hors-ligne.html> node hors-ligne/test-complet.js
const {chromium}=require('playwright');const fs=require('fs');const D=process.env.S+'/full2/';
const ok=(c,t)=>console.log((c?'OK   ':'ÉCHEC')+' '+t);
(async()=>{const b=await chromium.launch();const ctx=await b.newContext({offline:true,acceptDownloads:true});
// Imitation de l'ancien Edge : on retire les fonctions récentes et on ajoute msSaveOrOpenBlob.
await ctx.addInitScript(()=>{
  delete Blob.prototype.text; delete Element.prototype.toggleAttribute; delete Array.prototype.flat; delete Array.prototype.flatMap;
  delete Object.fromEntries; delete String.prototype.replaceAll; delete Array.prototype.at; delete window.structuredClone; delete String.prototype.matchAll;
  window.__saves=[];
  navigator.msSaveOrOpenBlob=(blob,nom)=>{const r=new FileReader();r.onload=()=>window.__saves.push({nom,data:r.result});r.readAsDataURL(blob);return true;};
});
const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
const url='file://'+D+'Ets-Barry-Facturation-hors-ligne.html';
await p.goto(url);await p.waitForTimeout(400);
ok(!(await p.$('#demarrage')),'démarrage sans erreur');
ok(!(await p.innerText('body')).includes('Attention : ce navigateur'),'stockage disponible');
const saves=async()=>{await p.waitForTimeout(300);return p.evaluate(()=>window.__saves.splice(0));};
const ecrire=async(list)=>{for(const s of list){fs.writeFileSync(D+s.nom,Buffer.from(s.data.split(',')[1],'base64'));}};
const n=async()=>(await p.$$('#hist tr')).length;
// Clients
await p.click('#tabClients');await p.click('#addClientBtn');
await p.fill('#cCode','ba 01');await p.fill('#cNom','Awa Diallo');await p.fill('#cAdresse','Kaolack');await p.fill('#cTelephone','77 123 45 67');await p.click('#cSave');await p.waitForTimeout(150);
ok((await p.textContent('#clientDetail')).includes('BA-01'),'client créé avec code BA-01');
await p.click('#addClientBtn');await p.fill('#cNom','Sans Code');await p.click('#cSave');await p.waitForTimeout(150);
ok((await p.textContent('#clientDetail')).includes('CL1'),'client sans code → CL1');
await p.click('#addClientBtn');await p.fill('#cCode','BA-01');await p.fill('#cNom','Doublon');await p.click('#cSave');await p.waitForTimeout(150);
ok((await p.textContent('#cMsg')).includes('déjà utilisé'),'code en double refusé');await p.click('#cCancel');
await p.fill('#codeSearch','77 123');await p.dispatchEvent('#codeSearch','input');
ok((await p.textContent('#clientsBody')).includes('Awa Diallo'),'recherche client par téléphone');
// Facture 1 : client existant, pré-remplissage
await p.click('#tabNew');await p.fill('#code','ba-01');await p.dispatchEvent('#code','input');
ok(await p.inputValue('#nom')==='Awa Diallo'&&await p.inputValue('#adresse')==='Kaolack'&&await p.inputValue('#telephone')==='77 123 45 67','pré-remplissage nom/adresse/téléphone par le code');
await p.fill('#lines input[type=number] >> nth=0','10');await p.fill('#lines input[type=number] >> nth=1','5000');
await p.click('#addLine');await p.fill('#lines input[type=number] >> nth=2','4');await p.fill('#lines input[type=number] >> nth=3','2500');
await p.fill('#virement','30000');await p.selectOption('#banque','CBAO');await p.fill('#compte','SN012 01001 123456789');
ok((await p.textContent('#pR')).includes('30 000'),'aperçu net à payer = 60 000 − 30 000');
await p.click('#saveBtn');let s=await saves();await ecrire(s);
ok(s.length===1&&s[0].data.startsWith('data:application/pdf'),'PDF facture 1 (méthode ancien Edge) : '+(s[0]&&s[0].nom));
// Facture 2 : tout vide
await p.click('#saveBtn');s=await saves();await ecrire(s);ok(s.length===1,'facture vide acceptée + PDF : '+(s[0]&&s[0].nom));
// Facture 3 : nouveau code -> nouveau client
await p.fill('#code','NEW-1');await p.dispatchEvent('#code','input');await p.fill('#nom','Moussa Sow');await p.fill('#adresse','Thiès');
await p.fill('#lines input[type=number] >> nth=0','1');await p.fill('#lines input[type=number] >> nth=1','100000');await p.fill('#virement','100000');await p.selectOption('#banque','Ecobank');
await p.click('#saveBtn');s=await saves();await ecrire(s);ok(s.length===1,'facture 3 (nouveau client NEW-1) + PDF');
// Montant impossible
await p.fill('#lines input[type=number] >> nth=0','1');await p.fill('#lines input[type=number] >> nth=1','99999999999');await p.click('#saveBtn');await p.waitForTimeout(150);
ok((await p.textContent('#msg')).includes('trop grand'),'montant impossible refusé');await p.click('#reset');
// Historique
await p.click('#tabHist');ok(await n()===3,'historique : 3 factures');
ok((await p.textContent('#hist')).includes('Payée'),'facture 3 marquée Payée');
await p.fill('#search','diallo');await p.dispatchEvent('#search','input');ok(await n()===1,'recherche dans l\'historique');
await p.fill('#search','');await p.dispatchEvent('#search','input');
// Modifier facture 1
await p.click('#hist tr:has-text("0001") button:has-text("Modifier")');
ok(await p.inputValue('#compte')==='SN012 01001 123456789','modification : n° de compte repris');
await p.fill('#lines input[type=number] >> nth=0','20');await p.click('#saveBtn');s=await saves();await ecrire(s);
await p.click('#tabHist');ok(await n()===3&&(await p.textContent('#hist tr:has-text("0001")')).includes('110 000'),'facture 1 modifiée (110 000), pas de doublon');
// PDF depuis l'historique
await p.click('#hist tr:has-text("0001") button:has-text("PDF")');s=await saves();ok(s.length===1,'bouton PDF de l\'historique');
// Supprimer facture 2
await p.click('#hist tr:has-text("0002") button:has-text("Supprimer")');await p.click('#hist tr:has-text("0002") button:has-text("Confirmer")');await p.waitForTimeout(150);
ok(await n()===2,'suppression en deux clics');
// Compte client
await p.click('#tabClients');await p.fill('#codeSearch','BA-01');await p.dispatchEvent('#codeSearch','input');
const cd=(await p.textContent('#clientDetail')).replace(/\s+/g,' ');ok(cd.includes('110 000')&&cd.includes('80 000'),'compte client : total 110 000, reste 80 000');
await p.screenshot({path:process.env.S+'/full-compte.png',fullPage:true});
// Sauvegarde
await p.click('#tabHist');await p.click('#exportBtn');s=await saves();await ecrire(s);
ok(s.length===1&&s[0].nom.endsWith('.json'),'sauvegarde (méthode ancien Edge) : '+(s[0]&&s[0].nom));const sauv=D+s[0].nom;
// Rechargement
await p.reload();await p.waitForTimeout(400);await p.click('#tabHist');ok(await n()===2,'données gardées après réouverture');
// Effacement + restauration
await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(400);await p.click('#tabHist');ok(await n()===0,'navigateur vidé');
await p.setInputFiles('#importFile',sauv);await p.waitForTimeout(400);
ok((await p.textContent('#importMsg')).includes('2 facture(s) et 3 client(s)'),'restauration : '+await p.textContent('#importMsg'));
ok((await p.textContent('#hist')).includes('0001')&&(await p.textContent('#hist')).includes('0003'),'numéros d\'origine gardés');
await p.setInputFiles('#importFile',sauv);await p.waitForTimeout(300);ok((await p.textContent('#importMsg')).includes('Rien à ajouter'),'pas de doublon à la 2e restauration');
await p.click('#tabNew');await p.fill('#nom','Après restauration');await p.click('#saveBtn');s=await saves();ok(s[0]&&s[0].nom.startsWith('Facture-0004'),'numéro suivant : '+(s[0]&&s[0].nom));
ok(errs.length===0,'aucune erreur JavaScript '+JSON.stringify(errs));
await b.close();})();
