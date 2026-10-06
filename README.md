# RevendaOS

Sistema de gestão para revendedoras (estoque, vendas, cobranças, clientes, financeiro, relatórios, equipe e loja virtual), feito em HTML/CSS/JS puro — sem build, sem Node. Roda no **GitHub Pages** com **Firebase Authentication + Firestore**.

## O que tem

| Módulo | Funcionalidades |
|---|---|
| **Início** | Vendas do dia/mês, meta, lucro, a receber, cobranças vencidas, validade, estoque baixo, aniversariantes, entregas pendentes, gráfico de 30 dias |
| **Vendas** | PDV com busca e leitor de código de barras (câmera), desconto em R$ ou %, frete, comissão, à vista ou parcelado (entrada + parcelas mensais/quinzenais/semanais), limite de crédito, status de entrega, recibo no WhatsApp, impressão, cancelamento com devolução ao estoque |
| **Cobranças** | Parcelas em aberto/vencidas/próximos 7 dias, visão por cliente, recebimento parcial (abate as próximas), **Pix copia e cola + QR Code com valor**, lembrete pronto no WhatsApp, comprovante |
| **Clientes** | Cadastro, WhatsApp, aniversário, etiquetas, limite de crédito, ficha com histórico e produtos favoritos, filtros (aniversariantes, devedores, sem comprar há 90 dias), importar/exportar CSV |
| **Estoque** | Lotes por validade (baixa o que vence primeiro), alertas de validade e estoque mínimo, margem, foto, código de barras, importar catálogo CSV, ajuste de entrada/saída/contagem |
| **Catálogo de marcas** | Catálogo **compartilhado entre todas as contas**: navegar por marca e categoria, buscar por nome, código da revista ou código de barras, selecionar vários e cadastrar no estoque de uma vez (custo calculado pelo desconto de revendedora de cada marca), código de barras que preenche o cadastro sozinho, sugestões automáticas das revendedoras e curadoria |
| **Consórcios** | Grupos no padrão "Consorcio G1 - 35,00 - Julho 2025 a Abril 2026"; cria os grupos sozinho a partir das etiquetas das clientes; grade de parcelas por participante e mês (pagar vários meses de uma vez, com comprovante e lançamento no financeiro); cobrança no WhatsApp com Pix do valor em atraso; contemplação por sorteio ou por ordem de cota; etiqueta sincronizada no cadastro da cliente |
| **Kits** | Produto montado com outros (ex.: kit presente); o estoque é calculado pelos componentes e a venda baixa cada um; cancelar devolve |
| **Promoções** | Desconto em % ou preço fixo por produto, categoria, marca ou loja inteira; canal (balcão, loja virtual ou ambos) e período; preço entra sozinho na venda e aparece riscado na loja; central de divulgação por WhatsApp com filtros de clientes |
| **Notificações** | Sino no topo com pedidos novos, parcelas vencidas ou vencendo hoje, contas a pagar, validade, estoque zerado, aniversariantes e entregas pendentes |
| **Compras** | Pedido à marca/fornecedora: entra no estoque com custo e validade, atualiza preço, gera contas a pagar parceladas |
| **Financeiro** | Receitas/despesas, contas a pagar, recorrência, fluxo de caixa (6 meses + previsão de 3), despesas por categoria, comissões por vendedor(a) |
| **Relatórios** | Abas Vendas e lucro, Estoque (por marca ou categoria, valor a custo e a venda, produtos parados) e Inadimplência (faixas de atraso, quem deve, % pago em dia). Faturamento, CMV, lucro bruto, resultado; por produto, marca, categoria, cliente, forma de pagamento e vendedor; produtos sem venda; exportação CSV |
| **Loja virtual** | Cupons de desconto (% ou R$, pedido mínimo, validade), até 5 fotos por produto com galeria, preço promocional riscado. Vitrine pública (`loja.html?l=seu-endereco`) com busca, categorias, sacola, pedido mínimo, taxa de entrega; o pedido chega no sistema **e** no WhatsApp e vira venda com 1 clique |
| **Equipe** | Convite por e-mail, perfil Admin/Vendedor(a), permissões por módulo (sem acesso / ver / editar), meta e comissão individuais, histórico de atividades (log) |
| **Configurações** | Taxas da maquininha (débito e crédito 1x a 12x) com opção de repassar juros ao cliente na venda, nome, logotipo, cor do sistema, chave Pix, metas, mensagens de WhatsApp personalizáveis, tema claro/escuro, backup/restauração em JSON, dados de exemplo |

