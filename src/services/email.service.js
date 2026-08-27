const nodemailer = require('nodemailer');
require('dotenv').config();

class EmailService {
    constructor() {
        const isSmtpConfigured = process.env.SMTP_HOST && 
                                 process.env.SMTP_USER && 
                                 process.env.SMTP_PASS;

        if (isSmtpConfigured) {
            this.transporter = nodemailer.createTransport({
                host: process.env.SMTP_HOST,
                port: parseInt(process.env.SMTP_PORT) || 587,
                secure: process.env.SMTP_PORT === '465',
                auth: {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASS
                }
            });
            this.isConfigured = true;
            console.log('✉ [SMTP]: Transporter configurado correctamente.');
        } else {
            this.isConfigured = false;
            console.log('✉ [SMTP Warning]: Credenciales SMTP no configuradas en .env. Los correos se imprimirán en consola.');
        }
    }

    async sendEmail({ to, subject, html }) {
        const from = process.env.SMTP_FROM || '"Prompt Maestro" <no-reply@promptmaestro.com>';
        
        if (this.isConfigured) {
            try {
                const info = await this.transporter.sendMail({
                    from,
                    to,
                    subject,
                    html
                });
                console.log(`✉ [SMTP]: Correo enviado con ID ${info.messageId} a ${to}`);
                return info;
            } catch (err) {
                console.error(`❌ [SMTP Error]: No se pudo enviar correo a ${to}.`, err.message);
            }
        } else {
            console.log('========================================================================');
            console.log(`✉ [SMTP SIMULADO]`);
            console.log(`De: ${from}`);
            console.log(`Para: ${to}`);
            console.log(`Asunto: ${subject}`);
            console.log(`Contenido HTML:\n${html}`);
            console.log('========================================================================');
            return { messageId: 'simulated-id-' + Date.now() };
        }
    }

    async enviarConfirmacionCompra(usuario, pedido, detalles) {
        const subject = `Confirmación de Pedido #${pedido.id} - Prompt Maestro`;
        
        let itemsHtml = '';
        detalles.forEach(d => {
            itemsHtml += `
                <tr>
                    <td style="padding: 10px; border-bottom: 1px solid #ddd;">${d.identificador_interno} (${d.anilla || 'Sin anilla'})</td>
                    <td style="padding: 10px; border-bottom: 1px solid #ddd; text-align: right;">S/. ${d.precio_venta}</td>
                </tr>
            `;
        });

        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
                <h2 style="color: #2563eb; text-align: center;">¡Gracias por tu compra, ${usuario.nombre}!</h2>
                <p>Tu pedido ha sido procesado con éxito y se encuentra en estado **PAGADO**.</p>
                <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
                
                <h3>Detalle del Pedido #${pedido.id}</h3>
                <table style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr style="background-color: #f3f4f6;">
                            <th style="padding: 10px; border-bottom: 2px solid #ddd; text-align: left;">Ave / Ejemplar</th>
                            <th style="padding: 10px; border-bottom: 2px solid #ddd; text-align: right;">Precio</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${itemsHtml}
                    </tbody>
                    <tfoot>
                        <tr>
                            <td style="padding: 10px; font-weight: bold; text-align: right;">Total:</td>
                            <td style="padding: 10px; font-weight: bold; text-align: right; color: #2563eb;">S/. ${pedido.total}</td>
                        </tr>
                    </tfoot>
                </table>

                <div style="margin-top: 20px; padding: 15px; background-color: #fef08a; border-radius: 6px; border: 1px solid #fef08a;">
                    <strong>Referencia de Pago ingresada:</strong> ${pedido.referencia_pago}<br>
                    Nuestro equipo administrativo validará la transacción en breve.
                </div>

                <p style="font-size: 12px; color: #777; margin-top: 30px; text-align: center;">
                    Este es un correo automático. Por favor no lo respondas.<br>
                    Prompt Maestro - Crianza y Gestión de Aves Finas.
                </p>
            </div>
        `;

        await this.sendEmail({ to: usuario.email, subject, html });
    }

    async enviarNotificacionReserva(usuario, ave, expiraAt) {
        const subject = `Reserva Temporal Confirmada: ${ave.identificador_interno} - Prompt Maestro`;
        const timeString = new Date(expiraAt).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
        
        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
                <h2 style="color: #2563eb;">Reserva Temporal Confirmada</h2>
                <p>Hola **${usuario.nombre}**,</p>
                <p>Hemos bloqueado el ejemplar **${ave.identificador_interno}** (Anilla: &nbsp;${ave.anilla || 'Sin anilla'}) en tu carrito.</p>
                
                <div style="margin: 20px 0; padding: 15px; background-color: #eff6ff; border-left: 4px solid #2563eb; border-radius: 4px;">
                    <strong>Tiempo límite de reserva:</strong> 10 minutos.<br>
                    <strong>Tu reserva expira a las:</strong> ${timeString} (Hora local)
                </div>

                <p>Por favor, completa tu checkout antes del tiempo indicado para evitar que el ejemplar sea liberado para la venta a otros clientes.</p>

                <p style="font-size: 12px; color: #777; margin-top: 30px; text-align: center;">
                    Prompt Maestro - Crianza y Gestión de Aves Finas.
                </p>
            </div>
        `;

        await this.sendEmail({ to: usuario.email, subject, html });
    }
}

module.exports = new EmailService();
