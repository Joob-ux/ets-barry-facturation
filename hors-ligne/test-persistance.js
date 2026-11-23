// Persistance par le serveur local : on ferme complètement le navigateur entre deux ouvertures.
const {chromium}=require('playwright');const fs=require('fs');
const ok=(c,t)=>console.log((c?'OK   ':'ÉCHEC')+' '+t);
const ouvrir=async()=>{const b=await chromium.launch();const ctx=await b.newContext();
  await ctx.addInitScript(()=>{window.print=()=>{};navigator.msSaveOrOpenBlob=()=>true;});
  const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.goto('http://localhost:8765/');await p.waitForTimeout(400);return {b,p,errs};};
(async()=>{
  let {b,p,errs}=await ouvrir();
  ok(!(await p.innerText('body')).includes('ne seront pas gardées'),'pas d\'avertissement en passant par le lanceur');
  await p.click('#tabClients');await p.click('#addClientBtn');await p.fill('#cCode','K-1');await p.fill('#cNom','Ibrahima Fall');await p.fill('#cTelephone','76 111 22 33');await p.click('#cSave');await p.waitForTimeout(150);
  await p.click('#tabNew');await p.fill('#code','K-1');await p.dispatchEvent('#code','input');
  await p.fill('#lines input[type=number] >> nth=0','8');await p.fill('#lines input[type=number] >> nth=1','4000');await p.fill('#virement','10000');await p.selectOption('#banque','CBAO');
  await p.click('#saveBtn');await p.waitForTimeout(300);ok(await p.isVisible('#apres'),'facture enregistrée (cadre vert)');
  const fichier=JSON.parse(fs.readFileSync(process.env.S+'/srv/donnees-factures.json','utf8'));
  ok(fichier.etsbarry_factures.length===1&&fichier.etsbarry_clients[0].telephone==='76 111 22 33','donnees-factures.json écrit sur le disque');
  ok(errs.length===0,'aucune erreur '+JSON.stringify(errs));
  await b.close();
  ({b,p,errs}=await ouvrir());
  await p.click('#tabHist');ok((await p.innerText('#hist')).includes('Ibrahima Fall'),'après fermeture complète du navigateur : la facture est toujours là');
  await p.click('#tabClients');ok((await p.innerText('#clientsBody')).includes('K-1'),'le client est toujours là');
  // modification + suppression persistées
  await p.click('#tabHist');await p.click('#hist tr:has-text("0001") button:has-text("Modifier")');await p.fill('#lines input[type=number] >> nth=0','10');await p.click('#saveBtn');await p.waitForTimeout(300);
  await b.close();({b,p,errs}=await ouvrir());await p.click('#tabHist');
  ok((await p.innerText('#hist')).includes('40 000'),'modification gardée après fermeture');
  await p.click('#hist tr:has-text("0001") button:has-text("Supprimer")');await p.click('#hist tr:has-text("0001") button:has-text("Confirmer")');await p.waitForTimeout(200);
  await b.close();({b,p,errs}=await ouvrir());await p.click('#tabHist');ok((await p.$$('#hist tr')).length===0,'suppression gardée après fermeture');
  ok(errs.length===0,'aucune erreur '+JSON.stringify(errs));
  await b.close();
})();
