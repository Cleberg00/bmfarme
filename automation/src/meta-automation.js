// Meta Business Manager Automation via Puppeteer
const puppeteer = require('puppeteer-core');

const TIMEOUTS = {
  navigation: 30000,
  element: 10000,
  action: 3000,
};

class MetaAutomation {
  constructor(wsEndpoint) {
    this.wsEndpoint = wsEndpoint;
    this.browser = null;
    this.page = null;
  }

  async connect() {
    this.browser = await puppeteer.connect({
      browserWSEndpoint: this.wsEndpoint,
      defaultViewport: null,
    });
    const pages = await this.browser.pages();
    this.page = pages[0] || await this.browser.newPage();
    return this;
  }

  async wait(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  // ─── PASSO 1: Ir pro Business Manager ─────────────────────────────────
  async goToBusinessSettings() {
    try {
      await this.page.goto('https://business.facebook.com/latest/home', {
        waitUntil: 'domcontentloaded',
        timeout: TIMEOUTS.navigation,
      });
    } catch (err) {
      // Se der redirect loop, tenta URL alternativa
      console.log('[META] Redirect detectado, tentando URL alternativa...');
      await this.page.goto('https://business.facebook.com/overview', {
        waitUntil: 'domcontentloaded',
        timeout: TIMEOUTS.navigation,
      });
    }
    await this.wait(3000);
    console.log('[META] Business Manager aberto:', this.page.url());
  }

  // ─── PASSO 2: Criar Portfolio Empresarial ──────────────────────────────
  async createPortfolio(businessName) {
    await this.page.goto('https://business.facebook.com/overview', {
      waitUntil: 'networkidle2',
      timeout: TIMEOUTS.navigation,
    });
    await this.wait(2000);

    // Verifica se ja tem portfolio
    const url = this.page.url();
    if (url.includes('/overview') || url.includes('/home')) {
      console.log('[META] Portfolio ja existe ou usuario logado');
      return true;
    }

    // Se nao tem, tenta criar
    try {
      await this.page.goto('https://business.facebook.com/overview/pages?business_id=new', {
        waitUntil: 'networkidle2',
        timeout: TIMEOUTS.navigation,
      });
      await this.wait(3000);

      // Preenche nome do negocio
      const nameInput = await this.page.$('input[name="business_name"]');
      if (nameInput) {
        await nameInput.click({ clickCount: 3 });
        await nameInput.type(businessName, { delay: 50 });
        console.log('[META] Nome do negocio preenchido:', businessName);
      }
    } catch (err) {
      console.log('[META] Erro ao criar portfolio:', err.message);
    }
    return true;
  }

  // ─── PASSO 3: Preencher dados da empresa ───────────────────────────────
  async fillBusinessInfo({ razaoSocial, endereco, bairro, municipio, uf, cep, telefone, site, cnpj }) {
    await this.page.goto('https://business.facebook.com/latest/settings/business_info', {
      waitUntil: 'networkidle2',
      timeout: TIMEOUTS.navigation,
    });
    await this.wait(3000);

    // Clica em "Editar" nos detalhes da empresa
    const editButtons = await this.page.$$('div[role="button"]');
    for (const btn of editButtons) {
      const text = await btn.evaluate(el => el.textContent);
      if (text && text.includes('Editar')) {
        await btn.click();
        await this.wait(2000);
        break;
      }
    }

    // Preenche campos — adaptar seletores conforme necessario
    console.log('[META] Preenchendo dados da empresa...');
    
    // Tenta preencher cada campo se encontrar
    const fields = [
      { label: 'Razão social', value: razaoSocial },
      { label: 'Endereço', value: `${endereco}, ${bairro}, ${municipio}/${uf}` },
      { label: 'CEP', value: cep },
      { label: 'Telefone', value: telefone },
      { label: 'Site', value: site },
    ];

    for (const field of fields) {
      if (!field.value) continue;
      try {
        const inputs = await this.page.$$('input');
        for (const input of inputs) {
          const placeholder = await input.evaluate(el => el.placeholder || el.getAttribute('aria-label') || '');
          if (placeholder.toLowerCase().includes(field.label.toLowerCase())) {
            await input.click({ clickCount: 3 });
            await input.type(field.value, { delay: 30 });
            console.log(`  [OK] ${field.label}: ${field.value}`);
            break;
          }
        }
      } catch {}
    }

    return true;
  }

  // ─── PASSO 4: Adicionar dominio ────────────────────────────────────────
  async addDomain(domainName) {
    await this.page.goto('https://business.facebook.com/latest/settings/owned-domains', {
      waitUntil: 'networkidle2',
      timeout: TIMEOUTS.navigation,
    });
    await this.wait(3000);

    // Clica em "+ Adicionar"
    const addBtn = await this.page.$('div[role="button"][aria-label*="Adicionar"]');
    if (addBtn) {
      await addBtn.click();
      await this.wait(2000);
    }

    // Preenche o nome do dominio
    const domainInput = await this.page.$('input[placeholder*="domínio"], input[type="text"]');
    if (domainInput) {
      await domainInput.click({ clickCount: 3 });
      await domainInput.type(domainName, { delay: 50 });
      console.log('[META] Dominio digitado:', domainName);
      await this.wait(1000);

      // Clica em "Adicionar" ou "Enviar"
      const submitBtns = await this.page.$$('div[role="button"]');
      for (const btn of submitBtns) {
        const text = await btn.evaluate(el => el.textContent);
        if (text && (text.includes('Adicionar') || text.includes('Add'))) {
          await btn.click();
          await this.wait(3000);
          break;
        }
      }
    }

    return true;
  }

  // ─── PASSO 5: Verificar dominio (DNS TXT) ─────────────────────────────
  async verifyDomain() {
    // Seleciona metodo DNS TXT
    const options = await this.page.$$('div[role="radio"], div[role="option"]');
    for (const opt of options) {
      const text = await opt.evaluate(el => el.textContent);
      if (text && (text.includes('TXT') || text.includes('DNS'))) {
        await opt.click();
        await this.wait(1000);
        break;
      }
    }

    // Clica em "Verificar dominio"
    const verifyBtns = await this.page.$$('div[role="button"]');
    for (const btn of verifyBtns) {
      const text = await btn.evaluate(el => el.textContent);
      if (text && (text.includes('Verificar') || text.includes('Verify'))) {
        await btn.click();
        await this.wait(5000);
        console.log('[META] Verificacao de dominio solicitada');
        break;
      }
    }

    return true;
  }

  // ─── PASSO 6: Screenshot para debug ────────────────────────────────────
  async screenshot(filename) {
    await this.page.screenshot({ path: `automation/screenshots/${filename}`, fullPage: true });
    console.log(`[SCREENSHOT] ${filename}`);
  }

  async disconnect() {
    if (this.browser) {
      this.browser.disconnect();
    }
  }
}

module.exports = MetaAutomation;
