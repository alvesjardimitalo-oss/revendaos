# Baixa as revistas novas e converte cada uma em catálogo do sistema.
# Fontes (qualquer combinação):
#   1) PDFs anexados a uma "Release" do GitHub (passados pela variável PDFS_BAIXADOS)
#   2) links listados em revistas/links.txt (um por linha; aceita link do Google Drive)
#   3) PDFs colocados direto na pasta revistas/ (até 25 MB pelo site do GitHub)
# O nome do arquivo (ou o texto antes do link em links.txt) diz a marca: ex. "boticario", "eudora", "oui", "natura".
import os, re, sys, json, glob, hashlib, datetime, urllib.request, unicodedata
sys.path.insert(0, os.path.dirname(__file__))
import revista

MARCAS = {  # palavra no nome do arquivo → (nome da marca, pasta das fotos)
    'boticario': ('O Boticário', 'o-boticario'), 'eudora': ('Eudora', 'eudora'), 'oui': ('Oui', 'oui'),
    'quemdisseberenice': ('Quem Disse, Berenice?', 'quem-disse-berenice'), 'qdb': ('Quem Disse, Berenice?', 'quem-disse-berenice'),
    'natura': ('Natura', 'natura'), 'avon': ('Avon', 'avon'), 'vult': ('Vult', 'vult'), 'eudoraeud': ('Eudora', 'eudora'),
}
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MANIFESTO = os.path.join(RAIZ, 'catalogo-auto', 'manifest.json')
TMP = os.path.join(RAIZ, '_revistas_tmp')

def plano(s): return re.sub(r'[^a-z0-9]', '', unicodedata.normalize('NFD', s.lower()).encode('ascii', 'ignore').decode())

def marca_de(nome):
    p = plano(nome)
    for k in sorted(MARCAS, key=len, reverse=True):
        if k in p: return MARCAS[k]
    return None

def ciclo_de(nome):
    m = re.search(r'(20\d{2})[-_ ]?(\d{2})', nome)
    return f'{m.group(1)}-{m.group(2)}' if m else ''

def link_direto(u):
    m = re.search(r'drive\.google\.com/(?:file/d/|open\?id=|uc\?id=)([\w-]+)', u)
    if m: return f'https://drive.usercontent.google.com/download?id={m.group(1)}&export=download&confirm=t'
    m = re.search(r'dropbox\.com/.+', u)
    if m: return re.sub(r'[?&]dl=0', '', u) + ('&' if '?' in u else '?') + 'dl=1'
    return u

def baixar(u, destino):
    req = urllib.request.Request(link_direto(u), headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=300) as r, open(destino, 'wb') as f:
        while True:
            b = r.read(1 << 20)
            if not b: break
            f.write(b)
    with open(destino, 'rb') as f:
        if f.read(5) != b'%PDF-': raise ValueError('o link não devolveu um PDF (confira se o arquivo está público)')

def sha(caminho):
    h = hashlib.sha256()
    with open(caminho, 'rb') as f:
        for b in iter(lambda: f.read(1 << 20), b''): h.update(b)
    return h.hexdigest()

def main():
    os.makedirs(TMP, exist_ok=True)
    man = json.load(open(MANIFESTO, encoding='utf-8')) if os.path.exists(MANIFESTO) else {'marcas': {}, 'processados': {}}
    pdfs = []  # (caminho, nome usado para achar a marca)
    for p in filter(None, os.environ.get('PDFS_BAIXADOS', '').split('\n')): pdfs.append((p, os.path.basename(p)))
    for p in glob.glob(os.path.join(RAIZ, 'revistas', '*.pdf')): pdfs.append((p, os.path.basename(p)))
    links = os.path.join(RAIZ, 'revistas', 'links.txt')
    if os.path.exists(links):
        for i, linha in enumerate(open(links, encoding='utf-8')):
            linha = linha.strip()
            if not linha or linha.startswith('#') or 'http' not in linha: continue
            rotulo, url = linha.split('http', 1)[0].strip(' :;-|'), 'http' + linha.split('http', 1)[1].strip()
            if url in man.get('links', {}): continue
            destino = os.path.join(TMP, f'link{i}.pdf')
            try: baixar(url, destino); pdfs.append((destino, rotulo or url)); man.setdefault('links', {})[url] = datetime.date.today().isoformat()
            except Exception as e: print(f'AVISO: não consegui baixar {url}: {e}')
    feitos = 0
    for caminho, nome in pdfs:
        h = sha(caminho)
        if h in man['processados']: print(f'já processado: {nome}'); continue
        mk = marca_de(nome)
        if not mk: print(f'AVISO: não reconheci a marca em "{nome}". Coloque o nome da marca no nome do arquivo.'); continue
        marca, slug = mk
        revista.TITULO_GRANDE = slug == 'oui'
        revista.saida_fotos = os.path.join(RAIZ, 'catalogo-img')
        itens, nf = revista.processar(caminho, marca, slug, os.path.join(RAIZ, 'catalogo-auto', slug))
        agora = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds')
        man['marcas'][slug] = {'marca': marca, 'csv': f'catalogo-auto/{slug}.csv', 'ciclo': ciclo_de(nome), 'produtos': len(itens), 'fotos': nf, 'gerado': agora, 'arquivo': nome}
        man['processados'][h] = {'arquivo': nome, 'marca': slug, 'em': agora}
        feitos += 1
    # índice das fotos (o sistema usa para saber quais produtos têm foto)
    idx = {}
    pasta = os.path.join(RAIZ, 'catalogo-img')
    for d in sorted(os.listdir(pasta)):
        if os.path.isdir(os.path.join(pasta, d)): idx[d] = sorted(f[:-4] for f in os.listdir(os.path.join(pasta, d)) if f.endswith('.jpg'))
    json.dump(idx, open(os.path.join(pasta, 'index.json'), 'w'), separators=(',', ':'))
    json.dump(man, open(MANIFESTO, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    # PDFs colocados na pasta revistas/ saem do repositório depois de convertidos (para não pesar)
    for p in glob.glob(os.path.join(RAIZ, 'revistas', '*.pdf')): os.remove(p)
    print(f'{feitos} revista(s) convertida(s).')

if __name__ == '__main__':
    main()