Também funciona como app instalável no celular (PWA: "Adicionar à tela inicial").

---

## Passo a passo para publicar (tudo pelo navegador)

### 1. Firebase
1. Acesse <https://console.firebase.google.com> → **Adicionar projeto** (o Google Analytics pode ficar desligado).
2. **Authentication** → *Vamos começar* → aba **Método de login** → ative **Google** e **E-mail/senha**.
3. **Firestore Database** → *Criar banco de dados* → modo **produção** → região `southamerica-east1 (São Paulo)`.
4. Ainda no Firestore, aba **Regras** → apague o conteúdo, cole o arquivo **`firestore.rules`** deste projeto → **Publicar**.
5. ⚙️ **Configurações do projeto** → *Seus apps* → ícone **`</>`** (Web) → dê um nome → **Registrar app**. Copie o bloco `firebaseConfig`.

### 2. GitHub
1. Crie um repositório (ex.: `revendaos`) → **Add file → Upload files** → arraste **todo o conteúdo** desta pasta (incluindo a pasta `assets` e o arquivo `.nojekyll`) → **Commit**.
2. Abra `assets/config.js` no GitHub → ✏️ editar → cole os valores do `firebaseConfig` no lugar dos campos → **Commit**.
3. **Settings → Pages** → *Source*: `Deploy from a branch` → Branch `main` / `(root)` → **Save**. Em ~1 minuto o endereço aparece (ex.: `https://SEU-USUARIO.github.io/revendaos/`).

### 3. Autorizar o domínio
Firebase → **Authentication → Configurações → Domínios autorizados** → **Adicionar domínio** → `SEU-USUARIO.github.io`.

Pronto: abra o endereço, entre com o Google. **O primeiro acesso cria a sua conta como administradora.**

> Antes de configurar o Firebase o sistema abre em **modo demonstração** (dados só no navegador), útil para testar.

---

## Catálogo de marcas (o diferencial)
O catálogo é **um só para todo o sistema**: todas as revendedoras que usam o seu RevendaOS veem os mesmos produtos e cadastram o estoque com poucos cliques.

**Busca pelo código do produto (o da revista), como no Revendi:**
- **Cadastro de produto:** digite o código do produto e pressione Enter. Nome, marca, categoria, preço sugerido e foto vêm do catálogo global, e o custo é calculado pelo seu desconto da marca.
- **Venda:** digite o código na busca da venda. Se o produto está no seu estoque, entra direto na venda. Se não está, o sistema busca no catálogo global, cadastra no estoque e já coloca na venda.
- Zeros à esquerda e pontos não atrapalham (07390 = 7390). Se o mesmo código existir em mais de uma marca, o sistema pergunta qual é. Preencher a marca antes de buscar evita a pergunta.
- Na importação, a coluna **Código** com números curtos é tratada como código do produto. Números de 8 a 14 dígitos são tratados como código de barras.

