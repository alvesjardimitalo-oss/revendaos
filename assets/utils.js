// Utilidades gerais
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export const r2 = v => Math.round((Number(v) || 0) * 100) / 100;
export const brl = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const nfmt = (v, d = 0) => (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
export const pct = v => (Number(v) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%';

export function parseNum(v) {
  if (typeof v === 'number') return v;
  v = String(v ?? '').trim().replace(/[R$\s]/g, '');
  if (!v) return 0;
  if (v.includes(',')) v = v.replace(/\./g, '').replace(',', '.');
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

export function isoLocal(d = new Date()) {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
}
export const hoje = () => isoLocal();
export const fmtData = iso => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '—');
export const fmtDataHora = ts => (ts ? new Date(ts).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');
export function addDias(iso, n) { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return isoLocal(d); }
export function addMeses(iso, n) {
  const d = new Date(iso + 'T12:00:00'); const dia = d.getDate();
  d.setDate(1); d.setMonth(d.getMonth() + n);
  const ult = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(dia, ult)); return isoLocal(d);
}
export function diasAte(iso) {
  if (!iso) return Infinity;
  const a = new Date(hoje() + 'T12:00:00'), b = new Date(iso + 'T12:00:00');
  return Math.round((b - a) / 86400000);
}
export const mesAtual = () => hoje().slice(0, 7);
export const nomeMes = ym => { const [y, m] = ym.split('-'); return new Date(+y, +m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }); };

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-5);
export const norm = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export const slugify = s => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
export const soDigitos = s => String(s ?? '').replace(/\D/g, '');

export function fmtFone(f) {
  const d = soDigitos(f);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return f || '';
}
export function waLink(fone, msg = '') {
  let d = soDigitos(fone);
  if (d && d.length <= 11) d = '55' + d;
  return `https://wa.me/${d}?text=${encodeURIComponent(msg)}`;
}

export function preencher(tpl, vars) {
  return String(tpl || '').replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
}

// ---------- PIX (BR Code estático com valor) ----------
function campo(id, v) { v = String(v); return id + String(v.length).padStart(2, '0') + v; }
function semAcento(s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9 .\-]/g, '').toUpperCase().trim(); }
function crc16(s) {
  let c = 0xFFFF;
  for (let i = 0; i < s.length; i++) {
    c ^= s.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) { c = (c & 0x8000) ? ((c << 1) ^ 0x1021) : (c << 1); c &= 0xFFFF; }
  }
  return c.toString(16).toUpperCase().padStart(4, '0');
}
export function pixPayload({ chave, nome, cidade, valor, txid, descricao }) {
  let mai = campo('00', 'br.gov.bcb.pix') + campo('01', String(chave || '').trim());
  if (descricao) mai += campo('02', semAcento(descricao).slice(0, 40));
  const tx = (String(txid || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 25)) || '***';
  let p = campo('00', '01') + campo('26', mai) + campo('52', '0000') + campo('53', '986');
  if (Number(valor) > 0) p += campo('54', Number(valor).toFixed(2));
  p += campo('58', 'BR') + campo('59', semAcento(nome).slice(0, 25) || 'RECEBEDOR') + campo('60', semAcento(cidade).slice(0, 15) || 'BRASIL');
  p += campo('62', campo('05', tx));
  p += '6304';
  return p + crc16(p);
}

// ---------- CSV ----------
export function toCSV(rows, cols) {
  const q = v => { v = v == null ? '' : String(v); return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  return '\ufeff' + [cols.map(c => q(c.label)).join(';'), ...rows.map(r => cols.map(c => q(typeof c.val === 'function' ? c.val(r) : r[c.key])).join(';'))].join('\n');
}
export function parseCSV(text) {
  text = text.replace(/^\ufeff/, '');
  const first = text.split('\n')[0] || '';
  const sep = (first.match(/;/g) || []).length >= (first.match(/,/g) || []).length ? ';' : ',';
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === sep) { row.push(cur); cur = ''; }
    else if (ch === '\n') { row.push(cur.replace(/\r$/, '')); rows.push(row); row = []; cur = ''; }
    else cur += ch;
  }
  if (cur || row.length) { row.push(cur.replace(/\r$/, '')); rows.push(row); }
  const head = (rows.shift() || []).map(h => norm(h).trim());
  return rows.filter(r => r.some(c => c.trim())).map(r => Object.fromEntries(head.map((h, i) => [h, (r[i] || '').trim()])));
}
export function baixar(nome, conteudo, tipo = 'text/csv;charset=utf-8') {
  const b = new Blob([conteudo], { type: tipo });
  const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = nome; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
export function lerArquivo(accept) {
  return new Promise(res => {
    const i = document.createElement('input'); i.type = 'file'; i.accept = accept;
    i.onchange = () => { const f = i.files[0]; if (!f) return res(null); const r = new FileReader(); r.onload = () => res(r.result); r.readAsText(f); };
    i.click();
  });
}
export function reduzirImagem(file, max = 360, q = 0.72) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => {
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
        res(c.toDataURL('image/jpeg', q));
      };
      img.onerror = rej; img.src = r.result;
    };
    r.onerror = rej; r.readAsDataURL(file);
  });
}
export async function copiar(txt) {
  try { await navigator.clipboard.writeText(txt); return true; }
  catch { const t = document.createElement('textarea'); t.value = txt; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); return true; }
}
