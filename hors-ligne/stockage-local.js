// Version hors ligne : remplace la base en ligne (Supabase) par le stockage de ce navigateur.
// Mêmes appels que supabase-js pour que app.js reste identique à la version en ligne.
(function () {
  var CLE = 'etsbarry-horsligne-v1';
  var copie = function (x) { return JSON.parse(JSON.stringify(x)); };
  var vide = function () { return { etsbarry_clients: [], etsbarry_factures: [] }; };
  var valide = function (d) { return d && d.etsbarry_clients && d.etsbarry_factures; };
  var memoire = null, stockageOk = false, mode = 'memoire';
  // 1) Lancée par « Ouvrir Facturation.bat » : un petit serveur sur cet ordinateur (localhost) garde
  //    les données dans le fichier donnees-factures.json, à côté de l'application. C'est le mode sûr,
  //    car l'ancien Edge ne garde rien pour un fichier ouvert par double-clic.
  function xhr(methode, corps) {
    var r = new XMLHttpRequest();
    r.open(methode, '/donnees?t=' + Date.now(), false); // synchrone : simple et sûr pour de petites données
    if (corps != null) r.setRequestHeader('Content-Type', 'application/json; charset=utf-8');
    r.send(corps == null ? null : corps);
    if (r.status !== 200) throw new Error('serveur ' + r.status);
    return r.responseText;
  }
  if (/^https?:$/.test(location.protocol) && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
    try { var d0 = JSON.parse(xhr('GET') || 'null'); memoire = valide(d0) ? d0 : vide(); mode = 'fichier'; stockageOk = true; } catch (e) {}
  }
  // 2) Sinon, le stockage du navigateur (marche dans la plupart des navigateurs récents).
  if (mode === 'memoire') {
    try { localStorage.setItem(CLE + '-test', '1'); localStorage.removeItem(CLE + '-test'); mode = 'navigateur'; stockageOk = true; } catch (e) {}
  }
  function lire() {
    if (mode === 'navigateur') {
      try { var d = JSON.parse(localStorage.getItem(CLE) || 'null'); if (valide(d)) return d; } catch (e) {}
      return vide();
    }
    return memoire ? copie(memoire) : vide();
  }
  function ecrire(db) {
    if (mode === 'fichier') { xhr('POST', JSON.stringify(db)); memoire = copie(db); return; }
    if (mode === 'navigateur') { localStorage.setItem(CLE, JSON.stringify(db)); return; }
    memoire = copie(db);
  }
  function table(nom) {
    var st = { op: 'select', rows: null, filtre: null, single: false, ordre: null };
    function run() {
      try {
        var db = lire(), t = db[nom];
        if (st.op === 'select') {
          var r = copie(t);
          if (st.ordre) r.sort(function (a, b) { return a[st.ordre] < b[st.ordre] ? -1 : a[st.ordre] > b[st.ordre] ? 1 : 0; });
          return { data: r, error: null };
        }
        if (st.op === 'insert') {
          for (var i = 0; i < st.rows.length; i++) {
            var x = st.rows[i];
            if (nom === 'etsbarry_clients' && t.some(function (c) { return c.code === x.code; })) return { data: null, error: { code: '23505', message: 'code déjà utilisé' } };
            t.push(copie(x));
          }
          ecrire(db); return { data: null, error: null };
        }
        if (st.op === 'upsert') {
          var r0 = copie(st.rows[0]), k = nom === 'etsbarry_clients' ? 'code' : 'no';
          if (k === 'no' && !r0.no) r0.no = t.reduce(function (m, f) { return Math.max(m, Number(f.no) || 0); }, 0) + 1;
          var j = t.findIndex(function (y) { return y[k] === r0[k]; });
          if (j >= 0) t[j] = Object.assign({}, t[j], r0); else t.push(r0);
          ecrire(db); return { data: st.single ? { no: r0.no } : null, error: null };
        }
        if (st.op === 'delete') {
          db[nom] = t.filter(function (y) { return y[st.filtre[0]] !== st.filtre[1]; });
          ecrire(db); return { data: null, error: null };
        }
      } catch (e) { return { data: null, error: { message: mode === 'fichier' ? "le programme « Ouvrir Facturation » ne répond plus : fermez Edge et relancez-le" : "stockage de l'ordinateur plein ou bloqué" } }; }
    }
    var b = {
      select: function () { return b; }, order: function (k) { st.ordre = k; return b; },
      insert: function (r) { st.op = 'insert'; st.rows = [].concat(r); return b; },
      upsert: function (r) { st.op = 'upsert'; st.rows = [].concat(r); return b; },
      delete: function () { st.op = 'delete'; return b; },
      eq: function (k, v) { st.filtre = [k, v]; return b; },
      single: function () { st.single = true; return b; },
      then: function (ok, ko) { return Promise.resolve(run()).then(ok, ko); }
    };
    return b;
  }
  window.ETSBARRY_HORS_LIGNE = { lire: lire, ecrire: ecrire, stockageOk: stockageOk, mode: mode };
  window.supabase = { createClient: function () { return {
    auth: { getSession: async function () { return { data: { session: null } }; }, signOut: async function () {}, signInWithPassword: async function () { return { error: { message: 'hors ligne' } }; } },
    rpc: async function (n, a) {
      if (n === 'etsbarry_est_admin') return { data: true, error: null };
      if (n === 'etsbarry_compte') {
        var db = lire(), c = db.etsbarry_clients.find(function (x) { return x.code === a.p_code; });
        if (!c) return { data: null, error: null };
        return { data: { client: c, factures: db.etsbarry_factures.filter(function (f) { return f.code === c.code; }).sort(function (x, y) { return y.no - x.no; }) }, error: null };
      }
      return { data: null, error: null };
    },
    from: table
  }; } };
})();
