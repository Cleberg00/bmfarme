/**
 * Busca empresas famosas no Google, extrai WhatsApp e configura chatbot
 */

const puppeteer = require('puppeteer');
const fs = require('fs');

const empresasFamosas = [
  'Uber Brasil WhatsApp',
  'Netflix Brasil WhatsApp',
  'Banco do Brasil WhatsApp',
  'Bradesco WhatsApp',
  'Itaú WhatsApp',
  'Magazine Luiza WhatsApp',
  'Amazon Brasil WhatsApp',
  'Mercado Livre WhatsApp',
  'iFood WhatsApp',
  'Uber Eats WhatsApp',
  'Riachuelo WhatsApp',
  'Centauro WhatsApp',
  'Netshoes WhatsApp',
  'Ponto WhatsApp',
  'Submarino WhatsApp',
];

async function extractWhatsApp() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const resultados = [];
  const seen = new Set();

  console.log('🔍 Buscando WhatsApp de empresas famosas...');

  for (const empresa of empresasFamosas) {
    console.log(`\n--- Buscando: ${empresa} ---`);
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    
    try {
      // Busca no Google
      await page.goto(`https://www.google.com/search?q=${encodeURIComponent(empresa)}&num=50`, {
        waitUntil: 'networkidle0',
        timeout: 30000,
      });

      // Extrai links
      const links = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('div.g a')).map(a => a.href);
      });

      // Processa cada link
      for (const link of links) {
        if (!link || link.includes('google.') || seen.has(link)) continue;
        
        seen.add(link);
        
        try {
          // Tenta extrair WhatsApp da página
          await page.goto(link, { waitUntil: 'networkidle0', timeout: 15000 });
          
          const text = await page.evaluate(() => document.body.innerText);
          
          // Extrai WhatsApp (55 + DDD + número)
          const matches = text.match(/55\d{10,11}/g) || [];
          const uniqueWhatsApp = [...new Set(matches)];
          
          for (const whatsapp of uniqueWhatsApp) {
            resultados.push({
              empresa,
              url: link,
              whatsapp,
            });
            console.log(`✅ WhatsApp encontrado: ${whatsapp}`);
          }
        } catch (err) {
          // Ignora erros de página
        }
        
        if (resultados.length >= 5000) break;
      }
    } catch (error) {
      console.error('Erro na busca:', error.message);
    } finally {
      await page.close();
    }

    if (resultados.length >= 5000) break;
  }

  await browser.close();

  // Salva resultados
  fs.writeFileSync('whatsapp-empresas-famosas.json', JSON.stringify(resultados, null, 2));
  
  console.log(`\n✅ Total de WhatsApps extraídos: ${resultados.length}`);
  console.log('📁 Dados salvos em whatsapp-empresas-famosas.json');
  
  return resultados;
}

// Executa
extractWhatsApp()
  .then(() => console.log('\n✅ Extração completa!'))
  .catch(console.error);
