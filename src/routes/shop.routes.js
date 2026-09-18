const express = require('express');
const router = express.Router();
const shopController = require('../controllers/shop.controller');
const { isAuthenticated } = require('../middlewares/auth.middleware');

router.get('/catalogo', shopController.listarCatalogo);
router.get('/catalogo/:id', shopController.detalleAve);
router.get('/anillado', shopController.guiaAnillado);
router.get('/cuidado-parental', shopController.cuidadoParental);
router.get('/salud-preventiva', shopController.saludPreventiva);
router.get('/ecosistema-genetico', shopController.ecosistemaGenetico);
router.get('/bienestar', shopController.bienestar);
router.get('/experiencias', shopController.experiencias);

// Carrito / Reservas (Visualización pública, reserva formal y compra requieren autenticación)
router.post('/carrito/agregar', isAuthenticated, shopController.agregarAlCarrito);
router.post('/carrito/quitar', isAuthenticated, shopController.quitarDelCarrito);
router.get('/carrito', shopController.verCheckout);
router.get('/checkout', shopController.verCheckout);
router.post('/checkout', isAuthenticated, shopController.procesarCompra);
router.post('/carrito/confirmar-orden', shopController.confirmarOrdenCheckout);

module.exports = router;
