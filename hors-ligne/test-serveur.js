// Même comportement que serveur.ps1, pour tester l'application.
const http=require('http'),fs=require('fs'),path=require('path');const D=process.argv[2];
http.createServer((q,r)=>{let b=[];q.on('data',c=>b.push(c));q.on('end',()=>{const body=Buffer.concat(b);
 const send=(st,t,o)=>{r.writeHead(st,{'Content-Type':t,'Content-Length':o.length,'Cache-Control':'no-store','Connection':'close'});r.end(o);};
 const f=path.join(D,'donnees-factures.json');
 if(q.method==='GET'&&(q.url==='/'||q.url.startsWith('/?')))return send(200,'text/html; charset=utf-8',fs.readFileSync(path.join(D,'Ets-Barry-Facturation-hors-ligne.html')));
 if(q.method==='GET'&&q.url.startsWith('/donnees'))return send(200,'application/json; charset=utf-8',fs.existsSync(f)?fs.readFileSync(f):Buffer.from('null'));
 if(q.method==='POST'&&q.url.startsWith('/donnees')&&body.length){fs.writeFileSync(f,body);return send(200,'text/plain','ok');}
 send(404,'text/plain','introuvable');});}).listen(8765,'127.0.0.1');
