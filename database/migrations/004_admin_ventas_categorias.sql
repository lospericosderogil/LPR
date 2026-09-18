-- Migración 004: Módulos de Administración - Categorías, Productos y Ventas/Pedidos

-- 1. Categorías del Catálogo Comercial
CREATE TABLE IF NOT EXISTS categorias_catalogo (
    id SERIAL PRIMARY KEY,
    slug VARCHAR(50) UNIQUE NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    icono VARCHAR(50) DEFAULT '📦',
    imagen VARCHAR(255),
    descripcion TEXT,
    orden INT DEFAULT 0,
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Productos Complementarios de Tienda (Kits, Alimentos, Salud, Accesorios)
CREATE TABLE IF NOT EXISTS productos_tienda (
    id SERIAL PRIMARY KEY,
    categoria_id INT REFERENCES categorias_catalogo(id) ON DELETE SET NULL,
    nombre VARCHAR(150) NOT NULL,
    descripcion TEXT,
    sku VARCHAR(50) UNIQUE,
    precio_normal NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    precio_internet NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    precio_club NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    stock INT DEFAULT 10,
    foto_url VARCHAR(255),
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Extender tabla existente 'pedidos' para soportar checkout completo
ALTER TABLE pedidos ALTER COLUMN usuario_id DROP NOT NULL;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS codigo_pedido VARCHAR(50) UNIQUE;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS nombre_cliente VARCHAR(150);
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS email_cliente VARCHAR(150);
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS telefono_cliente VARCHAR(50);
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS modalidad_entrega VARCHAR(50) DEFAULT 'RETIRO';
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS direccion_entrega TEXT;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS costo_envio NUMERIC(10,2) DEFAULT 0.00;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS medio_pago VARCHAR(50) DEFAULT 'TARJETA';
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS tipo_comprobante VARCHAR(20) DEFAULT 'BOLETA';
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS ruc VARCHAR(20);
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS razon_social VARCHAR(200);
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS direccion_fiscal TEXT;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS subtotal NUMERIC(10,2) DEFAULT 0.00;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS descuento NUMERIC(10,2) DEFAULT 0.00;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS notas TEXT;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Asegurar que estado no esté limitado estrictamente
ALTER TABLE pedidos DROP CONSTRAINT IF EXISTS pedidos_estado_check;

-- 4. Extender tabla 'detalles_pedido'
ALTER TABLE detalles_pedido ALTER COLUMN ave_id DROP NOT NULL;
ALTER TABLE detalles_pedido ADD COLUMN IF NOT EXISTS producto_tipo VARCHAR(20) DEFAULT 'AVE';
ALTER TABLE detalles_pedido ADD COLUMN IF NOT EXISTS item_id INT;
ALTER TABLE detalles_pedido ADD COLUMN IF NOT EXISTS nombre VARCHAR(150);
ALTER TABLE detalles_pedido ADD COLUMN IF NOT EXISTS sku VARCHAR(50);
ALTER TABLE detalles_pedido ADD COLUMN IF NOT EXISTS cantidad INT DEFAULT 1;
ALTER TABLE detalles_pedido ADD COLUMN IF NOT EXISTS precio_unitario NUMERIC(10,2) DEFAULT 0.00;
ALTER TABLE detalles_pedido ADD COLUMN IF NOT EXISTS subtotal NUMERIC(10,2) DEFAULT 0.00;
ALTER TABLE detalles_pedido ADD COLUMN IF NOT EXISTS foto_url VARCHAR(255);

-- 5. Inserción de Categorías Semilla
INSERT INTO categorias_catalogo (slug, nombre, icono, imagen, orden, activo)
VALUES 
    ('todos', 'Todos los Rubros', '🌐', '/img/salud_preventiva/suplementos_preventivos.jpg', 1, true),
    ('aves', 'Aves de Postura', '🦜', '/img/salud_preventiva/voladera_vuelo.jpg', 2, true),
    ('kits', 'Kits de Bienvenida', '🎁', '/img/salud_preventiva/nido_parental.jpg', 3, true),
    ('alimentos', 'Semillas & Alimento', '🌾', '/img/salud_preventiva/nutricion_reproductiva.jpg', 4, true),
    ('salud', 'Vitaminas & Salud', '🧪', '/img/salud_preventiva/suplementos_preventivos.jpg', 5, true),
    ('accesorios', 'Nidos & Accesorios', '🪵', '/img/salud_preventiva/anatomia_anilla.jpg', 6, true)
ON CONFLICT (slug) DO UPDATE 
SET nombre = EXCLUDED.nombre, icono = EXCLUDED.icono, imagen = EXCLUDED.imagen, orden = EXCLUDED.orden;

-- 6. Inserción de Productos Semilla para Tienda
INSERT INTO productos_tienda (categoria_id, nombre, descripcion, sku, precio_normal, precio_internet, precio_club, stock, foto_url, activo)
VALUES
    ((SELECT id FROM categorias_catalogo WHERE slug = 'kits' LIMIT 1), 'Kit de Bienvenida Criador Pro 2026', 'Incluye jaula de transporte, bebedero anti-goteo, mixtura premium 2kg y anillas de marcaje.', 'KIT-PRO-2026', 180.00, 149.90, 134.90, 15, '/img/salud_preventiva/nido_parental.jpg', true),
    ((SELECT id FROM categorias_catalogo WHERE slug = 'alimentos' LIMIT 1), 'Mixtura Especial Reproducción Élite 5kg', 'Fórmula de semillas seleccionadas con alpiste canadiense, mijo rojo y linaza.', 'ALIM-MIX-5KG', 75.00, 59.90, 52.90, 40, '/img/salud_preventiva/nutricion_reproductiva.jpg', true),
    ((SELECT id FROM categorias_catalogo WHERE slug = 'salud' LIMIT 1), 'Complejo Vitamínico Forti-Aviar 100ml', 'Vitaminas A, D3, E y Complejo B para vigor reproductor y plumaje de concurso.', 'VIT-FORT-100', 48.00, 38.50, 34.00, 25, '/img/salud_preventiva/suplementos_preventivos.jpg', true),
    ((SELECT id FROM categorias_catalogo WHERE slug = 'accesorios' LIMIT 1), 'Caja Nido Madera Natural Ergonómica', 'Nido de cría con cavidad anatómica y tapa de inspección superior.', 'ACC-NIDO-MAD', 55.00, 42.00, 37.80, 20, '/img/salud_preventiva/anatomia_anilla.jpg', true)
ON CONFLICT (sku) DO NOTHING;

-- 7. Inserción de Pedidos Semilla para Visualización en Admin
INSERT INTO pedidos (codigo_pedido, nombre_cliente, email_cliente, telefono_cliente, modalidad_entrega, direccion_entrega, costo_envio, medio_pago, tipo_comprobante, ruc, razon_social, direccion_fiscal, subtotal, total, estado, notas)
VALUES
    ('#LPR-2026-84920', 'Ronald Giles', 'giles.ronald@hotmail.com', '+51 987 654 321', 'RETIRO', 'Aviario Central LPR - Lima', 0.00, 'RIPLEY', 'BOLETA', NULL, NULL, NULL, 53.98, 53.98, 'CONFIRMADO', 'Pago validado con Tarjeta Banco Ripley. Cliente retirará en sede.'),
    ('#LPR-2026-84915', 'Carlos Mendoza', 'carlos.mendoza@gmail.com', '+51 912 345 678', 'DESPACHO', 'JR. Joaquin Capella 531, San Martin de Porres, Lima', 7.90, 'YAPE', 'FACTURA', '20601234567', 'Criadero San Martín S.A.C.', 'JR. Joaquin Capella 531, Lima', 149.90, 157.80, 'EN_PREPARACION', 'Constancia Yape 839201 confirmada. Coordinar despacho con courier bioseguro.'),
    ('#LPR-2026-84890', 'Elena Ramos', 'elena.ramos@outlook.com', '+51 955 432 109', 'DESPACHO', 'Armendariz 497, Miraflores, Lima', 7.90, 'TARJETA', 'BOLETA', NULL, NULL, NULL, 238.40, 246.30, 'ENTREGADO', 'Pedido entregado en óptimas condiciones.')
ON CONFLICT (codigo_pedido) DO NOTHING;
