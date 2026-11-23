// Version hors ligne : remplace la base en ligne (Supabase) par le stockage de ce navigateur.
// Mêmes appels que supabase-js pour que app.js reste identique à la version en ligne.
(function () {
  var CLE = 'etsbarry-horsligne-v1';
  function lire() {
    try { var d = JSON.parse(localStorage.getItem(CLE) || 'null'); if (d && d.etsbarry_clients && d.etsbarry_factures) return d; } catch (e) {}
    return { etsbarry_clients: [], etsbarry_factures: [] };
  }
  function ecrire(db) { localStorage.setItem(CLE, JSON.stringify(db)); }
  var copie = function (x) { return JSON.parse(JSON.stringify(x)); };
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
      } catch (e) { return { data: null, error: { message: "stockage de l'ordinateur plein ou bloqué" } }; }
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
  window.ETSBARRY_HORS_LIGNE = { lire: lire, ecrire: ecrire };
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
