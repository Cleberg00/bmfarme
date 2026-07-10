// DataCrazy CRM - Automação de criação WABA
// Fluxo: Login → Conexões → WhatsApp Cloud → Embedded Signup → Criar WABA

const DATACRAZY_URL = 'https://crm.datacrazy.io';
const DATACRAZY_EMAIL = process.env.DATACRAZY_EMAIL || 'euronaldoalvess@gmail.com';
const DATACRAZY_PASS = process.env.DATACRAZY_PASSWORD || '150304Ral$';

class DataCrazyAutomation {
  constructor(page) {
    this.page = page;
  }

  async wait(ms) { return new Promise(r => setTimeout(r, ms)); }

  // ─── LOGIN ─────────────────────────────────────────────────────────────
  async login() {
    console.log('[DATACRAZY] Acessando login...');
    await this.page.goto(`${DATACRAZY_URL}/login`, {
      waitUntil: 'domcontentloaded', timeout: 30000,
    });
    await this.wait(3000);

    // Preenche email
    const emailInput = await this.page.$('input[type="email"], input[name="email"], input[placeholder*="mail"]');
    if (emailInput) {
      await emailInput.click({ clickCount: 3 });
      await emailInput.type(DATACRAZY_EMAIL, { delay: 30 });
    }

    // Preenche senha
    const passInput = await this.page.$('input[type="password"]');
    if (passInput) {
      await passInput.click({ clickCount: 3 });
      await passInput.type(DATACRAZY_PASS, { delay: 30 });
    }

    // Clica Entrar
    await this.wait(500);
    const btns = await this.page.$$('button');
    for (const btn of btns) {
      const text = await btn.evaluate(el => el.textContent.trim());
      if (text === 'Entrar' || text === 'Login' || text === 'Sign in') {
        await btn.click();
        break;
      }
    }

    await this.wait(5000);
    console.log('[DATACRAZY] Login OK:', this.page.url());
  }

  // ─── NAVEGAR PRA CONEXÕES ──────────────────────────────────────────────
  async goToConexoes() {
    await this.page.goto(`${DATACRAZY_URL}/config/instances`, {
      waitUntil: 'domcontentloaded', timeout: 30000,
    });
    await this.wait(3000);
    console.log('[DATACRAZY] Página de Conexões aberta');
  }

  // ─── CRIAR NOVA CONEXÃO WHATSAPP CLOUD ─────────────────────────────────
  async criarConexaoWhatsApp(nomeConexao) {
    // Clica em "Criar"
    const criarBtn = await this.page.$('button:has-text("Criar"), a:has-text("Criar")');
    if (criarBtn) {
      await criarBtn.click();
    } else {
      // Tenta por texto
      const allBtns = await this.page.$$('button, a');
      for (const btn of allBtns) {
        const text = await btn.evaluate(el => el.textContent.trim());
        if (text === 'Criar' || text.includes('Criar')) {
          await btn.click();
          break;
        }
      }
    }
    await this.wait(2000);

    // Seleciona "WhatsApp Cloud (Oficial)"
    const options = await this.page.$$('div, li, button, a');
    for (const opt of options) {
      const text = await opt.evaluate(el => el.textContent);
      if (text && text.includes('WhatsApp Cloud (Oficial)')) {
        await opt.click();
        console.log('[DATACRAZY] WhatsApp Cloud selecionado');
        break;
      }
    }
    await this.wait(2000);

    // Preenche "Nome da conexão"
    const nomeInput = await this.page.$('input[placeholder*="Nome da conexão"], input[placeholder*="conexão"], input[placeholder*="Nome"]');
    if (nomeInput) {
      await nomeInput.click({ clickCount: 3 });
      await nomeInput.type(nomeConexao, { delay: 30 });
    }

    // Clica "Entrar com o Facebook"
    await this.wait(1000);
    const fbBtns = await this.page.$$('button, a');
    for (const btn of fbBtns) {
      const text = await btn.evaluate(el => el.textContent.trim());
      if (text.includes('Entrar com o Facebook') || text.includes('Facebook')) {
        await btn.click();
        console.log('[DATACRAZY] Clicou "Entrar com o Facebook"');
        break;
      }
    }
    await this.wait(5000);
  }

