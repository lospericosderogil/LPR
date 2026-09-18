const http = require('http');

function post(url, data) {
    return new Promise((resolve, reject) => {
        const req = http.request('http://localhost:3010' + url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(data)
            }
        }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
        });
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

function get(url, cookie) {
    return new Promise((resolve, reject) => {
        const req = http.request('http://localhost:3010' + url, {
            method: 'GET',
            headers: cookie ? { 'Cookie': cookie } : {}
        }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
        });
        req.on('error', reject);
        req.end();
    });
}

async function run() {
    console.log('Logging in...');
    const loginRes = await post('/login', 'email=admin%40lpr.com&password=admin123');
    const cookie = loginRes.headers['set-cookie'] ? loginRes.headers['set-cookie'][0] : '';
    console.log('Login Status:', loginRes.status, 'Cookie obtained:', !!cookie);

    const endpoints = [
        '/admin',
        '/admin/categorias',
        '/admin/ventas',
        '/admin/ventas/1',
        '/admin/productos',
        '/admin/aves',
        '/admin/parejas'
    ];

    for (const ep of endpoints) {
        try {
            const res = await get(ep, cookie);
            console.log(`Endpoint ${ep} => Status: ${res.status}`);
            if (res.status !== 200) {
                console.log(`  Body preview: ${res.body.slice(0, 300)}`);
            }
        } catch (err) {
            console.error(`Endpoint ${ep} => Error: ${err.message}`);
        }
    }
}

run();
