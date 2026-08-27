const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadDir = path.join(__dirname, '../../uploads/temp');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|webp/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        if (extname && mimetype) {
            return cb(null, true);
        }
        cb(new Error('Formato de imagen inválido. Solo se admiten JPG, JPEG, PNG y WEBP.'));
    }
});

const { isAuthenticated, verifyRole } = require('../middlewares/auth.middleware');

router.use(isAuthenticated);
router.use(verifyRole(['ADMIN']));

router.get('/', adminController.dashboard);
router.get('/aves', adminController.listarAves);
router.get('/aves/nuevo', adminController.formNuevaAve);
router.post('/aves/nuevo', upload.array('fotos', 2), adminController.registrarAve);
router.get('/aves/:id/editar', adminController.formEditarAve);
router.post('/aves/:id/editar', upload.array('fotos', 2), adminController.actualizarAve);
router.get('/aves/:id/genealogia', adminController.verGenealogia);

// Parejas
router.get('/parejas', adminController.listarParejas);
router.get('/parejas/nuevo', adminController.formNuevaPareja);
router.post('/parejas/nuevo', adminController.registrarPareja);
router.post('/parejas/:id/desunir', adminController.desunirPareja);

module.exports = router;