  // ─── EMBEDDED SIGNUP (popup Facebook) ──────────────────────────────────
  async handleEmbeddedSignup({ razaoSocial, site, telefone }) {
    // Espera popup abrir
    const pages = await this.page.browser().pages();
    let fbPage = pages[pages.length - 1]; // Última aba aberta

    // Se abriu popup, troca pra ela
    if (fbPage.url().includes('facebook.com')) {
      console.log('[SIGNUP] Popup Facebook detectada');
    } else {
      // Espera nova página
      fbPage = await new Promise(resolve => {
        this.page.browser().once('targetcreated', async target => {
          const p = await target.page();
          resolve(p);
        });
      });
    }

    await this.wait(3000);

    // Tela 1: Allow cookies
    try {
      const allowBtn = await fbPage.$('button[title="Allow"], button:has-text("Allow")');
      if (allowBtn) {
        await allowBtn.click();
        console.log('[SIGNUP] Allow cookies clicado');
        await this.wait(2000);
      } else {
        const btns = await fbPage.$$('button');
        for (const btn of btns) {
          const text = await btn.evaluate(el => el.textContent.trim());
          if (text === 'Allow' || text === 'Permitir') {
            await btn.click();
            console.log('[SIGNUP] Allow clicado');
            break;
          }
        }
      }
    } catch {}
    await this.wait(3000);

    // Tela 2: Fill business info - Business name + website + country
    try {
      const inputs = await fbPage.$$('input');
      for (const input of inputs) {
        const ariaLabel = await input.evaluate(el => el.getAttribute('aria-label') || el.placeholder || '');
        if (ariaLabel.toLowerCase().includes('business name')) {
          await input.click({ clickCount: 3 });
          await input.type(razaoSocial, { delay: 30 });
          console.log('[SIGNUP] Business name preenchido');
        }
        if (ariaLabel.toLowerCase().includes('website') || ariaLabel.toLowerCase().includes('site')) {
          await input.click({ clickCount: 3 });
          await input.type(site, { delay: 30 });
          console.log('[SIGNUP] Website preenchido');
        }
      }

      // Seleciona country Brazil
      const selects = await fbPage.$$('select, div[role="listbox"]');
      for (const sel of selects) {
        try { await sel.select('BR'); } catch {}
      }

      // Clica Next
      await this.wait(1000);
      await this.clickButton(fbPage, 'Next');
    } catch (e) { console.log('[SIGNUP] Erro tela business info:', e.message); }
    await this.wait(3000);

    // Tela 3: Create WhatsApp Business account - Next
    try {
      await this.clickButton(fbPage, 'Next');
      console.log('[SIGNUP] Create WABA - Next');
    } catch {}
    await this.wait(3000);

    // Tela 4: WhatsApp Business profile - account name + display name + category
    try {
      const inputs = await fbPage.$$('input');
      for (const input of inputs) {
        const val = await input.evaluate(el => el.value);
        if (!val || val.length < 3) {
          await input.click({ clickCount: 3 });
          await input.type(razaoSocial, { delay: 30 });
        }
      }
      // Category: Other
      const selects = await fbPage.$$('select');
      for (const sel of selects) {
        try { await sel.select('Other'); } catch {
          try { await sel.select('OTHER'); } catch {}
        }
      }
      await this.wait(1000);
      await this.clickButton(fbPage, 'Next');
      console.log('[SIGNUP] Profile criado - Next');
    } catch (e) { console.log('[SIGNUP] Erro tela profile:', e.message); }
    await this.wait(3000);

    // Tela 5: Add phone number
    try {
      // Seleciona "Add a new number"
      const radios = await fbPage.$$('input[type="radio"], div[role="radio"]');
      for (const r of radios) {
        const parent = await r.evaluate(el => el.parentElement?.textContent || '');
        if (parent.includes('Add a new number') || parent.includes('new number')) {
          await r.click();
          break;
        }
      }
      await this.wait(1000);

      // Digita numero
      const phoneInput = await fbPage.$('input[type="tel"], input[placeholder*="phone"], input[placeholder*="número"]');
      if (phoneInput) {
        await phoneInput.click({ clickCount: 3 });
        await phoneInput.type(telefone, { delay: 50 });
        console.log('[SIGNUP] Número digitado:', telefone);
      }

      await this.wait(1000);
      await this.clickButton(fbPage, 'Next');
    } catch (e) { console.log('[SIGNUP] Erro tela phone:', e.message); }
    await this.wait(5000);

    console.log('[SIGNUP] Embedded Signup concluído — aguardando código SMS');
    return fbPage;
  }

  // ─── CONFIRMAR CÓDIGO SMS ──────────────────────────────────────────────
  async confirmSmsCode(fbPage, code) {
    try {
      const codeInput = await fbPage.$('input[type="text"], input[placeholder*="code"], input[placeholder*="código"]');
      if (codeInput) {
        await codeInput.click({ clickCount: 3 });
        await codeInput.type(code, { delay: 50 });
        console.log('[SIGNUP] Código SMS digitado:', code);
      }
      await this.wait(1000);
      await this.clickButton(fbPage, 'Next');
      await this.clickButton(fbPage, 'Finish');
      await this.clickButton(fbPage, 'Done');
    } catch (e) { console.log('[SIGNUP] Erro confirmar código:', e.message); }
    await this.wait(3000);
    console.log('[SIGNUP] WABA criado com sucesso!');
  }

  // ─── FINALIZAR NO DATACRAZY ────────────────────────────────────────────
  async finalizarDataCrazy() {
    await this.wait(3000);
    try {
      await this.clickButton(this.page, 'Finalizar');
      console.log('[DATACRAZY] Finalizado!');
    } catch {}
  }

  // ─── REMOVER PARCEIRO NO FACEBOOK ──────────────────────────────────────
  async removerParceiro(businessId) {
    console.log('[META] Removendo parceiro DataCrazy...');
    await this.page.goto(`https://business.facebook.com/latest/settings/partners?business_id=${businessId}`, {
      waitUntil: 'domcontentloaded', timeout: 30000,
    });
    await this.wait(5000);

    // Procura botão de remover
    const btns = await this.page.$$('div[role="button"], button');
    for (const btn of btns) {
      const text = await btn.evaluate(el => el.textContent.trim());
      if (text.includes('Remover') || text.includes('Remove') || text.includes('✕')) {
        await btn.click();
        await this.wait(2000);
        // Confirma remoção
        await this.clickButton(this.page, 'Confirmar');
        await this.clickButton(this.page, 'Confirm');
        await this.clickButton(this.page, 'Remove');
        console.log('[META] Parceiro removido!');
        break;
      }
    }
  }

  // ─── HELPER: Clicar botão por texto ────────────────────────────────────
  async clickButton(page, text) {
    const btns = await page.$$('button, div[role="button"], a');
    for (const btn of btns) {
      const t = await btn.evaluate(el => el.textContent.trim());
      if (t === text || t.includes(text)) {
        await btn.click();
        return true;
      }
    }
    return false;
  }
}

module.exports = DataCrazyAutomation;
