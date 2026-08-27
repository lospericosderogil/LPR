module.exports = (err, req, res, next) => {
    console.error('❌ Error no controlado:', err);
    
    const isAjax = req.xhr || req.headers.accept?.indexOf('json') > -1;
    const statusCode = err.status || 500;
    const message = err.message || 'Ocurrió un error inesperado en el servidor.';

    if (isAjax) {
        return res.status(statusCode).json({
            success: false,
            error: message
        });
    }

    res.status(statusCode).render('error', {
        title: 'Error',
        message: message,
        statusCode: statusCode,
        user: req.session?.user || null
    });
};
