# Bugfix Requirements Document

## Introduction

O sistema de publicação de sites (`api/infra/deploy.js`) apresenta três bugs inter-relacionados que afetam a variabilidade visual dos sites publicados, a confiabilidade do endpoint de republicação (PATCH), e a manutenibilidade do código de mapeamento de zonas DNS. Esses problemas impactam diretamente a operação do sistema de deploy wildcard e a experiência do operador.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN múltiplos domínios são criados para o mesmo CNPJ com `updatedAt` similar THEN o sistema gera o mesmo `fixedIndex` (template repetido) porque a fórmula `(cnpjDigits.reduce(...) * 7 + nameSeed * 3 + Math.floor(updatedSeed / 1009)) % 8` produz colisões frequentes — o componente `cnpjDigits * 7` domina o cálculo e `updatedSeed / 1009` muda muito lentamente

1.2 WHEN o endpoint PATCH é chamado para republicar um site wildcard E a chamada DNS TXT ao Cloudflare sofre timeout ou erro de rede THEN o endpoint inteiro pode travar ou retornar erro 500 sem ter atualizado o `htmlCache`, deixando o site com conteúdo desatualizado

1.3 WHEN o endpoint PATCH tenta atualizar o `htmlCache` via `prisma.$executeRawUnsafe` E ocorre erro no banco (ex: conexão expirada, HTML muito grande) THEN o erro é capturado apenas no `console.log` e o endpoint retorna sucesso (`200`) ao operador mesmo sem ter persistido o novo HTML

1.4 WHEN um novo domínio base (baseDomain) precisa ser adicionado ao sistema THEN é necessário duplicar a entrada em 3 mapas `zoneIds` diferentes no mesmo arquivo (`fix_txt`, `PATCH`, `POST wildcard`), o que causa inconsistências — cada mapa já tem entradas diferentes dos outros

1.5 WHEN o `get_site` endpoint serve um domínio sem `htmlCache` E o `fixedIndex` produz o mesmo template que outro domínio do mesmo cliente THEN o operador vê sites visualmente idênticos para CNPJs/empresas diferentes, reduzindo a eficácia da validação Meta

### Expected Behavior (Correct)

2.1 WHEN múltiplos domínios são criados para o mesmo CNPJ THEN o sistema SHALL gerar templates visualmente distintos para cada domínio, usando uma fórmula de hash que distribui uniformemente os 8 layouts com base no `domainName` como fator primário de diferenciação

2.2 WHEN o endpoint PATCH é chamado para republicar um site wildcard E a chamada DNS TXT ao Cloudflare falha (timeout, erro de rede ou erro de API) THEN o sistema SHALL continuar a execução normalmente (a criação de TXT é best-effort), atualizar o `htmlCache` com sucesso, e retornar 200 ao operador

2.3 WHEN o endpoint PATCH tenta atualizar o `htmlCache` e a operação de banco falha THEN o sistema SHALL retornar erro 500 ao operador com mensagem indicando falha na persistência do cache, em vez de retornar sucesso falso

2.4 WHEN um novo domínio base precisa ser adicionado ao sistema THEN o sistema SHALL utilizar um único mapa centralizado de `zoneIds` (definido uma vez no topo do arquivo ou em módulo separado) referenciado por todos os endpoints, eliminando duplicação

2.5 WHEN o `get_site` endpoint gera HTML dinamicamente (sem `htmlCache`) THEN o sistema SHALL produzir um `fixedIndex` que garanta distribuição uniforme entre os 8 templates, priorizando o `domainName` como fonte de entropia para evitar colisões entre domínios do mesmo CNPJ

### Unchanged Behavior (Regression Prevention)

3.1 WHEN um domínio wildcard tem `htmlCache` populado THEN o sistema SHALL CONTINUE TO servir o HTML cacheado diretamente sem regenerar (fast path do `get_site`)

3.2 WHEN o endpoint POST cria um novo site wildcard THEN o sistema SHALL CONTINUE TO criar registros DNS (A + TXT) e worker routes no Cloudflare, salvar o HTML no `htmlCache`, e retornar a URL do site ao operador

3.3 WHEN o endpoint PUT troca o layout do site THEN o sistema SHALL CONTINUE TO regenerar o HTML com novo template, persistir no `htmlCache`, e retornar sucesso ao operador

3.4 WHEN o endpoint PATCH é chamado com `newPhone` para um site wildcard THEN o sistema SHALL CONTINUE TO atualizar o `smsLog` com o novo número de telefone e regenerar o HTML refletindo essa mudança

3.5 WHEN domínios existentes com `baseDomain` já configurado são servidos THEN o sistema SHALL CONTINUE TO resolver o `zoneId` correto para operações DNS, mantendo compatibilidade com todos os domínios já cadastrados no banco

3.6 WHEN o `buildLandingHtml` é chamado com `forceTemplateIndex` THEN o sistema SHALL CONTINUE TO usar exatamente o template indicado pelo índice fornecido, sem alteração na estrutura ou conteúdo dos 8 layouts existentes
