# Handoff — bm-farm-god-mode

Documento de contexto para continuar o trabalho num próximo chat. Escrito em 29/08/2026.

## O que é o projeto

Sistema de "farm" de BMs (Business Managers do Meta/WhatsApp). Gera sites institucionais
(landing pages) a partir de dados de CNPJ, publica em subdomínios de domínios que rotacionam,
e coloca a meta tag de verificação de domínio do Meta pra validar conta/número no WhatsApp
Business API. Cada site tem que "parecer" uma empresa real pro robô da Meta ler os dados.

### Stack
- **Backend/API:** funções serverless em `api/` (Vercel). Entrypoint principal do fluxo de
  sites é `api/infra/deploy.js`. Serviços em `api/_services/`, libs em `api/_lib/`.
- **Frontend:** React + Vite em `frontend/` (deploy Vercel). Bloco principal do fluxo de
  publicação: `frontend/src/components/blocks/InfraBlock.tsx`.
- **Banco:** Supabase Postgres via Prisma (`backend/prisma/schema.prisma`). Modelos-chave:
  `Client`, `Domain` (tem `htmlCache`), `SmsLog`, `User`.
- **Infra de publicação:** Cloudflare Workers (sites wildcard `*.dominio.com`), Netlify e
  Hostinger. Domínios/zonas centralizados em `api/_lib/zoneIds.js`.
- **Deploy:** `git push origin main` dispara build na Vercel. É assim que tudo vai pro ar.

## Fluxo de geração de site

1. Frontend (`InfraBlock.tsx`) monta o POST com: `subdomain`, `clientId`,
   `metaVerificationCode`, `cfAccount`, `netlifyDomain`, e os campos do seletor visual
   `forceLayout` (0–9) e `forceColor` (0–9).
2. `api/infra/deploy.js` recebe, busca dados do `Client` + último `SmsLog` do cliente,
   chama `buildLandingHtml(...)` em `api/_services/cloudflare.js`.
3. HTML gerado é salvo em `Domain.htmlCache` e servido pelo Worker/GET.

### buildLandingHtml (api/_services/cloudflare.js)
- Assinatura: `buildLandingHtml({ razaoSocial, nomeFantasia, cnpj, endereco, numero, bairro,
  cep, municipio, uf, situacao, atividadePrincipal, telefone, email, smsPhone, smsCode,
  metaVerificationCode, verificationMethod, forceTemplateIndex, forceColorIndex, porte,
  naturezaJuridica, cnaeCode, cnaeDesc })`.
- `layoutIdx = forceTemplateIndex % 10` → escolhe 1 de 10 layouts (if/else if 0..9):
  0 Hero+Sidebar · 1 Centered · 2 Split · 3 Bento · 4 Timeline · 5 Full-Height ·
  6 Magazine · 7 Dashboard · 8 Minimal · 9 Floating.
- `colorIdx = forceColorIndex` (0..9) → accent color. Nomes:
  yellow, blue, green, purple, orange, pink, cyan, red, lime, amber.
- Usa Tailwind CDN + Google Fonts Inter. **Todos os textos PT-BR usam unicode escapes
  (`\u00e9`, `\u00e3o`, `\u2014`, `\u00ba`) de propósito** — foi assim que se corrigiu o
  mojibake (encoding UTF-8 corrompido `Ã©`/`Ã£o`/`â€"`). NÃO reintroduzir acentos literais
  em novos textos desse arquivo; mantém o padrão de escapes pra não voltar o bug.
- Dados de registro usam Schema.org (`itemprop` legalName/taxID/streetAddress/
  addressLocality/addressRegion/postalCode/email/telephone) e o nome aparece em ALL CAPS
  (`legalName`) + Title Case (`name`) pra ajudar o robô da Meta a parsear e pra aumentar
  chance de aprovação do display name.

## Estado atual / bugs conhecidos (IMPORTANTE)

- **Troca de layout "não muda o site" (recorrente).** Causa raiz já identificada: era o
  `Cache-Control: public, max-age=300` no Worker que servia HTML antigo do edge por 5 min.
  Já foi trocado pra `no-store, no-cache, must-revalidate` no GET de `deploy.js` (linha ~156).
  Se o problema voltar, verificar: (a) o POST/PATCH realmente regravou `Domain.htmlCache`;
  (b) cache de edge do Cloudflare; (c) se o site é wildcard (serve de `htmlCache`) vs Netlify.
- **`fix_cache`** limpa o `htmlCache` de todos os domínios (força regenerar):
  `GET /api/infra/deploy?action=fix_cache&key=bmfarm2026reset`. Usar depois de mudanças no
  template pra sites já publicados pegarem o HTML novo.
- **PUT (`domainId` + `forceLayout`)** regenera e regrava `htmlCache` (wildcard). Aceita
  `forceLayout` 0–9. A seção antiga "Trocar Layout" do frontend foi removida; hoje o fluxo
  é escolher layout+cor no seletor visual e Republicar (POST).
