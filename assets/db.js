// Camada de dados: Firebase (Auth + Firestore) ou modo demonstração (localStorage)
import { FIREBASE_CONFIG } from './config.js';
import { uid } from './utils.js';

const FB = 'https://www.gstatic.com/firebasejs/10.12.2/';
export const configurado = () => !!(FIREBASE_CONFIG.apiKey && !String(FIREBASE_CONFIG.apiKey).startsWith('COLE'));

let _db;
export async function getDB() {
  if (!_db) _db = configurado() ? await firebaseDB() : localDB();
  return _db;
}

const limpo = o => JSON.parse(JSON.stringify(o ?? {}));

// ------------------------------------------------------------------ FIREBASE
async function firebaseDB() {
  const [{ initializeApp }, A, fs] = await Promise.all([
    import(FB + 'firebase-app.js'), import(FB + 'firebase-auth.js'), import(FB + 'firebase-firestore.js')
  ]);
  const app = initializeApp(FIREBASE_CONFIG);
  const auth = A.getAuth(app);
  let db;
  try { db = fs.initializeFirestore(app, { localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }) }); }
  catch { db = fs.getFirestore(app); }

  let contaId = null;
  const ref = o => {
    if (o.path) return fs.doc(db, ...o.path.split('/'));
    if (o.col === '@conta') return fs.doc(db, 'contas', contaId);
    return fs.doc(db, 'contas', contaId, o.col, o.id);
  };
  const mapa = s => s.docs.map(d => ({ id: d.id, ...d.data() }));

  return {
    modo: 'firebase',
    onAuth: cb => A.onAuthStateChanged(auth, u => cb(u ? { uid: u.uid, nome: u.displayName || (u.email || '').split('@')[0], email: (u.email || '').toLowerCase(), foto: u.photoURL || '' } : null)),
    loginGoogle: async () => {
      const prov = new A.GoogleAuthProvider(); prov.setCustomParameters({ prompt: 'select_account' });
      try { return await A.signInWithPopup(auth, prov); }
      catch (e) {
        // celular: popup bloqueado/fechado pelo navegador → tenta pelo redirecionamento
        if (['auth/popup-blocked', 'auth/popup-closed-by-user', 'auth/cancelled-popup-request', 'auth/operation-not-supported-in-this-environment', 'auth/web-storage-unsupported'].includes(e.code)) { sessionStorage.setItem('rv-redir', '1'); return A.signInWithRedirect(auth, prov); }
        throw e;
      }
    },
    resultadoRedirect: () => A.getRedirectResult(auth),
    loginEmail: (e, s) => A.signInWithEmailAndPassword(auth, e, s),
    cadastrar: async (e, s, n) => { const r = await A.createUserWithEmailAndPassword(auth, e, s); if (n) await A.updateProfile(r.user, { displayName: n }); },
    resetSenha: e => A.sendPasswordResetEmail(auth, e),
    sair: () => A.signOut(auth),

    async resolverConta(user) {
      const uref = fs.doc(db, 'usuarios', user.uid);
      try {
        const us = await fs.getDoc(uref);
        if (us.exists() && us.data().contaId) {
          const cid = us.data().contaId;
          const m = await fs.getDoc(fs.doc(db, 'contas', cid, 'membros', user.uid));
          if (m.exists()) { contaId = cid; return { contaId: cid, membro: { id: user.uid, ...m.data() } }; }
        }
      } catch (e) { console.warn('conta anterior inacessível', e); }

      let cv = null;
      const cref = fs.doc(db, 'convites', user.email);
      try { const c = await fs.getDoc(cref); if (c.exists()) cv = c.data(); } catch { }
      const b = fs.writeBatch(db);
      let cid, membro;
      const base = { nome: user.nome, email: user.email, foto: user.foto || '', meta: 0, criadoEm: Date.now() };
      if (cv) {
        cid = cv.contaId;
        membro = { ...base, papel: cv.papel || 'vendedor', permissoes: cv.permissoes || {}, comissao: cv.comissao || 0 };
        b.set(fs.doc(db, 'contas', cid, 'membros', user.uid), membro);
        b.set(uref, { contaId: cid });
        b.delete(cref);
      } else {
        cid = fs.doc(fs.collection(db, 'contas')).id;
        membro = { ...base, papel: 'admin', permissoes: {}, comissao: 0 };
        b.set(fs.doc(db, 'contas', cid), { nome: 'Minha Revenda', dono: user.uid, criadoEm: Date.now(), config: {}, loja: {} });
        b.set(fs.doc(db, 'contas', cid, 'membros', user.uid), membro);
        b.set(uref, { contaId: cid });
      }
      await b.commit();
      contaId = cid;
      return { contaId: cid, membro: { id: user.uid, ...membro }, novo: !cv };
    },

    watch: (col, cb) => fs.onSnapshot(col === 'logs' ? fs.query(fs.collection(db, 'contas', contaId, col), fs.orderBy('quando', 'desc'), fs.limit(150)) : fs.collection(db, 'contas', contaId, col), s => cb(mapa(s)), e => console.error(col, e)),
    watchConta: cb => fs.onSnapshot(fs.doc(db, 'contas', contaId), s => cb({ id: s.id, ...s.data() })),

    async commit(ops) {
      for (let i = 0; i < ops.length; i += 450) {
        const b = fs.writeBatch(db);
        for (const o of ops.slice(i, i + 450)) {
          const r = ref(o);
          if (o.op === 'del') b.delete(r);
          else if (o.op === 'set') b.set(r, limpo(o.data));
          else b.update(r, limpo(o.data));
        }
        await b.commit();
      }
    },

    listConvites: cb => fs.onSnapshot(fs.query(fs.collection(db, 'convites'), fs.where('contaId', '==', contaId)), s => cb(mapa(s)), e => console.warn(e)),
    criarConvite: (email, d) => fs.setDoc(fs.doc(db, 'convites', email), limpo({ ...d, contaId })),
    removerConvite: email => fs.deleteDoc(fs.doc(db, 'convites', email)),

    watchPedidos: (slug, cb) => fs.onSnapshot(fs.collection(db, 'lojas', slug, 'pedidos'), s => cb(mapa(s)), e => console.warn(e)),
    async lerDoc(path) { const s = await fs.getDoc(fs.doc(db, ...path.split('/'))); return s.exists() ? { id: s.id, ...s.data() } : null; },
    async lerCol(path) { return mapa(await fs.getDocs(fs.collection(db, ...path.split('/')))); },
    async consultar(path, campo, valor) { return mapa(await fs.getDocs(fs.query(fs.collection(db, ...path.split('/')), fs.where(campo, '==', valor)))); },
    async lojaGet(slug) { const s = await fs.getDoc(fs.doc(db, 'lojas', slug)); return s.exists() ? { id: s.id, ...s.data() } : null; },
    async lojaItens(slug) { return mapa(await fs.getDocs(fs.collection(db, 'lojas', slug, 'itens'))); },
    criarPedido: (slug, d) => fs.addDoc(fs.collection(db, 'lojas', slug, 'pedidos'), limpo(d))
  };
}

