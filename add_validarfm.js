const fs = require('fs');
let d = fs.readFileSync('api/infra/deploy.js', 'utf8');
d = d.replace("chosenDomain === 'perfilbr.com'))", "chosenDomain === 'perfilbr.com' || chosenDomain === 'validarfm.com'))");
d = d.replace("'perfilbr.com': process.env.CLOUDFLARE_ZONE_PERFILBR,", "'perfilbr.com': process.env.CLOUDFLARE_ZONE_PERFILBR,\n              'validarfm.com': process.env.CLOUDFLARE_ZONE_VALIDARFM,");
fs.writeFileSync('api/infra/deploy.js', d, 'utf8');
try { require('./api/infra/deploy.js'); console.log('deploy.js OK'); } catch(e) { console.error('ERROR:', e.message); }
let t = fs.readFileSync('frontend/src/components/blocks/InfraBlock.tsx', 'utf8');
t = t.replace("'veirficacc.com', 'perfilbr.com'", "'veirficacc.com', 'perfilbr.com', 'validarfm.com'");
t = t.replace("'verifcadorbm.com', 'perfilbr.com'", "'verifcadorbm.com', 'perfilbr.com', 'validarfm.com'");
fs.writeFileSync('frontend/src/components/blocks/InfraBlock.tsx', t, 'utf8');
console.log('InfraBlock.tsx OK');
