# Converte a revista (PDF) de uma marca em catálogo do sistema: planilha + fotos dos produtos.
# Uso: python ferramentas/revista.py ARQUIVO.pdf "Nome da Marca" slug-da-marca
import pdfplumber, re, io, sys, os, csv, json, unicodedata, zipfile, hashlib
from PIL import Image, ImageChops, ImageStat, ImageFilter
DPI = int(os.environ.get('DPI', '400'))
COD=re.compile(r'^\d{5}$')
NUM=re.compile(r'(\d{1,3}(?:\.\d{3})+|\d{1,4})\s?,\s?(\d{2})(?!\d)')
UNID=re.compile(r'\b(ml|g|cm|kg|un|unidades?|mm)\b', re.I)

def linhas(ws, tol=3):
    ws=sorted(ws,key=lambda w:(w['top'],w['x0'])); out=[]
    for w in ws:
        if out and abs(out[-1]['top']-w['top'])<tol: out[-1]['ws'].append(w)
        else: out.append({'top':w['top'],'ws':[w]})
    for l in out: l['ws'].sort(key=lambda w:w['x0']); l['t']=' '.join(w['text'] for w in l['ws'])
    return out

def parte_maiuscula(n):
    ws=n.split(); 
    for k,w in enumerate(ws):
        if re.search(r'[A-ZÀ-Ý]{2,}',w) and w==w.upper(): return ' '.join(ws[k:])
    return n

TITULO_GRANDE=False
def titulos_grandes(page):
    cs=[c for c in page.chars if c['size']>=14 and c['text'].strip()]
    grupos=[]
    for c in sorted(cs,key=lambda c:c['top']):
        g=next((g for g in grupos if abs(g['top']-c['top'])<9 and abs(g['size']-c['size'])<3), None)
        if g: g['cs'].append(c)
        else: grupos.append({'top':c['top'],'size':c['size'],'cs':[c]})
    out=[]
    for g in grupos:
        cs_=sorted(g['cs'],key=lambda c:c['x0']); seg=None
        for c in cs_:
            if seg and c['x0']-seg['x1']<c['size']*0.8:
                seg['t']+=(' ' if c['x0']-seg['x1']>c['size']*0.18 else '')+c['text']; seg['x1']=c['x1']
            else:
                seg={'t':c['text'],'top':g['top'],'x0':c['x0'],'x1':c['x1']}; out.append(seg)
    return [dict(t=o['t'].strip(),top=o['top'],ws=[{'x0':o['x0'],'x1':o['x1']}]) for o in out if re.fullmatch(r"[A-Za-zÀ-ÿ'’ \-]{3,24}",o['t'].strip()) and len(o['t'].split())<=3]

def produtos_pagina(page, pn):
    ws=[w for w in page.extract_words(extra_attrs=['size']) if not re.fullmatch(r'[-–—_.·]+',w['text'])]
    cods=[w for w in ws if COD.match(w['text'])]
    res=[]; pend=[]
    grandes=titulos_grandes(page) if TITULO_GRANDE else []
    for c in cods:
        dir_=[o['x0'] for o in cods if o['x0']>c['x0']+15 and abs(o['top']-c['top'])<60]
        xmax=min(dir_)-3 if dir_ else c['x0']+160
        abaixo=[o['top'] for o in cods if o is not c and abs(o['x0']-c['x0'])<40 and o['top']>c['top']+5]
        ymax=min(abaixo)-2 if abaixo else c['top']+170
        titulo=' '.join(w['text'] for w in sorted([w for w in ws if abs(w['top']-c['top'])<3 and w['x0']>c['x1'] and w['x0']<xmax and w['size']<=c['size']*1.4],key=lambda w:w['x0']))
        tam=c['size']
        blk=[w for w in ws if w['x0']>=c['x0']-4 and w['x0']<xmax and w['top']>c['top']+3 and w['top']<ymax]
        # texto do produto tem fonte parecida com a do código; títulos decorativos são maiores
        blk=[w for w in blk if w['size']<=tam*1.4 or re.search(r'\d|R\$|,',w['text'])]
        nome=[]; desc=[]; ptxt=''; em=False
        for l in linhas(blk,5):
            t=l['t']
            if COD.match(l['ws'][0]['text']): break
            sem=t.replace(' ','')
            if not em and (('R$' in sem and re.search(r'R\$\d',sem)) or (NUM.search(sem) and not UNID.search(t) and not t.startswith('•'))): em=True
            if em:
                if 'ECONOMIZE' in t.upper(): break
                ptxt+=' '+t.replace(' ',''); continue
            if t.startswith('•'): desc.append(t.lstrip('• ').strip())
            elif desc: desc[-1]+=' '+t
            else: nome.append(t)
        precos=['%s,%s'%m for m in NUM.findall(ptxt.replace('R$',' '))]
        if not precos: precos=[m+',00' for m in re.findall(r'R\$(\d{1,4})(?![\d,])',ptxt)]
        nome=[re.sub(r'(?:\b\w\b ?){3,}','',x).strip() for x in nome]  # remove letras soltas decorativas
        nome=[x for x in nome if x]
        nm=((titulo+' ') if titulo else '')+' '.join(nome)
        if grandes and re.match(r'(LOÇÃO|CRÈME|CREME|REFIL|BALM|SHOWER|ÓLEO|SABONETE|BODY|HIDRATANTE)',nm.upper()):
            cand=[g for g in grandes if 0 < c['top']-g['top'] < 90 and g['ws'][0]['x0']-20 < c['x0'] < g['ws'][-1]['x1']+140]
            if cand:
                g=max(cand,key=lambda g:g['top'])['t']
                if g.upper() not in nm.upper(): nm=g+' '+nm
        nm=re.sub(r'\s+',' ',nm).strip().rstrip(',')
        if not nm and desc: nm=desc[0]
        item={'pag':pn,'codigo':c['text'],'nome':nm,'descricao':'; '.join(desc),'preco':precos[0] if precos else '','promo':precos[1] if len(precos)>1 else '','x0':c['x0'],'top':c['top'],'xmax':xmax}
        (res if precos and nm else pend).append(item)
    # sem preço próprio: herda do vizinho da mesma linha (ex.: variações lado a lado)
    for p in pend:
        viz=[r for r in res if abs(r['top']-p['top'])<12]
        if viz and p['nome']:
            esq=[r for r in viz if r['x0']<p['x0']]
            v=max(esq,key=lambda r:r['x0']) if esq else min(viz,key=lambda r:abs(r['x0']-p['x0']))
            p['preco'],p['promo']=v['preco'],v['promo']
            base=parte_maiuscula(v['nome'])
            if base and base not in p['nome']: p['nome']=(p['nome']+' '+base).strip()
            res.append(p)
    return res

