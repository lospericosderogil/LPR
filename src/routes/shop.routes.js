const express = require('express');
const router = express.Router();
const shopController = require('../controllers/shop.controller');
const { isAuthenticated } = require('../middlewares/auth.middleware');

router.get('/catalogo', shopController.listarCatalogo);
router.get('/catalogo/:id', shopController.detalleAve);

// Carrito / Reservas (Requiere inicio de sesión para comprar)
router.post('/carrito/agregar', isAuthenticated, shopController.agregarAlCarrito);
router.post('/carrito/quitar', isAuthenticated, shopController.quitarDelCarrito);
router.get('/checkout', isAuthenticated, shopController.verCheckout);
router.post('/checkout', isAuthenticated, shopController.procesarCompra);

module.exports = router;