**Como ele se enche:**
1. **Tabelas das marcas:** em *Catálogo de marcas → Gerenciar catálogo → Importar tabela*, envie a planilha (Excel ou CSV) de produtos e preços. Normalmente as marcas disponibilizam essa planilha no portal da revendedora. Há um modelo para baixar.
2. **Seu estoque:** *Publicar a partir do meu estoque* envia os produtos que você já cadastrou (sem custos nem quantidades).
3. **Comunidade:** toda vez que alguém cadastra um produto com código de barras que não está no catálogo, ele vira uma **sugestão**. Você aprova em lote e o catálogo cresce sozinho com o uso.
4. **Código de barras:** ao cadastrar um produto, o sistema procura o código nesta ordem: catálogo, **base Cosmos** (brasileira, com nome, marca, foto e categoria) e Open Beauty Facts. O que for encontrado vira sugestão para o catálogo.
5. **Lista só com códigos:** na importação, uma planilha só com a coluna de códigos de barras pode ser completada automaticamente pela Cosmos (respeitando o limite diário do seu plano).

### Ligar a base Cosmos
1. Crie uma conta em <https://cosmos.bluesoft.com.br> e copie o seu **token** da API.
2. **Recomendado: proxy no Railway** (esconde o token e evita bloqueio do navegador). Suba a pasta `servidor-cosmos` como um serviço novo no Railway. Em *Variables*, crie `COSMOS_TOKEN` com o seu token e `ORIGENS` com `https://SEU-USUARIO.github.io`. Gere um domínio público para o serviço.
3. No sistema, em **Configurações → Base de códigos de barras**, cole o endereço do proxy e clique em *Testar consulta*.
   - Alternativa sem servidor: cole o token direto. Ele fica visível para quem é da sua equipe, e a Cosmos pode bloquear consultas feitas direto do navegador.
4. O proxy guarda em cache as consultas já feitas, então o mesmo código não gasta o limite duas vezes.

**Fotos do catálogo (grátis, no seu GitHub):**
- As fotos ficam na pasta `catalogo-img/<marca>/` do repositório, com o nome igual ao código do produto. Exemplo: `catalogo-img/natura/73852.jpg`. O identificador da marca é o que aparece no sistema, em minúsculas e sem acento.
- O sistema encontra a foto sozinho pelo código: ela aparece no catálogo, no cadastro feito pelo código e na loja virtual.
- Em *Gerenciar catálogo → Fotos do catálogo*, selecione as imagens baixadas do banco de imagens da marca. O sistema reconhece o código no nome do arquivo (por exemplo `Perfume_73852_frente.png`), reduz o tamanho e gera um ZIP. No GitHub, use *Add file → Upload files*, arraste a pasta `catalogo-img` (até 100 arquivos por vez) e confirme com *Commit*.
- Para poucos produtos, toque no ícone de foto de cada produto do catálogo e tire ou escolha a foto ali mesmo.
- Use só imagens com direito de uso: as liberadas pelas marcas para as revendedoras ou fotos tiradas por você.

**Curadoria:** só curadores alteram o catálogo. No primeiro acesso, quem é administrador vê o botão **"Tornar-me curador(a)"** na tela do catálogo. Faça isso com a sua conta antes de divulgar o sistema. Depois, em *Gerenciar catálogo → Curadores*, você adiciona outras pessoas.

> Fotos: use apenas imagens que você tem direito de usar, como as fotos que você mesma tirou ou as liberadas pela marca para as revendedoras.

## Pagamentos (igual ao Revendi)
A cliente paga por Pix, dinheiro ou cartão e você confirma o pagamento no sistema. Não há cobrança automática.
- **Na loja virtual:** quando a cliente escolhe Pix, aparecem o QR Code e o Pix copia e cola com o valor do pedido, além do botão para enviar o comprovante no WhatsApp.
- **Na baixa:** em *Cobranças → Receber*, você pode anexar a foto ou o print do comprovante, que fica guardado junto do pagamento. Para consultar, use *Pagas → ver pagamentos* ou os detalhes da venda.

## Primeiros passos dentro do sistema
1. **Configurações** → nome do negócio, logotipo, cor e **chave Pix** (use "Testar código" no app do banco).
2. **Estoque** → cadastre produtos ou importe o catálogo em CSV (há um modelo para baixar).
3. **Loja virtual → Aparência e configurações** → escolha o endereço, WhatsApp, ative e salve.
4. **Equipe** → convide vendedoras pelo e-mail; elas entram no mesmo endereço e caem direto na sua conta.

