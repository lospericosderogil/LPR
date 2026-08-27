-- ============================================================================
-- SCRIPT DE CREACIÓN DE BASE DE DATOS (DDL) - PROMPT MAESTRO
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. TABLA DE ROLES
CREATE TABLE roles (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(50) UNIQUE NOT NULL
);

-- 2. TABLA DE USUARIOS
CREATE TABLE usuarios (
    id SERIAL PRIMARY KEY,
    email VARCHAR(150) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    rol_id INTEGER NOT NULL REFERENCES roles(id),
    nombre VARCHAR(100) NOT NULL,
    telefono VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. TABLA DE ESPECIES
CREATE TABLE especies (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) UNIQUE NOT NULL,
    activo BOOLEAN DEFAULT TRUE
);

-- 4. TABLA DE MUTACIONES
CREATE TABLE mutaciones (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) UNIQUE NOT NULL,
    descripcion TEXT,
    activo BOOLEAN DEFAULT TRUE
);

-- 5. TABLA DE AVES
CREATE TABLE aves (
    id SERIAL PRIMARY KEY,
    anilla VARCHAR(50) UNIQUE,
    identificador_interno VARCHAR(50) UNIQUE NOT NULL,
    sexo CHAR(1) NOT NULL CHECK (sexo IN ('M', 'F', 'D')),
    especie_id INTEGER NOT NULL REFERENCES especies(id),
    fecha_nacimiento DATE NOT NULL CHECK (fecha_nacimiento <= CURRENT_DATE),
    fecha_anillado DATE CHECK (fecha_anillado >= fecha_nacimiento),
    padre_id INTEGER REFERENCES aves(id) ON DELETE SET NULL,
    madre_id INTEGER REFERENCES aves(id) ON DELETE SET NULL,
    procedencia VARCHAR(20) NOT NULL CHECK (procedencia IN ('YO', 'COMPRA', 'OTRO')),
    procedencia_detalles JSONB, -- Estructura: {"criador": "...", "costo": 120.00, "fecha_compra": "YYYY-MM-DD"}
    estado_biologico VARCHAR(30) DEFAULT 'DISPONIBLE' CHECK (estado_biologico IN ('DISPONIBLE', 'VENDIDO', 'MUERTO', 'PERDIDO', 'DONADO', 'INTERCAMBIADO')),
    estado_publicacion VARCHAR(30) DEFAULT 'NO_PUBLICADA' CHECK (estado_publicacion IN ('NO_PUBLICADA', 'EXHIBICION', 'OCULTA')),
    estado_comercial VARCHAR(30) DEFAULT 'NO_VENTA' CHECK (estado_comercial IN ('NO_VENTA', 'EN_VENTA', 'RESERVADA')),
    precio_venta DECIMAL(10,2) CHECK (precio_venta >= 0),
    observaciones_comerciales TEXT,
    fecha_fallecimiento DATE CHECK (fecha_fallecimiento >= fecha_nacimiento),
    motivo_fallecimiento VARCHAR(150),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. TABLA INTERMEDIA AVE_MUTACIONES
CREATE TABLE ave_mutaciones (
    ave_id INTEGER NOT NULL REFERENCES aves(id) ON DELETE CASCADE,
    mutacion_id INTEGER NOT NULL REFERENCES mutaciones(id) ON DELETE CASCADE,
    tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('FENOTIPO', 'GENOTIPO')),
    PRIMARY KEY (ave_id, mutacion_id, tipo)
);

-- 7. TABLA DE PAREJAS
CREATE TABLE parejas (
    id SERIAL PRIMARY KEY,
    macho_id INTEGER NOT NULL REFERENCES aves(id),
    hembra_id INTEGER NOT NULL REFERENCES aves(id),
    fecha_inicio DATE NOT NULL,
    fecha_fin DATE,
    jaula VARCHAR(50),
    nido VARCHAR(50),
    comentario TEXT,
    activo BOOLEAN DEFAULT TRUE,
    CONSTRAINT chk_fechas CHECK (fecha_fin IS NULL OR fecha_fin >= fecha_inicio),
    CONSTRAINT chk_ejemplares_distintos CHECK (macho_id <> hembra_id)
);

