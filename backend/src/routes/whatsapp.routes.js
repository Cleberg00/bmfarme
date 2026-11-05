const express = require('express');
const authMiddleware = require('../middleware/auth');
const whatsappController = require('../controllers/whatsapp.controller');

const router = express.Router();

// Busca empresas com WhatsApp na base
router.get('/search', authMiddleware, whatsappController.searchWhatsApp);

// Configura atendimento automático
router.post('/auto-answer', authMiddleware, whatsappController.setupAutoAnswer);

// Lista atendimentos automáticos
router.get('/auto-answer', authMiddleware, whatsappController.listAutoAnswers);

module.exports = router;
