# BM Farm Automation

Automação do fluxo Meta Business Manager via AdsPower + Puppeteer.

## Setup

```bash
cd automation
npm install
```

## Configuração

Edite o `.env`:
```
ADSPOWER_API=http://127.0.0.1:50325
ADSPOWER_API_KEY=sua_api_key
```

## Uso

```bash
npm run run
```

O script vai:
1. Listar perfis do AdsPower
2. Abrir o browser selecionado
3. Pedir dados da empresa (Razão Social, CNPJ, endereço, etc)
4. Acessar business.facebook.com
5. Preencher dados do portfolio
6. Adicionar e verificar domínio

## Estrutura

```
automation/
├── .env              # Config AdsPower
├── src/
│   ├── adspower.js       # Client API local AdsPower
│   ├── meta-automation.js # Puppeteer - automação Facebook
│   ├── run.js            # Script interativo principal
│   └── index.js          # Exports
└── screenshots/      # Debug screenshots
```