-- 8. TABLA DE IMÁGENES POR AVE
CREATE TABLE imagenes_ave (
    id SERIAL PRIMARY KEY,
    ave_id INTEGER NOT NULL REFERENCES aves(id) ON DELETE CASCADE,
    url VARCHAR(255) NOT NULL,
    es_principal BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 9. TABLA DE APUNTES DEL CRIADERO
CREATE TABLE apuntes_ave (
    id SERIAL PRIMARY KEY,
    ave_id INTEGER NOT NULL REFERENCES aves(id) ON DELETE CASCADE,
    titulo VARCHAR(150) NOT NULL,
    contenido TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 10. TABLA DE CONCURSOS
CREATE TABLE concursos_ave (
    id SERIAL PRIMARY KEY,
    ave_id INTEGER NOT NULL REFERENCES aves(id) ON DELETE CASCADE,
    nombre_concurso VARCHAR(150) NOT NULL,
    fecha DATE NOT NULL,
    puntuacion INTEGER CHECK (puntuacion >= 0),
    premio VARCHAR(100),
    comentarios TEXT
);

-- 11. TABLA DE RESERVAS TEMPORALES
CREATE TABLE reservas_temporales (
    ave_id INTEGER PRIMARY KEY REFERENCES aves(id) ON DELETE CASCADE,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
    reservado_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expira_at TIMESTAMP NOT NULL,
    activo BOOLEAN DEFAULT TRUE
);

-- 12. TABLA DE PEDIDOS / VENTAS
CREATE TABLE pedidos (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
    fecha_pedido TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    estado VARCHAR(50) DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE', 'PAGADO', 'CANCELADO', 'ENTREGADO')),
    total DECIMAL(10,2) NOT NULL CHECK (total >= 0),
    referencia_pago VARCHAR(100)
);

-- 13. TABLA DE DETALLES DE PEDIDO
CREATE TABLE detalles_pedido (
    id SERIAL PRIMARY KEY,
    pedido_id INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
    ave_id INTEGER NOT NULL REFERENCES aves(id),
    precio_historico DECIMAL(10,2) NOT NULL CHECK (precio_historico >= 0)
);

-- 14. TABLA DE AUDITORÍA
CREATE TABLE auditoria (
    id SERIAL PRIMARY KEY,
    tabla VARCHAR(50) NOT NULL,
    registro_id INTEGER NOT NULL,
    accion VARCHAR(20) NOT NULL,
    datos_anteriores JSONB,
    datos_nuevos JSONB,
    usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    ip_address VARCHAR(45),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- ÍNDICES PARA OPTIMIZACIÓN
-- ============================================================================
CREATE INDEX idx_aves_anilla ON aves(anilla);
CREATE INDEX idx_aves_estado_comercial ON aves(estado_comercial);
CREATE INDEX idx_aves_sexo ON aves(sexo);
CREATE INDEX idx_ave_mutaciones_ave ON ave_mutaciones(ave_id);
CREATE INDEX idx_parejas_activas ON parejas(macho_id, hembra_id) WHERE activo = TRUE;
CREATE INDEX idx_reservas_expiracion ON reservas_temporales(expira_at) WHERE activo = TRUE;

-- ============================================================================
-- TRIGGERS Y FUNCIONES DE BASE DE DATOS (REGLAS CRÍTICAS)
-- ============================================================================

-- A. PREVENCIÓN DE CICLOS GENEALÓGICOS Y CONTROL DE GÉNERO
CREATE OR REPLACE FUNCTION fn_verificar_genealogia_y_sexo()
RETURNS TRIGGER AS $$
DECLARE
    ciclo_detectado BOOLEAN := FALSE;
    sexo_ancestro CHAR(1);
BEGIN
    -- Validar género del padre (debe ser M)
    IF NEW.padre_id IS NOT NULL THEN
        IF NEW.padre_id = NEW.id THEN
            RAISE EXCEPTION 'Un ave no puede ser su propio padre.';
        END IF;
        
        SELECT sexo INTO sexo_ancestro FROM aves WHERE id = NEW.padre_id;
        IF sexo_ancestro <> 'M' THEN
            RAISE EXCEPTION 'El padre asignado (ID %) debe ser un macho (sexo M).', NEW.padre_id;
        END IF;

        -- CTE recursiva para verificar si el nuevo padre es descendiente del ave actual
        WITH RECURSIVE ancestral_tree AS (
            SELECT id, padre_id, madre_id FROM aves WHERE id = NEW.padre_id
            UNION ALL
            SELECT a.id, a.padre_id, a.madre_id FROM aves a
            INNER JOIN ancestral_tree t ON a.id = t.padre_id OR a.id = t.madre_id
        )
        SELECT EXISTS (
            SELECT 1 FROM ancestral_tree WHERE id = NEW.id
        ) INTO ciclo_detectado;

        IF ciclo_detectado THEN
            RAISE EXCEPTION 'Ciclo genealógico detectado: El padre asignado es descendiente del ave.';
        END IF;
    END IF;

    -- Validar género de la madre (debe ser F)
    IF NEW.madre_id IS NOT NULL THEN
        IF NEW.madre_id = NEW.id THEN
            RAISE EXCEPTION 'Un ave no puede ser su propia madre.';
        END IF;
        
        SELECT sexo INTO sexo_ancestro FROM aves WHERE id = NEW.madre_id;
        IF sexo_ancestro <> 'F' THEN
            RAISE EXCEPTION 'La madre asignada (ID %) debe ser una hembra (sexo F).', NEW.madre_id;
        END IF;

        -- CTE recursiva para verificar si la nueva madre es descendiente del ave actual
        WITH RECURSIVE ancestral_tree AS (
            SELECT id, padre_id, madre_id FROM aves WHERE id = NEW.madre_id
            UNION ALL
            SELECT a.id, a.padre_id, a.madre_id FROM aves a
            INNER JOIN ancestral_tree t ON a.id = t.padre_id OR a.id = t.madre_id
        )
        SELECT EXISTS (
            SELECT 1 FROM ancestral_tree WHERE id = NEW.id
        ) INTO ciclo_detectado;

        IF ciclo_detectado THEN
            RAISE EXCEPTION 'Ciclo genealógico detectado: La madre asignada es descendiente del ave.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_verificar_genealogia_y_sexo
BEFORE INSERT OR UPDATE OF padre_id, madre_id ON aves
FOR EACH ROW
EXECUTE FUNCTION fn_verificar_genealogia_y_sexo();


-- B. CONTROL DE PAREJAS (REGLAS DE EMPAREJAMIENTO)
CREATE OR REPLACE FUNCTION fn_verificar_reglas_pareja()
RETURNS TRIGGER AS $$
DECLARE
    sexo_macho CHAR(1);
    sexo_hembra CHAR(1);
BEGIN
    -- Validar que el macho y la hembra existan y sus sexos sean correctos
    SELECT sexo INTO sexo_macho FROM aves WHERE id = NEW.macho_id;
    SELECT sexo INTO sexo_hembra FROM aves WHERE id = NEW.hembra_id;

    IF sexo_macho <> 'M' THEN
        RAISE EXCEPTION 'El ejemplar macho (ID %) asignado a la pareja no es de sexo M.', NEW.macho_id;
    END IF;
    IF sexo_hembra <> 'F' THEN
        RAISE EXCEPTION 'El ejemplar hembra (ID %) asignado a la pareja no es de sexo F.', NEW.hembra_id;
    END IF;

    -- Si la pareja está activa, comprobar que ninguno tenga otra pareja activa
    IF NEW.activo = TRUE AND NEW.fecha_fin IS NULL THEN
        IF EXISTS (
            SELECT 1 FROM parejas 
            WHERE (macho_id = NEW.macho_id OR hembra_id = NEW.macho_id) 
              AND id <> COALESCE(NEW.id, -1) 
              AND activo = TRUE 
              AND fecha_fin IS NULL
        ) THEN
            RAISE EXCEPTION 'El ejemplar macho (ID %) ya se encuentra en otra pareja activa.', NEW.macho_id;
        END IF;

        IF EXISTS (
            SELECT 1 FROM parejas 
            WHERE (macho_id = NEW.hembra_id OR hembra_id = NEW.hembra_id) 
              AND id <> COALESCE(NEW.id, -1) 
              AND activo = TRUE 
              AND fecha_fin IS NULL
        ) THEN
            RAISE EXCEPTION 'El ejemplar hembra (ID %) ya se encuentra en otra pareja activa.', NEW.hembra_id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_verificar_reglas_pareja
BEFORE INSERT OR UPDATE OF macho_id, hembra_id, activo, fecha_fin ON parejas
FOR EACH ROW
EXECUTE FUNCTION fn_verificar_reglas_pareja();


-- C. CAPTURA Y LOGUEO DE AUDITORÍA AUTOMÁTICA
CREATE OR REPLACE FUNCTION fn_registrar_auditoria()
RETURNS TRIGGER AS $$
DECLARE
    datos_viejos JSONB := NULL;
    datos_nuevos JSONB := NULL;
    usr_id INTEGER := NULL;
BEGIN
    IF (TG_OP = 'UPDATE') THEN
        datos_viejos := to_jsonb(OLD);
        datos_nuevos := to_jsonb(NEW);
        -- Salir del trigger si no hay cambios reales
        IF datos_viejos = datos_nuevos THEN
            RETURN NEW;
        END IF;
    ELSIF (TG_OP = 'INSERT') THEN
        datos_nuevos := to_jsonb(NEW);
    ELSIF (TG_OP = 'DELETE') THEN
        datos_viejos := to_jsonb(OLD);
    END IF;

    -- Obtener ID de usuario ejecutor mediante la sesión local del pool
    BEGIN
        usr_id := NULLIF(current_setting('app.current_user_id', true), '')::INTEGER;
    EXCEPTION WHEN OTHERS THEN
        usr_id := NULL;
    END;

    INSERT INTO auditoria (tabla, registro_id, accion, datos_anteriores, datos_nuevos, usuario_id)
    VALUES (
        TG_TABLE_NAME,
        COALESCE(NEW.id, OLD.id),
        TG_OP,
        datos_viejos,
        datos_nuevos,
        usr_id
    );

    IF (TG_OP = 'DELETE') THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Habilitar disparadores de auditoría en tablas críticas
CREATE TRIGGER trg_audit_aves AFTER INSERT OR UPDATE OR DELETE ON aves FOR EACH ROW EXECUTE FUNCTION fn_registrar_auditoria();
CREATE TRIGGER trg_audit_parejas AFTER INSERT OR UPDATE OR DELETE ON parejas FOR EACH ROW EXECUTE FUNCTION fn_registrar_auditoria();
CREATE TRIGGER trg_audit_pedidos AFTER INSERT OR UPDATE OR DELETE ON pedidos FOR EACH ROW EXECUTE FUNCTION fn_registrar_auditoria();


-- D. TRANSICIÓN Y DESACTIVACIÓN AUTOMÁTICA POR AUSENCIA FÍSICA
CREATE OR REPLACE FUNCTION fn_manejar_ausencia_ave()
RETURNS TRIGGER AS $$
BEGIN
    -- Si el ave deja de estar disponible en el criadero, forzar retiro de venta y desactivar sus reservas/parejas
    IF NEW.estado_biologico IN ('MUERTO', 'PERDIDO', 'DONADO', 'INTERCAMBIADO') THEN
        NEW.estado_publicacion := 'OCULTA';
        NEW.estado_comercial := 'NO_VENTA';

        -- Desactivar reservas temporales asociadas
        UPDATE reservas_temporales SET activo = FALSE WHERE ave_id = NEW.id;

        -- Cerrar parejas reproductivas activas de este ejemplar
        UPDATE parejas 
        SET activo = FALSE, fecha_fin = CURRENT_DATE, comentario = CONCAT(comentario, ' | Cerrada automáticamente por cambio de estado del ejemplar a: ', NEW.estado_biologico)
        WHERE (macho_id = NEW.id OR hembra_id = NEW.id) AND activo = TRUE;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_manejar_ausencia_ave
BEFORE UPDATE OF estado_biologico ON aves
FOR EACH ROW
EXECUTE FUNCTION fn_manejar_ausencia_ave();