def imagem(img, pagina_img=None, escala=1):
    """Recorta o produto da página renderizada (cores corretas) e usa a máscara do recorte para fundo branco."""
    try:
        box=[int(img['x0']*escala),int(img['top']*escala),int(round(img['x1']*escala)),int(round(img['bottom']*escala))]
        im=pagina_img.crop(box).convert('RGB')
        st=img['stream']; sm=st.attrs.get('SMask')
        if sm is not None:
            sm=sm.resolve(); d=sm.get_data(); w,h=sm['Width'],sm['Height']
            if len(d)>=w*h:
                m=Image.frombytes('L',(w,h),d[:w*h]).resize(im.size)
                bg=Image.new('RGB',im.size,(255,255,255)); bg.paste(im,mask=m); im=bg
        return im
    except Exception as e:
        return None

REPETIDAS=set()
def chave_img(i):
    try: return hashlib.md5(i['stream'].get_rawdata()[:20000]).hexdigest()
    except Exception: return None
def casar_imagens(page, prods):
    W,H=page.width,page.height
    cand=[i for i in page.images if chave_img(i) not in REPETIDAS and (i['x1']-i['x0'])<W*0.45 and (i['bottom']-i['top'])<H*0.5 and (i['x1']-i['x0'])>14 and (i['bottom']-i['top'])>20]
    _ws=page.extract_words()
    cand=[i for i in cand if sum(1 for w in _ws if i['x0']<(w['x0']+w['x1'])/2<i['x1'] and i['top']<(w['top']+w['bottom'])/2<i['bottom'])<=3]
    pares=[]
    for pi,p in enumerate(prods):
        for ii,i in enumerate(cand):
            sm='SMask' in i['stream'].attrs
            cx=(i['x0']+i['x1'])/2
            dy=p['top']-i['bottom']
            if p['x0']-25 <= cx <= p['xmax']+10 and -8 <= dy <= (70 if sm else 35):
                pares.append((dy+(0 if sm else 30),pi,ii)); continue
            if not sm: continue
            sobre=min(i['bottom'],p['top']+60)-max(i['top'],p['top']-40)
            if sobre>15:
                gap=p['x0']-i['x1'] if i['x1']<=p['x0']+5 else (i['x0']-p['xmax'] if i['x0']>=p['xmax']-5 else None)
                if gap is not None and -5<=gap<=60: pares.append((100+gap+(0 if sm else 30),pi,ii))
    usados_p=set(); usados_i=set()
    for sc,pi,ii in sorted(pares):
        if pi in usados_p or ii in usados_i: continue
        prods[pi]['_img']=cand[ii]; usados_p.add(pi); usados_i.add(ii)
    return prods

