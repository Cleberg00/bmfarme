/**
 * WhatsApp Business Searcher
 * Busca empresas no Google com WhatsApp e extrai números
 */

const puppeteer = require('puppeteer');
const { lookupCnpj } = require('./cnpj');
const prisma = require('./prisma');

class WhatsAppSearcher {
  constructor() {
    this.browser = null;
    this.searchTerms = [
      'loja de roupas whatsapp',
      'farmacia whatsapp',
      'restaurante whatsapp',
      'mercado whatsapp',
      'padaria whatsapp',
      'autopeca whatsapp',
      'loja de moveis whatsapp',
      'sistema de gestão whatsapp',
      'consultoria whatsapp',
      'imobiliaria whatsapp',
      'academia whatsapp',
      'pet shop whatsapp',
      'salao de beleza whatsapp',
      'carro whatsapp',
      'motoca whatsapp',
    ];
  }

  async init() {
    this.browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
    }
  }

  async searchGoogleForWhatsApp(query, maxResults = 50) {
    const page = await this.browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    
    const results = [];
    const seen = new Set();

    try {
      // Busca no Google
      await page.goto(`https://www.google.com/search?q=${encodeURIComponent(query)}&num=100`, {
        waitUntil: 'networkidle0',
        timeout: 30000,
      });

      // Espera os resultados
      await page.waitForSelector('div.g', { timeout: 10000 });

      // Extrai os links dos resultados
      const links = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('div.g a')).map(a => a.href);
      });

      // Processa cada link
      for (const link of links) {
        if (seen.size >= maxResults) break;

        try {
          // Verifica se tem WhatsApp no link ou página
          if (link && !seen.has(link)) {
            seen.add(link);
            
            // Tenta extrair WhatsApp do link (whatsapp.com/... ou wabusiness.com)
            if (link.includes('whatsapp.com') || link.includes('wabusiness.com')) {
              results.push({
                url: link,
                source: 'whatsapp-link',
                type: 'direct',
              });
              continue;
            }

            // Tenta abrir a página e extrair WhatsApp
            try {
              const pageContent = await page.goto(link, { 
                waitUntil: 'networkidle0',
                timeout: 15000,
              });

              const text = await pageContent.text();
              
              // Extrai WhatsApp com regex
              const whatsappMatches = text.match(/(55?\d{10,11})/g);
              
              if (whatsappMatches) {
                results.push({
                  url: link,
                  whatsapps: [...new Set(whatsappMatches)],
                  source: 'page-scrape',
                  type: 'extracted',
                });
              }
            } catch {
              // Ignora erros de página
            }
          }
        } catch (err) {
          console.error('Erro processando link:', err.message);
        }
      }
    } catch (error) {
      console.error('Erro na busca:', error.message);
    } finally {
      await page.close();
    }

    return results;
  }

  async extractCNPJFromWhatsApp(whatsappNumber) {
    // Tenta encontrar CNPJ pelo número de WhatsApp usando base de dados
    // Este é um método simplificado - em produção, use API de inversão de telefone
    return null;
  }

  async searchAndStoreBusinesses(total = 5000) {
    let processed = 0;

    for (const term of this.searchTerms) {
      if (processed >= total) break;

      console.log(`Buscando: ${term}`);
      const results = await this.searchGoogleForWhatsApp(term, 20);

      for (const result of results) {
        if (processed >= total) break;

        try {
          const cnpj = await this.extractCNPJFromWhatsApp(result.whatsapps?.[0] || '');
          
          // Se tiver CNPJ, consulta Receita Federal
          if (cnpj) {
            const companyData = await lookupCnpj(cnpj);
            
            const company = await prisma.client.upsert({
              where: { cnpj },
              update: {
                razaoSocial: companyData.razaoSocial,
                nomeFantasia: companyData.nomeFantasia,
                telefone: result.whatsapps?.[0],
                email: companyData.email,
              },
              create: {
                cnpj,
                razaoSocial: companyData.razaoSocial,
                nomeFantasia: companyData.nomeFantasia,
                telefone: result.whatsapps?.[0],
                email: companyData.email,
              },
            });

            console.log(`✅ Empresa salva: ${company.razaoSocial} - ${company.telefone}`);
            processed++;
          }
        } catch (err) {
          console.error('Erro salvando empresa:', err.message);
        }
      }
    }

    console.log(`Total de empresas processadas: ${processed}`);
    return processed;
  }
}

module.exports = WhatsAppSearcher;
