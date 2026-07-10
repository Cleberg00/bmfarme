const fs = require('fs');

let d = fs.readFileSync('api/infra/deploy.js', 'utf8');
d = d.replace("chosenDomain === 'mettaativos.com'))", "chosenDomain === 'mettaativos.com' || chosenDomain === 'perfilbr.com'))");
d = d.replace("'mettaativos.com': process.env.CLOUDFLARE_ZONE_METTAATIVOS,", "'mettaativos.com': process.env.CLOUDFLARE_ZONE_METTAATIVOS,\n              'perfilbr.com': process.env.CLOUDFLARE_ZONE_PERFILBR,");
fs.writeFileSync('api/infra/deploy.js', d, 'utf8');
try { require('./api/infra/deploy.js'); console.log('deploy.js OK'); } catch(e) { console.error('ERROR:', e.message); }

let t = fs.readFileSync('frontend/src/components/blocks/InfraBlock.tsx', 'utf8');
// Admin
t = t.replace("'perfilvalidados.com', 'verifcadorbm.com'", "'perfilvalidados.com', 'verifcadorbm.com', 'perfilbr.com'");
// Macumbinha
t = t.replace("'verificabm.com.br', 'zaplifyverifica.com.br', 'veirficacc.com'", "'verificabm.com.br', 'zaplifyverifica.com.br', 'veirficacc.com', 'perfilbr.com'");
fs.writeFileSync('frontend/src/components/blocks/InfraBlock.tsx', t, 'utf8');
console.log('InfraBlock.tsx OK');