## Como personalizar
| O quê | Onde |
|---|---|
| Nome na tela de login | `assets/config.js` → `APP_NOME` |
| Cores, fontes, espaçamentos | `assets/style.css` (variáveis no topo: `--pri`, `--bg`…) — a cor principal também muda em Configurações |
| Menu / ordem dos módulos | `assets/core.js` → `MODS` |
| Formas de pagamento e status de entrega | `assets/core.js` → `FORMAS`, `ENTREGA` |
| Categorias de despesa | `assets/modules/financeiro.js` → `CATS_D`, `CATS_R` |
| Textos de WhatsApp | pela tela de Configurações (sem mexer em código) |
| Ícone do app | `assets/icon.svg` |

Cada tela é um arquivo em `assets/modules/` com uma função `render(el)`. Para criar um módulo novo: crie o arquivo, adicione em `MODS` (core.js) e em `ROTAS` (app.js).

Após alterar arquivos, se o navegador mostrar a versão antiga, aumente o número em `sw.js` (`revendaos-v1` → `v2`).

## Estrutura dos dados (Firestore)
```
usuarios/{uid}                → { contaId }
convites/{email}              → convite pendente de equipe
contas/{contaId}              → nome, config, loja
  membros/{uid}               → papel, permissoes, meta, comissao
  produtos | clientes | vendas | recebiveis | lancamentos | compras | logs
sistema/curadores             → { emails: [...] } quem administra o catálogo
catalogo/{marca}              → nome, total, categorias
  partes/{n}                  → { itens: [...] } produtos em blocos (economiza leituras)
catalogo_ref/{marca}__{cod}   → índice para busca pelo código do produto
catalogo_ean/{codigo}         → índice para busca por código de barras
catalogo_sugestoes/{codigo}   → produtos sugeridos pelas revendedoras
lojas/{slug}                  → dados públicos da vitrine
  itens/{produtoId}           → produtos publicados (sem custo)
  pedidos/{id}                → pedidos da loja
```

## Limites e observações
- **Segurança:** as regras do Firestore garantem que só membros acessam os dados da conta, que só administradoras alteram equipe/configurações e que o histórico não pode ser apagado. As permissões finas por módulo (ver/editar) são aplicadas na interface.
- **Pix:** QR Code estático com valor; a baixa do pagamento é manual (confirmação automática exigiria integração com um banco/PSP).
- **Fotos** são reduzidas e gravadas junto ao produto (sem Firebase Storage, que exige plano pago).
- Não emite nota fiscal. O catálogo de marcas começa vazio e é preenchido por você (tabelas das marcas) e pelas sugestões das revendedoras.
- Plano gratuito do Firebase (Spark): 50 mil leituras e 20 mil gravações por dia, mais do que suficiente para uma revenda.

## Importar histórico de vendas (Revendi)
Em **Vendas → Importar histórico**, envie um CSV com as colunas `data;cliente;itens;total;pagamento;entrega;lucro;tipo;grupo`.
- `tipo=venda`: venda comum (não mexe no estoque nem no caixa).
- `tipo=consorcio`: inscrição no consórcio — não vira venda; se `Pago`, todas as parcelas do grupo ficam quitadas.
- `tipo=resgate`: a cliente usou o crédito do consórcio (`grupo`, ex. G3) e pagou a diferença (`total`).
Importar o mesmo arquivo de novo não duplica nada. Crie os grupos de consórcio antes.

## Crédito de consórcio na venda
No PDV, ao escolher uma cliente com crédito disponível aparece **Pagar com crédito do consórcio**: o crédito abate o total e a diferença é paga na forma escolhida. A participante fica marcada como "crédito usado" no grupo (cancelar a venda libera o crédito).
