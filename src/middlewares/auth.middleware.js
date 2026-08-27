module.exports = {
    isAuthenticated: (req, res, next) => {
        if (req.session && req.session.user) {
            return next();
        }
        
        const isAjax = req.xhr || req.headers.accept?.indexOf('json') > -1;
        if (isAjax) {
            return res.status(401).json({ success: false, error: 'Sesión no autorizada o expirada.' });
        }
        res.redirect('/login');
    },

    verifyRole: (allowedRoles) => {
        return (req, res, next) => {
            if (req.session && req.session.user && allowedRoles.includes(req.session.user.rol)) {
                return next();
            }
            
            const isAjax = req.xhr || req.headers.accept?.indexOf('json') > -1;
            if (isAjax) {
                return res.status(403).json({ success: false, error: 'Acceso denegado: permisos insuficientes.' });
            }
            res.status(403).render('error', {
                title: 'Acceso Denegado',
                message: 'No tiene permisos para acceder a esta sección.',
                statusCode: 403,
                user: req.session?.user || null
            });
        };
    }
};
