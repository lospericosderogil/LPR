const usuarioRepository = require('../repositories/usuario.repository');
const bcrypt = require('bcrypt');

class AuthController {
    showLogin(req, res) {
        if (req.session && req.session.user) {
            return res.redirect(req.session.user.rol === 'ADMIN' ? '/admin' : '/');
        }
        res.render('login', { error: null });
    }

    async login(req, res, next) {
        try {
            const { email, password } = req.body;
            if (!email || !password) {
                return res.render('login', { error: 'Por favor complete todos los campos.' });
            }

            const user = await usuarioRepository.findByEmail(email);
            if (!user) {
                return res.render('login', { error: 'Correo o contraseña incorrectos.' });
            }

            const validPassword = await bcrypt.compare(password, user.password_hash);
            if (!validPassword) {
                return res.render('login', { error: 'Correo o contraseña incorrectos.' });
            }

            req.session.user = {
                id: user.id,
                email: user.email,
                rol: user.rol,
                nombre: user.nombre
            };

            res.redirect(user.rol === 'ADMIN' ? '/admin' : '/');
        } catch (err) {
            next(err);
        }
    }

    showRegister(req, res) {
        res.render('register', { error: null });
    }

    async register(req, res, next) {
        try {
            const { email, password, nombre, telefono } = req.body;
            if (!email || !password || !nombre) {
                return res.render('register', { error: 'Por favor complete todos los campos obligatorios.' });
            }

            const existing = await usuarioRepository.findByEmail(email);
            if (existing) {
                return res.render('register', { error: 'El correo ya se encuentra registrado.' });
            }

            const passwordHash = await bcrypt.hash(password, 10);
            
            const db = require('../config/db');
            const resRole = await db.query("SELECT id FROM roles WHERE nombre = 'CLIENTE'");
            const clienteRoleId = resRole.rows[0].id;

            const newUser = await usuarioRepository.create({
                email,
                password_hash: passwordHash,
                rol_id: clienteRoleId,
                nombre,
                telefono
            });

            req.session.user = {
                id: newUser.id,
                email: newUser.email,
                rol: 'CLIENTE',
                nombre: newUser.nombre
            };

            res.redirect('/');
        } catch (err) {
            next(err);
        }
    }

    logout(req, res) {
        req.session.destroy((err) => {
            if (err) {
                console.error('❌ Error destruyendo sesión:', err);
            }
            res.redirect('/login');
        });
    }
}

module.exports = new AuthController();