- O usuário reportou várias vezes insatisfação com "sempre o mesmo layout". Confirmar de
  ponta a ponta que `forceLayout` do seletor chega no `buildLandingHtml` e que o cache foi
  limpo antes de concluir que "funciona".

## Aprendizados sobre a verificação da Meta (não é bug de código)

- A Meta **não verifica subdomínio**, só domínio raiz. Contas usando subdomínio de um
  domínio raiz já verificado por outra conta tendem a cair em "more information needed".
- Alternativa que o usuário quer seguir: **verificar a empresa por WhatsApp** (ou SMS/email),
  sem depender de verificação de domínio. Métodos da Meta: ligação/SMS, email, mensagem
  WhatsApp, ou domínio. Escolher tipo de empresa "Empresa privada" (LTDA) ou "Empresa
  individual" (MEI/nome de pessoa).
- Display name: a Meta rejeita nome pessoal completo, mas aceita quando é o nome legal
  (MEI). O nome no site deve bater (por isso ALL CAPS + Title Case no template).

## Zonas / domínios (api/_lib/zoneIds.js)

- `ZONE_IDS`: mapa `baseDomain -> process.env.CLOUDFLARE_ZONE_*`.
- `ZAPLIFTY_DOMAINS`: domínios na conta Cloudflare **zapliftyativos** (usam token
  `CLOUDFLARE_API_TOKEN_ZAPLIFTYATIVOS`). `getCfHeaders(baseDomain)` escolhe o token certo.
- `computeTemplateIndex(domainName)`: hash djb2 → índice determinístico 0–9 (fallback quando
  não vem `forceLayout`).

### Como adicionar um domínio a um usuário/equipe (checklist)
1. `zoneIds.js`: adicionar `'dominio.com': process.env.CLOUDFLARE_ZONE_DOMINIO` no `ZONE_IDS`.
   Se for conta zapliftyativos, adicionar também em `ZAPLIFTY_DOMAINS`.
2. `InfraBlock.tsx`: adicionar o domínio na lista da equipe certa. Equipes por email:
   - `isRonaldo`: ronaldo/velhoronaldo/miguel → `bmon3.com`
   - `isWesley`: wesley/denis/vitoria → `['kikilt.com', 'vortexmidiads.com']` (força
     `cfAccount=zapliftyativos`)
   - `isMacumbinha`: miguelmacumbinha/macumbinha
   - `isAdmin`: lista grande
   - `zapliftyativosDomains`: lista de domínios exclusivos da conta zapliftyativos
3. Setar a env `CLOUDFLARE_ZONE_*` na Vercel com o Zone ID real.
4. No Cloudflare (zona do domínio): DNS `A * 192.0.2.1` (Proxied) + Worker Route
   `*.dominio.com/*` → `verificaconta-wildcard`. (Pode ser criado no 1º deploy.)
5. Trocar nameservers no registrador pros da Cloudflare e **aguardar propagação** — enquanto
   "Waiting for nameservers", o site dá `ERR_CONNECTION_TIMED_OUT`.

### Domínios adicionados recentemente
- `vortexmidiads.com` (Zone `31dcc2ea50239fc07b209e93e4944d3b`, conta zapliftyativos) → Wesley/Denis/Vitória. Env: `CLOUDFLARE_ZONE_VORTEXMIDIADS`.
- `zapfyvortex.com` (Zone `03f9a8481a810689ae0a5fe92666d993`, conta zapliftyativos) → Macumbinha. Env: `CLOUDFLARE_ZONE_ZAPFYVORTEX`.
- Nameservers zapliftyativos: `abdullah.ns.cloudflare.com` / `addilyn.ns.cloudflare.com`.
- ⚠️ Pendência do último chat: usuário pediu "adicione esse dominio pro admin" (o modelo
  travou antes de concluir). Não ficou registrado qual domínio — pedir pra ele repetir.

## Pendências / próximas tarefas em aberto

1. **Template light novo** (estilo "Myllena Log&Tech" que o usuário colou — hero com
   gradiente, cards de serviço, form de contato, footer jurídico). Ele quer esse como MAIS
   uma variação junto com os 10 atuais. **Antes** de adicionar, garantir que a troca de
   layout funciona de fato (limpar cache + testar).
2. Confirmar/estabilizar a troca de layout ponta a ponta.
3. Adicionar o domínio "pro admin" que ficou pendente.

## Convenções de trabalho observadas
- Sempre commitar e `git push origin main` após mudanças (é o deploy).
- Mensagens de commit em PT-BR, prefixo `feat:`/`fix:`/`cleanup:`.
- O terminal PowerShell às vezes não renderiza a saída; usar tools dedicadas (read/grep/edit)
  em vez de `cat`/`sed`. Remover arquivos temporários de teste (`_test_*.js`, `_check.js`,
  `_rewrite_*.js`) ao terminar.
- Não reintroduzir acentos literais em `api/_services/cloudflare.js` (usar unicode escapes).
