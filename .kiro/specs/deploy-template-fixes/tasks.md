# Implementation Plan: Deploy Template Fixes

## Overview

Correção cirúrgica de 4 bugs inter-relacionados em `api/infra/deploy.js`: colisão de template index, DNS TXT bloqueante, erro de htmlCache engolido, e mapa `zoneIds` duplicado 3 vezes. A abordagem é criar um módulo centralizado `api/_lib/zoneIds.js` e aplicar alterações pontuais no handler existente.

## Tasks

- [x] 1. Criar módulo centralizado `api/_lib/zoneIds.js`
  - [x] 1.1 Criar `api/_lib/zoneIds.js` com o mapa ZONE_IDS consolidado (superset dos 3 mapas inline), array ZAPLIFTY_DOMAINS, funções `getZoneId()` e `getCfHeaders()`
    - Consolidar todas as entradas dos 3 mapas `zoneIds` existentes (linhas ~101-182, ~372-411, e o mapa no `fix_txt`) em um único objeto `ZONE_IDS`
    - Exportar `ZONE_IDS`, `ZAPLIFTY_DOMAINS`, `getZoneId(baseDomain)`, `getCfHeaders(baseDomain)`
    - `getZoneId` retorna `ZONE_IDS[baseDomain] || ''`
    - `getCfHeaders` retorna headers com token zapliftyativos quando domínio é da lista ZAPLIFTY_DOMAINS
    - _Requirements: 2.4_

  - [x] 1.2 Implementar `computeTemplateIndex(domainName)` no mesmo módulo
    - Usar algoritmo djb2: `hash = 5381; for each char: hash = ((hash << 5) + hash + charCode) | 0`
    - Retornar `Math.abs(hash) % 8`
    - Exportar a função junto com as demais
    - _Requirements: 2.1, 2.5_

  - [ ]* 1.3 Escrever property test para `computeTemplateIndex`
    - **Property 1: Template index determinism** — mesma entrada sempre produz mesma saída
    - **Property 3: Template index range** — saída sempre em [0, 7] para qualquer string não-vazia
    - **Validates: Requirements 2.1, 2.5**

  - [ ]* 1.4 Escrever property test de distribuição para `computeTemplateIndex`
    - **Property 2: Template index distribution** — para 8+ strings alfanuméricas distintas (5-20 chars), mínimo 4 índices distintos
    - **Validates: Requirements 2.1, 2.5**

  - [ ]* 1.5 Escrever property test para `getZoneId`
    - **Property 4: Zone ID lookup consistency** — `getZoneId(domain)` equivale a `ZONE_IDS[domain] || ''`
    - **Validates: Requirements 2.4**

- [x] 2. Atualizar `api/infra/deploy.js` — substituir mapas inline e corrigir handlers
  - [x] 2.1 Adicionar imports do novo módulo no topo de `deploy.js` e remover os 3 mapas `zoneIds` inline + arrays `zapliftyDomains` duplicados
    - Adicionar: `const { getZoneId, getCfHeaders, ZAPLIFTY_DOMAINS, computeTemplateIndex } = require('../_lib/zoneIds');`
    - Remover mapa inline do handler `fix_txt` (~linhas 101-182) e substituir referências por `getZoneId(baseDom)` e `getCfHeaders(baseDom)`
    - Remover mapa inline do handler `PATCH` (~linhas 372-411) e substituir por chamadas às funções centralizadas
    - Remover arrays `zapliftyDomains` inline em ambos os handlers
    - _Requirements: 2.4, 3.5_

  - [x] 2.2 Substituir fórmula `fixedIndex` no handler `get_site` por `computeTemplateIndex(domain.domainName)`
    - Remover variáveis `cnpjDigits`, `updatedSeed`, `nameSeed` e a fórmula complexa (linha ~270)
    - Substituir por: `const fixedIndex = computeTemplateIndex(domain.domainName);`
    - _Requirements: 2.1, 2.5, 3.1, 3.6_

  - [x] 2.3 Tornar chamada DNS TXT no PATCH fire-and-forget (remover `await`)
    - No bloco de recriação de TXT do PATCH wildcard, remover o `await` do `axios.post(...)` e garantir que o `.catch()` já existente trate erros silenciosamente
    - Remover o `try/catch` externo que envolve todo o bloco TXT (o `catch (txtErr)`) — não é mais necessário pois a promise não é awaited
    - Manter o `console.log` de sucesso como `.then()` se desejado, ou removê-lo
    - _Requirements: 2.2, 3.4_

  - [x] 2.4 Remover try/catch interno do htmlCache write no PATCH para propagar erros
    - Remover o `try { ... } catch (cacheErr) { console.log(...) }` que envolve o `prisma.$executeRawUnsafe` de update do htmlCache
    - Deixar o `await prisma.$executeRawUnsafe(...)` sem proteção local — se falhar, o erro propaga ao `catch (error)` externo que retorna 500
    - _Requirements: 2.3, 3.4_

- [x] 3. Checkpoint — Verificar integração
  - Ensure all tests pass, ask the user if questions arise.

- [ ]* 4. Testes de integração
  - [ ]* 4.1 Escrever teste unitário para o handler PATCH verificando que falha no htmlCache retorna 500
    - **Property 5: htmlCache write failure propagation** — quando o write do prisma falha, response HTTP deve ser 500
    - **Validates: Requirements 2.3**

  - [ ]* 4.2 Escrever teste unitário para o handler PATCH verificando que DNS TXT não bloqueia a resposta
    - **Property 6: DNS TXT non-blocking** — a resposta do PATCH é retornada sem aguardar a promise do axios DNS
    - **Validates: Requirements 2.2**

- [x] 5. Final checkpoint — Validação completa
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- The main implementation is in tasks 1.1, 1.2, 2.1–2.4 — these are the core bugfixes
- Nenhuma mudança de schema é necessária — o model `Domain` já possui todos os campos relevantes

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["1.3", "1.4", "1.5", "2.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.4"] },
    { "id": 3, "tasks": ["4.1", "4.2"] }
  ]
}
```