// ------------------------------------------------------------------ DEMONSTRAÇÃO
function localDB() {
  const K = 'revendaos:db', KU = 'revendaos:user';
  let data = {};
  try { data = JSON.parse(localStorage.getItem(K) || '{}'); } catch { }
  const subs = new Set(); let authCb = null; let contaId = 'demo';
  const avisar = () => subs.forEach(f => { try { f(); } catch (e) { console.error(e); } });
  const salvar = () => { try { localStorage.setItem(K, JSON.stringify(data)); } catch (e) { alert('Armazenamento do navegador cheio no modo demonstração.'); } avisar(); };
  addEventListener('storage', e => { if (e.key === K) { data = JSON.parse(e.newValue || '{}'); avisar(); } });
  const listar = pre => Object.keys(data).filter(k => k.startsWith(pre + '/') && !k.slice(pre.length + 1).includes('/')).map(k => ({ id: k.slice(pre.length + 1), ...data[k] }));
  const sub = fn => { subs.add(fn); fn(); return () => subs.delete(fn); };
  const usuario = () => { try { return JSON.parse(localStorage.getItem(KU) || 'null'); } catch { return null; } };
  const setUser = u => { u ? localStorage.setItem(KU, JSON.stringify(u)) : localStorage.removeItem(KU); authCb && authCb(u); };
  const demo = { uid: 'demo', nome: 'Usuário Demonstração', email: 'demo@local', foto: '' };
  const caminho = o => o.path || (o.col === '@conta' ? `contas/${contaId}` : `contas/${contaId}/${o.col}/${o.id}`);

  return {
    modo: 'demo',
    onAuth(cb) { authCb = cb; setTimeout(() => cb(usuario()), 0); return () => { }; },
    loginGoogle: async () => setUser(demo),
    loginEmail: async () => setUser(demo),
    cadastrar: async (e, s, n) => setUser({ ...demo, nome: n || demo.nome, email: e || demo.email }),
    resetSenha: async () => { },
    sair: async () => setUser(null),
    async resolverConta(u) {
      if (!data['contas/demo']) {
        data['contas/demo'] = { nome: 'Minha Revenda', dono: u.uid, criadoEm: Date.now(), config: {}, loja: {} };
        data[`contas/demo/membros/${u.uid}`] = { nome: u.nome, email: u.email, foto: '', papel: 'admin', permissoes: {}, meta: 0, comissao: 0, criadoEm: Date.now() };
        salvar();
      }
      return { contaId, membro: { id: u.uid, ...data[`contas/demo/membros/${u.uid}`] } };
    },
    watch: (col, cb) => sub(() => cb(listar(`contas/${contaId}/${col}`))),
    watchConta: cb => sub(() => cb({ id: contaId, ...data[`contas/${contaId}`] })),
    async commit(ops) {
      for (const o of ops) {
        const p = caminho(o);
        if (o.op === 'del') delete data[p];
        else if (o.op === 'set') data[p] = limpo(o.data);
        else data[p] = { ...(data[p] || {}), ...limpo(o.data) };
      }
      salvar();
    },
    listConvites: cb => sub(() => cb(listar('convites').filter(c => c.contaId === contaId))),
    async criarConvite(email, d) { data['convites/' + email] = limpo({ ...d, contaId }); salvar(); },
    async removerConvite(email) { delete data['convites/' + email]; salvar(); },
    watchPedidos: (slug, cb) => sub(() => cb(listar(`lojas/${slug}/pedidos`))),
    async lerDoc(path) { const d = data[path]; return d ? { id: path.split('/').pop(), ...d } : null; },
    async lerCol(path) { return listar(path); },
    async consultar(path, campo, valor) { return listar(path).filter(x => x[campo] === valor); },
    async lojaGet(slug) { const d = data['lojas/' + slug]; return d ? { id: slug, ...d } : null; },
    async lojaItens(slug) { return listar(`lojas/${slug}/itens`); },
    async criarPedido(slug, d) { data[`lojas/${slug}/pedidos/${uid()}`] = limpo(d); salvar(); }
  };
}