CATS=[('Kits e presentes',r'\b(KIT|PRESENTE|ESTOJO|CAIXA|LATA)\b'),('Maquiagem',r'\b(BATOM|BASE|M[ÁA]SCARA|SOMBRA|PALETTE|PALETA|BLUSH|PÓ |CORRETIVO|DELINEADOR|GLOSS|L[ÁA]PIS|PRIMER|ILUMINADOR|ESMALTE|BRONZER|CONTORNO|SOBRANCELHA|RÍMEL|LIP|TINT)\b'),
 ('Perfumaria',r'\b(COL[ÔO]NIA|PARFUM|PERFUME|EAU DE|BODY SPLASH|BODY SPRAY|REFIL)\b'),('Cabelos',r'\b(SHAMPOO|CONDICIONADOR|CAPILAR|CABELO|LEAVE|FINALIZADOR|M[ÁA]SCARA CAPILAR)\b'),
 ('Barba',r'\b(BARBA|BARBEAR)\b'),('Cuidados com o rosto',r'\b(FACIAL|ROSTO|ANTIACNE|SÉRUM|SERUM|ÁGUA MICELAR|DEMAQUILANTE|ANTISSINAIS|OLHOS)\b'),
 ('Protetor solar',r'\b(FPS|SOLAR|BRONZEADOR)\b'),('Desodorantes',r'\b(ANTITRANSPIRANTE|DESODORANTE AEROSSOL|ROLL-ON|ROLL ON)\b'),
 ('Corpo e banho',r'\b(HIDRATANTE|LOÇÃO|LOCAO|SABONETE|SHOWER|ÓLEO|OLEO|CREME|ESFOLIANTE|BRUMA|MOUSSE|MANTEIGA|GEL)\b'),('Acessórios',r'\b(NÉCESSAIRE|NECESSAIRE|BOLSA|BAG|PORTA|PINCEL|ESPONJA)\b')]
def categoria(n):
    u=n.upper()
    for c,rx in CATS:
        if re.search(rx,u): return c
    return 'Outros'

saida_fotos='catalogo-img'
def processar(pdf_path, marca, slug, saida_prefixo, pags=None):
    vistos={}
    with pdfplumber.open(pdf_path) as pdf:
        rng=pags or range(1,len(pdf.pages)+1)
        cont={}
        for pg in pdf.pages:
            for k in {chave_img(i) for i in pg.images}: cont[k]=cont.get(k,0)+1
            pg.flush_cache()
        REPETIDAS.clear(); REPETIDAS.update(k for k,v in cont.items() if k and v>=3)
        for pn in rng:
            pg=pdf.pages[pn-1]
            try: prods=produtos_pagina(pg,pn); casar_imagens(pg,prods)
            except Exception as e: print('erro pag',pn,e,file=sys.stderr); continue
            pimg=None
            if any('_img' in p for p in prods):
                pimg=pg.to_image(resolution=DPI).original; esc=DPI/72
            for p in prods:
                if '_img' in p:
                    im=imagem(p['_img'],pimg,esc); p['_im']=im
                p.pop('_img',None)
                k=p['codigo']; o=vistos.get(k)
                score=lambda x:(1 if x.get('_im') else 0, len(x['nome']) if len(x['nome'])<90 else 0)
                if o is None: vistos[k]=p
                else:
                    if score(p)>score(o): p['pag']=min(p['pag'],o['pag']); vistos[k]=p
            pg.flush_cache()
    itens=sorted(vistos.values(),key=lambda x:x['pag'])
    # imagem igual em produtos diferentes = selo ou foto de grupo: descarta
    import hashlib
    hs={}
    for p in itens:
        if p.get('_im') is not None:
            h=hashlib.md5(p['_im'].convert('L').resize((16,16)).tobytes()).hexdigest(); p['_h']=h; hs.setdefault(h,set()).add(p['codigo'])
    for p in itens:
        if p.get('_h') and len(hs[p['_h']])>1: p['_im']=None
    with open(saida_prefixo+'.csv','w',newline='',encoding='utf-8-sig') as f:
        w=csv.writer(f,delimiter=';')
        w.writerow(['marca','codigo_revista','nome','categoria','preco','preco_promocional_ciclo','descricao','pagina_catalogo','tem_foto'])
        for p in itens: w.writerow([marca,p['codigo'],p['nome'],categoria(p['nome']+' '+p['descricao']),p['preco'],p['promo'],p['descricao'],p['pag'],'sim' if p.get('_im') else 'não'])
    pasta=os.path.join(saida_fotos, slug); os.makedirs(pasta, exist_ok=True); nf=0
    for p in itens:
        im=p.get('_im')
        if im is None: continue
        acabar(im).save(os.path.join(pasta, p['codigo']+'.jpg'),'JPEG',quality=88,optimize=True,progressive=True); nf+=1
    print(f'{marca}: {len(itens)} produtos, {nf} com foto')
    return itens, nf

def acabar(im):
    im=im.convert('RGB')
    bg=Image.new('RGB', im.size, (255,255,255)); diff=ImageChops.difference(im,bg).convert('L').point(lambda v: 255 if v>18 else 0)
    bb=diff.getbbox()
    if bb: im=im.crop(bb)
    w,h=im.size; lado=int(max(w,h)*1.14)
    sq=Image.new('RGB',(lado,lado),(255,255,255)); sq.paste(im,((lado-w)//2,(lado-h)//2))
    alvo=min(900, max(lado, 500))
    return sq.resize((alvo,alvo), Image.LANCZOS).filter(ImageFilter.UnsharpMask(radius=1.2, percent=60, threshold=2))

if __name__=='__main__':
    pdf,marca,slug=sys.argv[1:4]
    if slug=='oui': TITULO_GRANDE=True
    saida_fotos=sys.argv[4] if len(sys.argv)>4 else 'catalogo-img'
    processar(pdf,marca,slug,os.path.join('catalogo-auto',slug))
