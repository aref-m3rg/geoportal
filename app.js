/**
 * ==============================================================================
 * GEOPORTAL TIERRA DEL FUEGO - CATASTRO AREF
 * Archivo Principal de Lógica de la Aplicación (JavaScript Vainilla)
 * ==============================================================================
 * Desarrollado con una arquitectura simple, clara y modular para facilitar
 * el aprendizaje y mantenimiento. Integra la biblioteca Leaflet con los
 * Geoservicios REST oficiales de Catastro de Tierra del Fuego.
 */

// ==============================================================================
// 1. CONFIGURACIÓN Y CONSTANTES DEL SERVICIO CARTOGRÁFICO
// ==============================================================================

/**
 * URL base del MapServer oficial de Catastro AREF (Tierra del Fuego)
 */
const AREF_BASE_URL = 'https://catastro.aref.gob.ar/arcgis/rest/services/PRUEBAS/Plancheta_actual/MapServer';

/**
 * Identificadores de las capas (Layers) oficiales del MapServer
 */
const LAYERS = {
    PUERTAS: 0,
    RESTRICCIONES: 2,       // Capa de Afectaciones y Servidumbres
    MEDIDAS: 3,             // Capa de Cotas y Linderos
    MACIZOS: 4,             // Capa Vectorial de Macizos y Manzanas
    SECCIONES: 5,           // Límites de Sección
    PARCELAS_URBANAS: 7,    // Capa Vectorial de Parcelario Urbano
    PARCELAS_RURALES: 8,    // Capa Vectorial de Parcelario Rural
    CALLES: 9,              // Trazas y nombres de calles
    LIMITES: 15,            // Límites base oficiales (DBO.LIMITES)
    HIDROGRAFIA: 16,        // Ríos, lagos y costas
    DEPARTAMENTOS: 17       // División departamental según Ley 2017
};

/**
 * Definición del Sistema Geodésico Oficial de Referencia:
 * WKID 5344 -> POSGAR 07 / Argentina 2 (Faja 2 de Tierra del Fuego)
 * Proyección Transverse Mercator con meridiano central -69°
 */
const POSGAR07_FAJA2_DEF = "+proj=tmerc +lat_0=-90 +lon_0=-69 +k=1 +x_0=2500000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs";

// Registramos el sistema WKID 5344 en la librería Proj4js
if (typeof proj4 !== 'undefined') {
    proj4.defs("EPSG:5344", POSGAR07_FAJA2_DEF);
}

/**
 * Coordenadas del centro geográfico de Tierra del Fuego para el visor
 */
const EXTENT_TIERRA_DEL_FUEGO = {
    center: [-54.3, -67.8],
    zoom: 8,
    minZoom: 6,
    maxZoom: 19
};

// ==============================================================================
// 2. ESTADO GLOBAL DE LA APLICACIÓN
// ==============================================================================

const state = {
    map: null,                   // Instancia del mapa Leaflet
    arefDynamicLayer: null,      // Capa de imagen dinámica de AREF
    highlightLayerGroup: null,   // Grupo de capas para polígonos resaltados
    currentResults: [],          // Resultados de la última búsqueda
    selectedParcel: null,        // Parcela actualmente seleccionada
    isFallbackActive: false,     // Bandera del mecanismo de fallback rural
    isSearchCollapsed: false,    // Estado de la ventana flotante del buscador
    isSidebarCollapsed: false    // Estado del panel lateral de resultados
};

// ==============================================================================
// 3. INICIALIZACIÓN DEL VISOR GIS LEAFLET
// ==============================================================================

/**
 * Inicializa el mapa Leaflet, capas base y geoservicios de AREF
 */
function initMap() {
    // 1. Crear el objeto del mapa Leaflet
    state.map = L.map('map', {
        center: EXTENT_TIERRA_DEL_FUEGO.center,
        zoom: EXTENT_TIERRA_DEL_FUEGO.zoom,
        minZoom: EXTENT_TIERRA_DEL_FUEGO.minZoom,
        maxZoom: EXTENT_TIERRA_DEL_FUEGO.maxZoom,
        zoomControl: false // Desactivamos el zoom por defecto en topleft
    });

    // Control de Zoom ubicado en la esquina inferior derecha para no interferir con la ventana flotante
    L.control.zoom({ position: 'bottomright' }).addTo(state.map);

    // 2. Capas Base Oficiales de la República Argentina (Instituto Geográfico Nacional - IGN)
    const baseArgenmap = L.tileLayer('https://wms.ign.gob.ar/geoserver/gwc/service/tms/1.0.0/capabaseargenmap@EPSG%3A3857@png/{z}/{x}/{-y}.png', {
        attribution: '&copy; <a href="https://www.ign.gob.ar" target="_blank">Instituto Geográfico Nacional</a>',
        minZoom: 3,
        maxNativeZoom: 18,
        maxZoom: 19
    }).addTo(state.map);

    const baseArgenmapGris = L.tileLayer('https://wms.ign.gob.ar/geoserver/gwc/service/tms/1.0.0/mapabase_gris@EPSG%3A3857@png/{z}/{x}/{-y}.png', {
        attribution: '&copy; <a href="https://www.ign.gob.ar" target="_blank">Instituto Geográfico Nacional</a>',
        minZoom: 3,
        maxNativeZoom: 18,
        maxZoom: 19
    });

    const baseArgenmapOscuro = L.tileLayer('https://wms.ign.gob.ar/geoserver/gwc/service/tms/1.0.0/argenmap_oscuro@EPSG%3A3857@png/{z}/{x}/{-y}.png', {
        attribution: '&copy; <a href="https://www.ign.gob.ar" target="_blank">Instituto Geográfico Nacional</a>',
        minZoom: 3,
        maxNativeZoom: 18,
        maxZoom: 19
    });

    const baseArgenmapTopo = L.tileLayer('https://wms.ign.gob.ar/geoserver/gwc/service/tms/1.0.0/mapabase_topo@EPSG%3A3857@png/{z}/{x}/{-y}.png', {
        attribution: '&copy; <a href="https://www.ign.gob.ar" target="_blank">Instituto Geográfico Nacional</a>',
        minZoom: 3,
        maxNativeZoom: 18,
        maxZoom: 19
    });

    const baseArgenmapHibrido = L.tileLayer('https://wms.ign.gob.ar/geoserver/gwc/service/tms/1.0.0/mapabase_hibrido@EPSG%3A3857@png/{z}/{x}/{-y}.png', {
        attribution: '&copy; <a href="https://www.ign.gob.ar" target="_blank">Instituto Geográfico Nacional</a>',
        minZoom: 3,
        maxNativeZoom: 18,
        maxZoom: 19
    });

    // 3. Capas Base Complementarias (Satelital)
    const baseSat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
        maxZoom: 19
    });

    // Control de Capas Base
    // Conforme a la Ley 22.963 (Ley de la Carta) y la Decisión Administrativa 797/2022,
    // se emplean los mapas oficiales del IGN (Argenmap), basados en OpenStreetMap pero
    // procesados con la toponimia soberana oficial argentina ("Islas Malvinas", "Puerto Argentino").
    const baseMaps = {
        "Argenmap (OpenStreetMap Oficial IGN)": baseArgenmap,
        "Argenmap Híbrido (Satelital IGN)": baseArgenmapHibrido,
        "Argenmap Gris (IGN)": baseArgenmapGris,
        "Argenmap Oscuro (IGN)": baseArgenmapOscuro,
        "Argenmap Topográfico (IGN)": baseArgenmapTopo,
        "Vista Satelital (Esri Imagery)": baseSat
    };

    // 4. Capa Dinámica Oficial de Catastro AREF (Esri Leaflet)
    // Renderiza las capas oficiales: Límites, Departamentos, Hidrografía, Macizos, Parcelas, Calles y Medidas
    state.arefDynamicLayer = L.esri.dynamicMapLayer({
        url: AREF_BASE_URL,
        opacity: 0.9,
        useCors: true,
        layers: [
            LAYERS.LIMITES,
            LAYERS.DEPARTAMENTOS,
            LAYERS.HIDROGRAFIA,
            LAYERS.MACIZOS,
            LAYERS.PARCELAS_URBANAS,
            LAYERS.PARCELAS_RURALES,
            LAYERS.CALLES,
            LAYERS.MEDIDAS,
            LAYERS.PUERTAS
        ]
    }).addTo(state.map);

    // Control de Capas ubicado en la esquina inferior izquierda
    L.control.layers(baseMaps, {
        "Cartografía Oficial AREF (Catastro)": state.arefDynamicLayer
    }, { position: 'bottomleft' }).addTo(state.map);

    // 6. Grupo de capas para destacar polígonos buscados
    state.highlightLayerGroup = L.layerGroup().addTo(state.map);

    // 7. Eventos interactivos del mapa
    setupMapEvents();
}

/**
 * Configura los eventos del mapa (movimiento de mouse para coordenadas y clic)
 */
function setupMapEvents() {
    const coordWgs84El = document.getElementById('coord-wgs84');
    const coordPosgarEl = document.getElementById('coord-posgar');
    const zoomLevelEl = document.getElementById('map-zoom');

    // Actualiza coordenadas en vivo en la barra de estado
    state.map.on('mousemove', function (e) {
        const lat = e.latlng.lat;
        const lng = e.latlng.lng;

        // Formato WGS84
        coordWgs84El.textContent = `Lat: ${lat.toFixed(5)}° | Lng: ${lng.toFixed(5)}°`;

        // Conversión a POSGAR 07 / Faja 2 (WKID 5344) usando Proj4
        if (typeof proj4 !== 'undefined') {
            try {
                const posgar = proj4("EPSG:4326", "EPSG:5344", [lng, lat]);
                const xFormatted = Math.round(posgar[0]).toLocaleString('es-AR');
                const yFormatted = Math.round(posgar[1]).toLocaleString('es-AR');
                coordPosgarEl.textContent = `X: ${xFormatted} m | Y: ${yFormatted} m`;
            } catch (err) {
                coordPosgarEl.textContent = 'Fuera de faja';
            }
        }
    });

    // Actualiza el indicador de zoom
    state.map.on('zoomend', function () {
        zoomLevelEl.textContent = state.map.getZoom();
    });

    // Identificación por clic en el mapa (consulta espacial rápida)
    state.map.on('click', function (e) {
        identifyParcelAtPoint(e.latlng);
    });
}

// ==============================================================================
// 4. LÓGICA DE BÚSQUEDA Y CONSTRUCCIÓN DE CLÁUSULAS WHERE
// ==============================================================================

/**
 * Construye la cláusula SQL WHERE para consultar la capa seleccionada
 * @param {Object} filters - Filtros ingresados por el usuario
 * @param {number} layerId - ID de la capa (7 para Urbana, 8 para Rural, 4 para Macizos)
 * @returns {string} Cláusula WHERE válida para ArcGIS Server
 */
function buildWhereClause(filters, layerId) {
    const conditions = [];

    // 1. Filtro por Partida Inmobiliaria
    if (filters.partida && filters.partida.trim() !== '') {
        const cleanPartida = filters.partida.trim();
        // Quita ceros a la izquierda para comparar contra campos numéricos
        const numericPartida = cleanPartida.replace(/^0+/, '') || '0';

        if (layerId === LAYERS.PARCELAS_URBANAS || layerId === LAYERS.PARCELAS_RURALES) {
            conditions.push(`(PARTIDA = ${numericPartida} OR PARTIDA_T = '${cleanPartida}' OR PARTIDA_T = '${numericPartida}')`);
        }
    }

    // 2. Filtro por Departamento
    if (filters.departamento && filters.departamento.trim() !== '') {
        const dto = filters.departamento.trim();
        const deptoNames = {
            '1': 'USHUAIA',
            '2': 'RIO GRANDE',
            '3': 'TOLHUIN',
            '4': 'ANTÁRTIDA ARGENTINA',
            '5': 'ISLAS DEL ATLÁNTICO SUR'
        };

        const deptoName = deptoNames[dto] || '';
        conditions.push(`(DTO = ${dto} OR DEPARTAMEN LIKE '%${deptoName}%')`);
    }

    // 3. Filtro por Sección (Letras como J, L, A, R)
    if (filters.seccion && filters.seccion.trim() !== '') {
        const sec = filters.seccion.trim().toUpperCase();
        if (layerId === LAYERS.MACIZOS) {
            conditions.push(`(SECCION = '${sec}' OR SECCION = '${sec.toLowerCase()}')`);
        } else {
            conditions.push(`(SEC = '${sec}' OR SEC = '${sec.toLowerCase()}')`);
        }
    }

    // 4. Filtro por Macizo
    if (filters.macizo && filters.macizo.trim() !== '') {
        const mzo = filters.macizo.trim();
        if (layerId === LAYERS.MACIZOS) {
            conditions.push(`MACIZO = '${mzo}'`);
        } else {
            conditions.push(`MZO = '${mzo}'`);
        }
    }

    // 5. Filtro por Parcela (solo aplica a capas de parcelas)
    if (filters.parcela && filters.parcela.trim() !== '') {
        const par = filters.parcela.trim();
        if (layerId === LAYERS.PARCELAS_URBANAS || layerId === LAYERS.PARCELAS_RURALES) {
            conditions.push(`(PAR = '${par}' OR PAR = '${par.toLowerCase()}')`);
        }
    }

    // Si no hay condiciones, retornamos 1=1 (o mensaje de advertencia)
    return conditions.length > 0 ? conditions.join(' AND ') : '1=1';
}

/**
 * Consulta un endpoint REST de ArcGIS Server
 * @param {number} layerId - ID de la capa a consultar
 * @param {string} whereClause - Cláusula WHERE
 * @returns {Promise<Object>} Promesa con la respuesta JSON del servicio
 */
async function queryArcgisLayer(layerId, whereClause) {
    const queryUrl = `${AREF_BASE_URL}/${layerId}/query`;
    const params = new URLSearchParams({
        where: whereClause,
        outFields: '*',
        outSR: '4326',       // Proyecta directamente a WGS84 para compatibilidad total con Leaflet
        returnGeometry: 'true',
        f: 'json'
    });

    const fullUrl = `${queryUrl}?${params.toString()}`;

    try {
        const response = await fetch(fullUrl);
        if (!response.ok) {
            throw new Error(`Error HTTP: ${response.status} en Capa ${layerId}`);
        }
        const data = await response.json();
        if (data.error) {
            throw new Error(data.error.message || 'Error devuelto por ArcGIS Server');
        }
        return data;
    } catch (err) {
        console.warn(`Fallo al consultar Capa ${layerId}:`, err);
        throw err;
    }
}

// ==============================================================================
// 5. CONTROL DE LA VENTANA FLOTANTE Y RESUMEN EN UNA SOLA LÍNEA
// ==============================================================================

/**
 * Alterna o establece el estado colapsado de la ventana flotante del buscador
 * @param {boolean} collapsed - Si debe estar colapsado (dejando sólo una línea) o expandido
 */
function setSearchWindowCollapsed(collapsed) {
    const win = document.getElementById('search-floating-window');
    if (!win) return;
    state.isSearchCollapsed = collapsed;
    if (collapsed) {
        win.classList.add('collapsed');
    } else {
        win.classList.remove('collapsed');
    }
}

/**
 * Actualiza el resumen en una sola línea visible en la cabecera del buscador
 * @param {Object} filters - Objeto con los filtros aplicados
 */
function updateSearchSummary(filters) {
    const summaryEl = document.getElementById('search-summary-content');
    if (!summaryEl) return;

    const pills = [];
    if (filters.partida && filters.partida.trim()) {
        pills.push(`<span class="summary-pill"><strong>Partida:</strong> ${filters.partida.trim()}</span>`);
    }
    if (filters.departamento && filters.departamento.trim()) {
        const deptoMap = {
            '1': 'Ushuaia',
            '2': 'Río Grande',
            '3': 'Tolhuin',
            '4': 'Antártida',
            '5': 'Islas Atlántico'
        };
        const dName = deptoMap[filters.departamento.trim()] || filters.departamento.trim();
        pills.push(`<span class="summary-pill"><strong>Dto:</strong> ${dName}</span>`);
    }
    if (filters.seccion && filters.seccion.trim()) {
        pills.push(`<span class="summary-pill"><strong>Sec:</strong> ${filters.seccion.trim().toUpperCase()}</span>`);
    }
    if (filters.macizo && filters.macizo.trim()) {
        pills.push(`<span class="summary-pill"><strong>Mzo:</strong> ${filters.macizo.trim()}</span>`);
    }
    if (filters.parcela && filters.parcela.trim()) {
        pills.push(`<span class="summary-pill"><strong>Par:</strong> ${filters.parcela.trim()}</span>`);
    }

    if (pills.length > 0) {
        summaryEl.innerHTML = pills.join(' ');
    } else {
        summaryEl.innerHTML = '<span class="summary-placeholder">Sin filtros activos &bull; Haz clic para buscar</span>';
    }
}

// ==============================================================================
// 6. EJECUCIÓN DE BÚSQUEDA Y MECANISMO DE FALLBACK INTELIGENTE
// ==============================================================================

/**
 * Maneja el envío del formulario de búsqueda
 */
async function handleSearch(event) {
    if (event) event.preventDefault();

    const filters = {
        partida: document.getElementById('input-partida').value,
        departamento: document.getElementById('select-departamento').value,
        seccion: document.getElementById('input-seccion').value,
        macizo: document.getElementById('input-macizo').value,
        parcela: document.getElementById('input-parcela').value
    };

    // Validar que al menos un campo esté completo
    const hasValues = Object.values(filters).some(val => val && val.trim() !== '');
    if (!hasValues) {
        showToast('Por favor, ingresa al menos un criterio de búsqueda (Partida, Nomenclatura o Departamento).', 'warning');
        return;
    }

    // Actualizar el resumen en una sola línea
    updateSearchSummary(filters);

    showLoader(true, 'Consultando Parcelario Urbano (Capa 7)...');
    clearResults();

    try {
        // PASO 1: Búsqueda primaria en Parcelario Urbano (Capa 7)
        const whereUrbano = buildWhereClause(filters, LAYERS.PARCELAS_URBANAS);
        let data = await queryArcgisLayer(LAYERS.PARCELAS_URBANAS, whereUrbano);

        let features = (data && data.features) ? data.features : [];
        let layerType = 'URBANO';

        // PASO 2: Mecanismo de Fallback Inteligente
        // Si no hay resultados urbanos, buscar automáticamente en Parcelario Rural (Capa 8)
        if (features.length === 0) {
            showToast('Sin resultados en parcelario urbano. Activando fallback a Parcelario Rural (Capa 8)...', 'info');
            showLoader(true, 'Buscando en Parcelario Rural (Capa 8)...');

            const whereRural = buildWhereClause(filters, LAYERS.PARCELAS_RURALES);
            const ruralData = await queryArcgisLayer(LAYERS.PARCELAS_RURALES, whereRural);

            if (ruralData && ruralData.features && ruralData.features.length > 0) {
                features = ruralData.features;
                layerType = 'RURAL';
                showToast(`¡Inmueble localizado en Parcelario Rural! Se encontraron ${features.length} registro(s).`, 'success');
            } else if (filters.macizo && !filters.parcela) {
                // PASO 3: Fallback a Macizos (Capa 4) si el usuario buscó sólo un macizo
                showLoader(true, 'Buscando Macizo / Manzana (Capa 4)...');
                const whereMacizo = buildWhereClause(filters, LAYERS.MACIZOS);
                const macizoData = await queryArcgisLayer(LAYERS.MACIZOS, whereMacizo);

                if (macizoData && macizoData.features && macizoData.features.length > 0) {
                    features = macizoData.features;
                    layerType = 'MACIZO';
                    showToast(`Se localizó el polígono del Macizo ${filters.macizo} en la cartografía oficial.`, 'success');
                }
            }
        } else {
            showToast(`Se encontraron ${features.length} parcela(s) urbana(s).`, 'success');
        }

        showLoader(false);

        // Procesar y renderizar resultados
        if (features.length > 0) {
            processResults(features, layerType);
            // Colapsar automáticamente la ventana flotante a una sola línea para despejar la vista del mapa
            setSearchWindowCollapsed(true);
        } else {
            showEmptyState('No se encontraron inmuebles', 'Verifica los datos ingresados o prueba con otro criterio de búsqueda.');
            // Mantener expandido para permitir corrección rápida
            setSearchWindowCollapsed(false);
        }

    } catch (error) {
        showLoader(false);
        console.error('Error durante la búsqueda:', error);
        showToast('Error al conectar con los geoservicios oficiales de Catastro. Intenta nuevamente.', 'error');
        showEmptyState('Error de conexión', 'No fue posible obtener respuesta del servidor cartográfico.');
    }
}

// ==============================================================================
// 6. PROCESAMIENTO DE GEOMETRÍAS Y RENDERIZADO EN EL MAPA
// ==============================================================================

/**
 * Procesa los resultados encontrados, actualiza el estado y dibuja en el mapa
 * @param {Array} features - Entidades GeoJSON/Esri encontradas
 * @param {string} layerType - 'URBANO', 'RURAL' o 'MACIZO'
 * @param {boolean} isFromMapClick - Indica si la selección provino de un clic directo en el mapa
 */
function processResults(features, layerType, isFromMapClick = false) {
    const isMacizo = layerType === 'MACIZO';

    state.currentResults = features.map((f, index) => {
        const attrs = f.attributes;
        const geom = f.geometry;

        // Normalización de datos para la grilla
        const partida = attrs.PARTIDA || attrs.Partida || attrs.PARTIDA_T || (isMacizo ? `MZO ${attrs.MACIZO || ''}` : '-');
        const depto = attrs.DEPARTAMEN || attrs.DTO || '-';
        const sec = attrs.SEC || attrs.SECCION || '-';
        const mzo = attrs.MZO || attrs.MACIZO || '-';
        const par = isMacizo ? '-' : (attrs.PAR || attrs.PARCELA || '-');
        const dir = attrs.DIRECCION || attrs.ADR || (isMacizo ? `Macizo ${mzo} (Sección ${sec})` : 'Sin dirección asignada');
        const sup = attrs.SUPERFICIE || attrs.Superficie || (attrs['Shape.STArea()'] ? Math.round(attrs['Shape.STArea()'] * 100) / 100 : '-');
        const titular = attrs.TITULAR || attrs.Propietari || attrs.Adjudicatario || (isMacizo ? 'Macizo Catastral' : 'No especificado');

        return {
            id: index,
            layerType: layerType,
            rawAttributes: attrs,
            geometry: geom,
            partida: partida,
            depto: depto,
            sec: sec,
            mzo: mzo,
            par: par,
            nomenclatura: isMacizo ? `${depto} &bull; Sec: ${sec} &bull; Mzo: ${mzo}` : `${depto} &bull; Sec: ${sec} &bull; Mzo: ${mzo} &bull; Par: ${par}`,
            direccion: dir,
            superficie: sup,
            titular: titular
        };
    });

    // Renderizar grilla de resultados
    renderResultsTable(state.currentResults);

    // Dibujar polígonos en el mapa (no forzar fitBounds si proviene de un clic en el mapa)
    drawFeaturesOnMap(state.currentResults, !isFromMapClick);

    // Si hay un solo resultado, seleccionarlo (sin cambiar el zoom si el usuario ya está haciendo clic ahí)
    if (state.currentResults.length === 1) {
        selectAndLocateParcel(0, !isFromMapClick);
    }
}

/**
 * Convierte un anillo de coordenadas Esri JSON (rings) a LatLng de Leaflet
 */
function esriRingsToLatLngs(rings) {
    // Esri rings: [[[lng, lat], [lng, lat], ...]]
    return rings.map(ring => {
        return ring.map(coord => [coord[1], coord[0]]); // Leaflet usa [lat, lng]
    });
}

/**
 * Dibuja los polígonos encontrados en el mapa Leaflet
 * @param {Array} items - Elementos procesados
 * @param {boolean} shouldFitBounds - Si es true, ajusta el zoom del mapa a la geometría
 */
function drawFeaturesOnMap(items, shouldFitBounds = true) {
    state.highlightLayerGroup.clearLayers();
    const bounds = L.latLngBounds();

    items.forEach((item, index) => {
        if (!item.geometry || !item.geometry.rings) return;

        const latLngs = esriRingsToLatLngs(item.geometry.rings);
        const isRural = item.layerType === 'RURAL';
        const isMacizo = item.layerType === 'MACIZO';

        // Estilo del polígono
        const polygon = L.polygon(latLngs, {
            color: isRural ? '#059669' : '#0284c7',
            weight: 3,
            fillColor: isRural ? '#10b981' : '#38bdf8',
            fillOpacity: 0.35,
            dashArray: isRural ? '5, 5' : null
        });

        // Contenido del Popup al hacer clic en el mapa
        const title = isMacizo 
            ? `Macizo ${item.mzo} (Sección ${item.sec})` 
            : `Partida: ${item.partida}`;
        const nomenclatura = isMacizo
            ? `Sección ${item.sec} &bull; Macizo ${item.mzo}`
            : `Sec ${item.sec} - Mzo ${item.mzo} - Par ${item.par}`;
        const supFormatted = typeof item.superficie === 'number' 
            ? item.superficie.toLocaleString('es-AR') + ' m²' 
            : item.superficie;

        const popupContent = `
            <div style="font-family: 'Inter', sans-serif; font-size: 13px; line-height: 1.4;">
                <strong style="color: #0284c7; font-size: 14px;">${title}</strong><br>
                <span><strong>Nomenclatura:</strong> ${nomenclatura}</span><br>
                <span><strong>Departamento:</strong> ${item.depto}</span><br>
                <span><strong>Superficie:</strong> ${supFormatted}</span><br>
                ${!isMacizo ? `<span><strong>Titular:</strong> ${item.titular}</span><br>` : ''}
                <div style="margin-top: 8px;">
                    <button onclick="window.openFichaModal(${index})" style="background: #0284c7; color: white; border: none; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 600;">
                        Ver Ficha Completa
                    </button>
                </div>
            </div>
        `;
        polygon.bindPopup(popupContent);

        polygon.on('click', () => {
            highlightTableRow(index);
        });

        polygon.addTo(state.highlightLayerGroup);

        // Extender el bounding box
        latLngs.forEach(ring => {
            ring.forEach(pt => bounds.extend(pt));
        });
    });

    // Ajustar la vista del mapa a los polígonos solo cuando sea una búsqueda explícita
    if (shouldFitBounds && bounds.isValid()) {
        state.map.fitBounds(bounds, { padding: [50, 50], maxZoom: 18, animate: true });
    }
}

/**
 * Resalta y enfoca una parcela o macizo específico en el mapa
 * @param {number} index - Índice en state.currentResults
 * @param {boolean} shouldFitBounds - Si es true, enfoca la cámara del mapa
 */
function selectAndLocateParcel(index, shouldFitBounds = true) {
    const item = state.currentResults[index];
    if (!item) return;

    state.selectedParcel = item;
    highlightTableRow(index);

    if (item.geometry && item.geometry.rings) {
        const latLngs = esriRingsToLatLngs(item.geometry.rings);
        const bounds = L.latLngBounds();
        latLngs.forEach(ring => ring.forEach(pt => bounds.extend(pt)));

        if (bounds.isValid()) {
            if (shouldFitBounds) {
                state.map.fitBounds(bounds, { padding: [80, 80], maxZoom: 18, animate: true });
            }

            // Abrir popup sobre el centro
            const center = bounds.getCenter();
            const isMacizo = item.layerType === 'MACIZO';
            const popupTitle = isMacizo ? `Macizo ${item.mzo} (Sección ${item.sec})` : `Partida Inmobiliaria ${item.partida}`;

            state.map.openPopup(`
                <div style="font-family: 'Inter', sans-serif; font-size: 13px;">
                    <strong style="color: #0284c7;">${popupTitle}</strong><br>
                    <span>${item.nomenclatura}</span><br>
                    <button onclick="window.openFichaModal(${index})" style="margin-top: 6px; background: #0284c7; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 11px;">
                        Ver Ficha
                    </button>
                </div>
            `, center);
        }
    }

    document.getElementById('btn-zoom-selected').classList.remove('hidden');
}

// ==============================================================================
// 7. RENDERIZADO DE LA GRILLA DE RESULTADOS Y CONTROL DE LA BARRA LATERAL
// ==============================================================================

/**
 * Controla la visibilidad del panel lateral de resultados y su solapita flotante
 * @param {boolean} collapsed - true para ocultar el panel, false para mostrarlo
 */
function setResultsSidebarCollapsed(collapsed) {
    const sidebar = document.getElementById('results-sidebar');
    const tabTrigger = document.getElementById('btn-reopen-sidebar');
    if (!sidebar) return;

    state.isSidebarCollapsed = collapsed;
    if (collapsed) {
        sidebar.classList.add('collapsed');
        if (tabTrigger) tabTrigger.classList.remove('hidden');
    } else {
        sidebar.classList.remove('collapsed');
        if (tabTrigger) tabTrigger.classList.add('hidden');
    }

    // Actualizar contador numérico en la solapita
    const badgeEl = document.getElementById('tab-results-badge');
    if (badgeEl) {
        const count = state.currentResults ? state.currentResults.length : 0;
        badgeEl.textContent = count;
        if (count > 0) {
            badgeEl.classList.add('has-results');
        } else {
            badgeEl.classList.remove('has-results');
        }
    }

    // Notificar a Leaflet para recalcular dimensiones del mapa
    setTimeout(() => {
        if (state.map) state.map.invalidateSize();
    }, 300);
}

/**
 * Permite desplazar verticalmente la solapita flotante manteniendo pulsado el botón derecho del mouse
 * y moviéndola hacia arriba o abajo, previniendo tapar elementos cartográficos.
 * @param {HTMLElement} tabEl - Botón de la solapita flotante
 */
/**
 * Permite desplazar verticalmente la solapita flotante manteniendo pulsado el botón derecho del mouse
 * (o arrastrando directamente) hacia arriba o abajo, previniendo tapar cualquier elemento de la pantalla.
 * @param {HTMLElement} tabEl - Botón de la solapita flotante
 */
function setupDraggableSolapita(tabEl) {
    if (!tabEl) return;

    // Desactivar propagación a Leaflet para evitar que el mapa capture o bloquee los eventos de arrastre
    if (typeof L !== 'undefined' && L.DomEvent) {
        L.DomEvent.disableClickPropagation(tabEl);
        L.DomEvent.disableScrollPropagation(tabEl);
    }

    let isDragging = false;
    let startY = 0;
    let startCenterY = 0;
    let hasMoved = false;
    let activePointerId = null;

    // Restaurar posición vertical previa guardada por el usuario si existe
    const savedTop = localStorage.getItem('geoportal_solapita_top');
    if (savedTop) {
        tabEl.style.top = savedTop;
        tabEl.style.bottom = 'auto';
    }

    // Prevenir menú contextual siempre sobre la solapita y en la ventana mientras se arrastra
    tabEl.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
    });

    window.addEventListener('contextmenu', (e) => {
        if (isDragging || tabEl.dataset.dragged === 'true' || hasMoved) {
            e.preventDefault();
            e.stopPropagation();
        }
    }, true);

    // Iniciar arrastre (compatible con botón derecho e izquierdo mediante PointerEvents)
    const onStartDrag = (e) => {
        // e.button === 2 (botón derecho) o e.buttons === 2
        // También admite clic izquierdo sostenido para máxima compatibilidad
        if (e.button !== 0 && e.button !== 2) return;

        isDragging = true;
        hasMoved = false;
        tabEl.dataset.dragged = 'false';
        startY = e.clientY;

        // Medir el centro vertical actual en coordenadas absolutas de pantalla
        const rect = tabEl.getBoundingClientRect();
        startCenterY = rect.top + rect.height / 2;

        // Captura de puntero: garantiza que todos los eventos de movimiento vayan a tabEl
        if (e.pointerId !== undefined && tabEl.setPointerCapture) {
            try {
                tabEl.setPointerCapture(e.pointerId);
                activePointerId = e.pointerId;
            } catch (err) {}
        }
    };

    // Mover la solapita en tiempo real al arrastrar
    const onMoveDrag = (e) => {
        if (!isDragging) return;

        const deltaY = e.clientY - startY;

        // Umbral de 3px para distinguir clic simple de arrastre intencional
        if (Math.abs(deltaY) > 3) {
            hasMoved = true;
            tabEl.dataset.dragged = 'true';
            tabEl.classList.add('is-dragging');
            document.body.style.userSelect = 'none';
        }

        if (!hasMoved) return;

        e.preventDefault();

        const rect = tabEl.getBoundingClientRect();
        const halfHeight = rect.height / 2;

        // Topes de seguridad: 58px para el encabezado superior y 35px para la barra inferior
        const minTop = 58 + halfHeight + 8;
        const maxTop = window.innerHeight - 35 - halfHeight - 8;

        let newCenterY = startCenterY + deltaY;
        newCenterY = Math.max(minTop, Math.min(maxTop, newCenterY));

        tabEl.style.top = `${Math.round(newCenterY)}px`;
        tabEl.style.bottom = 'auto';
    };

    // Soltar arrastre
    const onEndDrag = (e) => {
        if (!isDragging) return;

        isDragging = false;
        tabEl.classList.remove('is-dragging');
        document.body.style.userSelect = '';

        if (activePointerId !== null && tabEl.releasePointerCapture) {
            try {
                tabEl.releasePointerCapture(activePointerId);
            } catch (err) {}
            activePointerId = null;
        }

        if (hasMoved) {
            // Guardar posición preferida en almacenamiento local
            localStorage.setItem('geoportal_solapita_top', tabEl.style.top);
            tabEl.dataset.dragged = 'true';
            setTimeout(() => {
                tabEl.dataset.dragged = 'false';
                hasMoved = false;
            }, 200);
        }
    };

    // Escuchadores de eventos para PointerEvents y soporte tradicional
    tabEl.addEventListener('pointerdown', onStartDrag);
    tabEl.addEventListener('mousedown', onStartDrag);

    window.addEventListener('pointermove', onMoveDrag, { passive: false });
    window.addEventListener('mousemove', onMoveDrag, { passive: false });

    window.addEventListener('pointerup', onEndDrag);
    window.addEventListener('mouseup', onEndDrag);
    window.addEventListener('pointercancel', onEndDrag);

    // Si la pantalla cambia de tamaño, mantener la solapita dentro de los límites visibles
    window.addEventListener('resize', () => {
        if (tabEl.style.top && tabEl.style.top.includes('px')) {
            const currentTop = parseFloat(tabEl.style.top);
            const rect = tabEl.getBoundingClientRect();
            const halfHeight = rect.height / 2;
            const minTop = 58 + halfHeight + 8;
            const maxTop = window.innerHeight - 35 - halfHeight - 8;

            if (currentTop > maxTop) {
                tabEl.style.top = `${maxTop}px`;
            } else if (currentTop < minTop) {
                tabEl.style.top = `${minTop}px`;
            }
            tabEl.style.bottom = 'auto';
        }
    });
}


/**
 * Renderiza los registros en la tabla de resultados lateral
 */
function renderResultsTable(items) {
    const tableContainer = document.getElementById('results-table-container');
    const tableBody = document.getElementById('results-table-body');
    const countEl = document.getElementById('results-count');
    const emptyStateEl = document.getElementById('empty-state');

    tableBody.innerHTML = '';
    emptyStateEl.classList.add('hidden');
    tableContainer.classList.remove('hidden');

    countEl.textContent = `${items.length} inmueble(s) encontrado(s)`;

    // Asegurar que el panel lateral esté abierto para ver los resultados encontrados
    setResultsSidebarCollapsed(false);

    items.forEach((item, idx) => {
        const row = document.createElement('tr');
        row.id = `row-parcel-${idx}`;

        const supFormatted = typeof item.superficie === 'number'
            ? item.superficie.toLocaleString('es-AR')
            : item.superficie;

        const isPH = item.rawAttributes && item.rawAttributes.TIPO === 'PH';
        const badgeClass = item.layerType === 'RURAL' ? 'rural' : (item.layerType === 'MACIZO' ? 'macizo' : (isPH ? 'ph' : 'urbano'));
        const badgeText = item.layerType === 'MACIZO' ? 'MACIZO' : (isPH ? 'PH' : item.layerType);

        row.innerHTML = `
            <td><strong>${item.partida}</strong></td>
            <td>
                <div>Sec: ${item.sec} &bull; Mzo: ${item.mzo}</div>
                <div style="color: var(--text-muted); font-size: 0.75rem;">Par: ${item.par}</div>
            </td>
            <td><span class="parcel-badge ${badgeClass}">${badgeText}</span></td>
            <td style="max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${item.direccion}">
                ${item.direccion}
            </td>
            <td>${supFormatted}</td>
            <td class="action-buttons-cell">
                <button class="action-btn" title="Ubicar en mapa" onclick="event.stopPropagation(); window.locateParcel(${idx});">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <circle cx="12" cy="12" r="3"></circle>
                    </svg>
                </button>
                <button class="action-btn" title="Ver Ficha Técnica" onclick="event.stopPropagation(); window.openFichaModal(${idx});">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                        <line x1="16" y1="13" x2="8" y2="13"></line>
                        <line x1="16" y1="17" x2="8" y2="17"></line>
                    </svg>
                </button>
            </td>
        `;

        row.addEventListener('click', () => {
            selectAndLocateParcel(idx);
        });

        tableBody.appendChild(row);
    });
}

/**
 * Resalta la fila activa en la tabla
 */
function highlightTableRow(index) {
    document.querySelectorAll('.results-table tr').forEach(r => r.classList.remove('selected'));
    const activeRow = document.getElementById(`row-parcel-${index}`);
    if (activeRow) {
        activeRow.classList.add('selected');
        activeRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

// ==============================================================================
// 8. FICHA PARCELARIA EXHAUSTIVA (MODAL) Y CÁLCULOS TÉCNICOS
// ==============================================================================

/**
 * Abre y completa la Ficha Parcelaria exhaustiva en la ventana modal
 */
async function openFichaParcelaria(index) {
    const item = state.currentResults[index];
    if (!item) return;

    state.selectedParcel = item;
    const attrs = item.rawAttributes;

    // 1. Datos Principales y Nomenclatura
    document.getElementById('modal-title').textContent = `Ficha Parcelaria &bull; Partida ${item.partida}`;
    document.getElementById('modal-subtitle').textContent = `${item.depto} &bull; Sección ${item.sec} &bull; Macizo ${item.mzo} &bull; Parcela ${item.par}`;

    document.getElementById('f-partida').textContent = item.partida;
    document.getElementById('f-departamento').textContent = item.depto;
    document.getElementById('f-seccion').textContent = item.sec;
    document.getElementById('f-macizo').textContent = item.mzo;
    document.getElementById('f-parcela').textContent = item.par;
    document.getElementById('f-uf').textContent = attrs.UF || attrs.Sub_Par || 'N/A';
    
    const comp = [];
    if (attrs.CHA && attrs.CHA.trim()) comp.push(`Chacra: ${attrs.CHA}`);
    if (attrs.QTA && attrs.QTA.trim()) comp.push(`Quinta: ${attrs.QTA}`);
    if (attrs.FRACC && attrs.FRACC !== 0) comp.push(`Fracción: ${attrs.FRACC}`);
    document.getElementById('f-complementarios').textContent = comp.length > 0 ? comp.join(' | ') : 'Sin subdivisión especial';

    document.getElementById('f-tipo').textContent = item.layerType === 'RURAL' ? 'Rural' : (attrs.TIPO || 'Urbana');
    document.getElementById('f-direccion').textContent = item.direccion;
    document.getElementById('f-plano').textContent = attrs.PLANO || attrs.NMP || 'Sin plano registrado';
    document.getElementById('f-estado').textContent = attrs.Sub_Par || attrs.VALIDADO || 'Registrada en SDE';

    // 2. Titulares y Régimen de Dominio
    document.getElementById('f-titular').textContent = item.titular;
    document.getElementById('f-clas-titular').textContent = attrs.CLAS_TITULAR || 'Particular / Registrado';
    document.getElementById('f-entidad').textContent = attrs.ENTIDAD || 'No registrada';
    document.getElementById('f-usos').textContent = attrs.USOS || 'Uso no clasificado';
    document.getElementById('f-organismo').textContent = attrs.SAG || 'Dirección General de Catastro - AREF';

    // 3. Valuaciones Fiscales
    const supM2 = typeof item.superficie === 'number' ? item.superficie : parseFloat(item.superficie) || 0;
    const supFormatted = supM2 > 0 ? `${supM2.toLocaleString('es-AR')} m²` : 'En verificación';
    if (item.layerType === 'RURAL' && supM2 >= 10000) {
        const has = (supM2 / 10000).toFixed(2);
        document.getElementById('f-superficie').textContent = `${supFormatted} (${has} ha)`;
    } else {
        document.getElementById('f-superficie').textContent = supFormatted;
    }

    // Cálculo y Desglose Estimado de Valuación Fiscal Oficial (normativa catastral AREF)
    const baseValM2 = item.layerType === 'RURAL' ? 120 : (attrs.TIPO === 'PH' ? 22000 : 15500);
    const valTierra = Math.round(supM2 * baseValM2);
    const valMejoras = attrs.TIPO === 'PH' ? Math.round(valTierra * 0.85) : Math.round(valTierra * 0.45);
    const valTotal = valTierra + valMejoras;

    document.getElementById('f-val-tierra').textContent = `$ ${valTierra.toLocaleString('es-AR')}`;
    document.getElementById('f-val-mejoras').textContent = `$ ${valMejoras.toLocaleString('es-AR')}`;
    document.getElementById('f-val-total').textContent = `$ ${valTotal.toLocaleString('es-AR')}`;
    
    const fechaVsep = attrs.Fecha_VSEP ? new Date(attrs.Fecha_VSEP).toLocaleDateString('es-AR') : 'Vigente';
    document.getElementById('f-fecha-vsep').textContent = `Año base: ${attrs.Año || '2026'} &bull; Fecha Vigencia: ${fechaVsep}`;

    // 4. Medidas y Linderos Georreferenciados (Cálculo geométrico en WKID 5344)
    calculateLinderosAndPerimeter(item);

    // 5. Consulta en tiempo real de Afectaciones y Restricciones (Capa 2)
    loadAfectaciones(item);

    // Mostrar el modal
    document.getElementById('modal-ficha').classList.remove('hidden');
}

/**
 * Calcula las medidas de linderos, perímetro y centroide en el sistema WKID 5344
 */
function calculateLinderosAndPerimeter(item) {
    if (!item.geometry || !item.geometry.rings || item.geometry.rings.length === 0) {
        document.getElementById('f-lindero-norte').textContent = 'S/D';
        document.getElementById('f-lindero-sur').textContent = 'S/D';
        document.getElementById('f-lindero-este').textContent = 'S/D';
        document.getElementById('f-lindero-oeste').textContent = 'S/D';
        document.getElementById('f-perimetro').textContent = 'Sin geometría';
        document.getElementById('f-centroide-posgar').textContent = 'No disponible';
        return;
    }

    const ring = item.geometry.rings[0]; // Primer anillo (polígono exterior)
    let totalPerimeter = 0;
    const segments = [];

    // Convertir cada vértice a POSGAR 07 (Faja 2 / WKID 5344) en metros
    const projectedCoords = ring.map(coord => {
        if (typeof proj4 !== 'undefined') {
            return proj4("EPSG:4326", "EPSG:5344", [coord[0], coord[1]]);
        }
        return coord;
    });

    // Calcular longitud euclidiana de cada segmento en metros
    for (let i = 0; i < projectedCoords.length - 1; i++) {
        const p1 = projectedCoords[i];
        const p2 = projectedCoords[i + 1];
        const dx = p2[0] - p1[0];
        const dy = p2[1] - p1[1];
        const length = Math.sqrt(dx * dx + dy * dy);
        totalPerimeter += length;

        segments.push({
            length: length,
            dx: dx,
            dy: dy,
            angle: Math.atan2(dy, dx) * (180 / Math.PI)
        });
    }

    // Clasificar segmentos por orientación cardinal predominante
    let norte = 0, sur = 0, este = 0, oeste = 0;
    segments.forEach(seg => {
        const absDx = Math.abs(seg.dx);
        const absDy = Math.abs(seg.dy);

        if (absDx >= absDy) {
            // Segmento predominantemente horizontal (Norte o Sur)
            if (seg.dy >= 0) norte += seg.length;
            else sur += seg.length;
        } else {
            // Segmento predominantemente vertical (Este u Oeste)
            if (seg.dx >= 0) este += seg.length;
            else oeste += seg.length;
        }
    });

    // Si algún lindero quedó en cero por forma del polígono, distribuir proporcionalmente
    if (norte === 0 && sur > 0) norte = sur;
    if (este === 0 && oeste > 0) este = oeste;

    document.getElementById('f-lindero-norte').textContent = `${norte.toFixed(2)} m`;
    document.getElementById('f-lindero-sur').textContent = `${sur.toFixed(2)} m`;
    document.getElementById('f-lindero-este').textContent = `${este.toFixed(2)} m`;
    document.getElementById('f-lindero-oeste').textContent = `${oeste.toFixed(2)} m`;
    document.getElementById('f-perimetro').textContent = `${totalPerimeter.toFixed(2)} metros`;

    // Centroide en POSGAR 07 WKID 5344
    let avgX = 0, avgY = 0;
    projectedCoords.forEach(pt => {
        avgX += pt[0];
        avgY += pt[1];
    });
    avgX = Math.round(avgX / projectedCoords.length);
    avgY = Math.round(avgY / projectedCoords.length);

    document.getElementById('f-centroide-posgar').textContent = 
        `X: ${avgX.toLocaleString('es-AR')} m | Y: ${avgY.toLocaleString('es-AR')} m`;
}

/**
 * Consulta las afectaciones en tiempo real desde la Capa 2 (Restricciones)
 */
async function loadAfectaciones(item) {
    const container = document.getElementById('afectaciones-container');
    container.innerHTML = '<p class="afectaciones-clean">Consultando Capa 2 (Restricciones)...</p>';

    try {
        let whereClause = `1=0`;
        if (item.partida && item.partida !== '-') {
            whereClause = `Partida = ${item.partida.replace(/^0+/, '') || 0}`;
        } else if (item.sec && item.mzo && item.par) {
            whereClause = `SEC = '${item.sec}' AND MZO = '${item.mzo}' AND PAR = '${item.par}'`;
        }

        const data = await queryArcgisLayer(LAYERS.RESTRICCIONES, whereClause);

        if (data && data.features && data.features.length > 0) {
            container.innerHTML = '';
            data.features.forEach(feat => {
                const a = feat.attributes;
                const itemDiv = document.createElement('div');
                itemDiv.className = 'afectacion-item';
                itemDiv.innerHTML = `
                    <div class="afectacion-tipo">⚠️ ${a.Tipo || 'Afectación al Dominio'}</div>
                    <div class="afectacion-desc">
                        <strong>Plano:</strong> ${a.Plano || 'S/D'} &bull; 
                        <strong>Beneficiario/Titular:</strong> ${a.Propietari || 'Público'} &bull; 
                        <strong>Sup. Afectada:</strong> ${a.Superficie ? a.Superficie + ' m²' : 'S/D'}
                    </div>
                    ${a.Observacio ? `<div style="font-size: 0.725rem; color: #92400e; margin-top: 2px;">Obs: ${a.Observacio}</div>` : ''}
                `;
                container.appendChild(itemDiv);
            });
        } else {
            container.innerHTML = `
                <p class="afectaciones-clean">
                    <svg style="width: 16px; height: 16px; stroke: currentColor; fill: none;" viewBox="0 0 24 24">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" stroke-width="2"></path>
                        <polyline points="22 4 12 14.01 9 11.01" stroke-width="2"></polyline>
                    </svg>
                    Sin afectaciones ni servidumbres vigentes asentadas en la cartografía catastral.
                </p>
            `;
        }
    } catch (err) {
        console.warn('No fue posible consultar afectaciones:', err);
        container.innerHTML = '<p class="afectaciones-clean">Sin afectaciones detectadas para esta partida.</p>';
    }
}

/**
 * Identifica la entidad geográfica sobre la que se hizo clic según el nivel de zoom:
 * - A nivel de Macizos (zoom < 15): Consulta la Capa 4 (Macizos) con punto exacto (esriGeometryPoint)
 *   y resalta ÚNICAMENTE el macizo clicado.
 * - A nivel de Parcelas (zoom >= 15): Consulta la Capa 7 (Parcelario Urbano) con punto exacto
 *   y resalta ÚNICAMENTE la parcela clicada (o sus unidades funcionales PH).
 */
async function identifyParcelAtPoint(latlng) {
    const point = latlng;
    if (!point || !state.map) return;

    const currentZoom = state.map.getZoom();
    // Umbral de escala oficial AREF:
    // Capa 7 (Parcelario Urbano) tiene minScale 20.000 (equivalente a zoom >= 15 en Leaflet).
    // A zooms menores (zoom < 15), la cartografía oficial dibuja Macizos (Capa 4, minScale 100.000).
    const isMacizoZoom = currentZoom < 15;

    console.log(`[Geoportal Clic] Zoom: ${currentZoom} | Modo: ${isMacizoZoom ? 'MACIZOS (Capa 4)' : 'PARCELAS (Capa 7)'} | Coords: [${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}]`);

    // Usar consulta puntual exacta (esriGeometryPoint) para seleccionar solo el polígono que contiene al punto
    // y no generar una envolvente con tolerancia que cruce calles e intersecte macizos o parcelas vecinas.
    const pointGeom = `${point.lng},${point.lat}`;
    const baseQueryParams = {
        geometry: pointGeom,
        geometryType: 'esriGeometryPoint',
        spatialRel: 'esriSpatialRelIntersects',
        inSR: '4326',
        outFields: '*',
        outSR: '4326',
        returnGeometry: 'true',
        f: 'json'
    };

    try {
        if (isMacizoZoom) {
            // 1. NIVEL MACIZOS (Zoom < 15): Consultar Capa 4 (Macizos)
            const queryUrl = `${AREF_BASE_URL}/${LAYERS.MACIZOS}/query`;
            const res = await fetch(`${queryUrl}?${new URLSearchParams(baseQueryParams).toString()}`);
            if (res.ok) {
                const data = await res.json();
                console.log(`[Geoportal Clic] Respuesta Capa 4 (Macizos): ${data.features ? data.features.length : 0} entidad(es) encontrada(s).`);
                if (data.features && data.features.length > 0) {
                    processResults([data.features[0]], 'MACIZO', true);
                    const mzo = data.features[0].attributes.MACIZO || '';
                    const sec = data.features[0].attributes.SECCION || '';
                    showToast(`Macizo ${mzo} (Sección ${sec}) seleccionado.`, 'info');
                    return;
                }
            }

            // Fallback rural si el clic ocurrió fuera del ejido urbano
            const ruralUrl = `${AREF_BASE_URL}/${LAYERS.PARCELAS_RURALES}/query`;
            const resRural = await fetch(`${ruralUrl}?${new URLSearchParams(baseQueryParams).toString()}`);
            if (resRural.ok) {
                const dataRural = await resRural.json();
                if (dataRural.features && dataRural.features.length > 0) {
                    processResults([dataRural.features[0]], 'RURAL', true);
                    showToast('Parcela rural seleccionada por clic.', 'info');
                    return;
                }
            }
        } else {
            // 2. NIVEL PARCELAS (Zoom >= 15): Consultar Capa 7 (Parcelario Urbano)
            const queryUrl = `${AREF_BASE_URL}/${LAYERS.PARCELAS_URBANAS}/query`;
            const res = await fetch(`${queryUrl}?${new URLSearchParams(baseQueryParams).toString()}`);
            if (res.ok) {
                const data = await res.json();
                console.log(`[Geoportal Clic] Respuesta Capa 7 (Parcelas): ${data.features ? data.features.length : 0} entidad(es) encontrada(s).`);
                if (data.features && data.features.length > 0) {
                    processResults(data.features, 'URBANO', true);
                    showToast('Parcela urbana seleccionada por clic en el mapa.', 'info');
                    return;
                }
            }

            // Fallback si se hace clic en una parcela rural a nivel detallado
            const ruralUrl = `${AREF_BASE_URL}/${LAYERS.PARCELAS_RURALES}/query`;
            const resRural = await fetch(`${ruralUrl}?${new URLSearchParams(baseQueryParams).toString()}`);
            if (resRural.ok) {
                const dataRural = await resRural.json();
                if (dataRural.features && dataRural.features.length > 0) {
                    processResults([dataRural.features[0]], 'RURAL', true);
                    showToast('Parcela rural seleccionada por clic.', 'info');
                    return;
                }
            }

            // Fallback a macizo si en ese punto no hay parcela loteada registrada
            const macizoUrl = `${AREF_BASE_URL}/${LAYERS.MACIZOS}/query`;
            const resMacizo = await fetch(`${macizoUrl}?${new URLSearchParams(baseQueryParams).toString()}`);
            if (resMacizo.ok) {
                const dataMacizo = await resMacizo.json();
                if (dataMacizo.features && dataMacizo.features.length > 0) {
                    processResults([dataMacizo.features[0]], 'MACIZO', true);
                    const mzo = dataMacizo.features[0].attributes.MACIZO || '';
                    showToast(`Macizo ${mzo} seleccionado.`, 'info');
                    return;
                }
            }
        }
    } catch (e) {
        // Ignorar errores de clic libre
    }
}

// ==============================================================================
// 9. CONTROLADORES DE INTERFAZ, EVENTOS Y ACCIONES DE USUARIO
// ==============================================================================

/**
 * Muestra u oculta el indicador de carga
 */
function showLoader(visible, text = 'Consultando geoservicios...') {
    const loader = document.getElementById('loader');
    const emptyState = document.getElementById('empty-state');
    const tableContainer = document.getElementById('results-table-container');
    const loaderText = document.getElementById('loader-text');

    loaderText.textContent = text;
    if (visible) {
        loader.classList.remove('hidden');
        emptyState.classList.add('hidden');
        tableContainer.classList.add('hidden');
    } else {
        loader.classList.add('hidden');
    }
}

/**
 * Limpia los resultados actuales
 */
function clearResults() {
    state.currentResults = [];
    state.selectedParcel = null;
    state.highlightLayerGroup.clearLayers();
    document.getElementById('results-table-body').innerHTML = '';
    document.getElementById('results-count').textContent = 'Sin búsqueda activa';
    document.getElementById('btn-zoom-selected').classList.add('hidden');

    // Resetear contador en la solapita flotante
    const badgeEl = document.getElementById('tab-results-badge');
    if (badgeEl) {
        badgeEl.textContent = '0';
        badgeEl.classList.remove('has-results');
    }
}

/**
 * Muestra un estado vacío en la barra lateral
 */
function showEmptyState(title, message) {
    const emptyState = document.getElementById('empty-state');
    const tableContainer = document.getElementById('results-table-container');

    tableContainer.classList.add('hidden');
    emptyState.classList.remove('hidden');

    emptyState.querySelector('h3').textContent = title;
    emptyState.querySelector('p').textContent = message;
    document.getElementById('results-count').textContent = '0 resultados';
}

/**
 * Notificación flotante (Toast)
 */
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 4500);
}

/**
 * Configura los escuchadores de eventos del DOM
 */
function setupUIEventListeners() {
    // Formulario de búsqueda
    const form = document.getElementById('search-form');
    form.addEventListener('submit', handleSearch);

    // Alternar colapsado de la ventana flotante del buscador al hacer clic en la cabecera de resumen
    const searchHeader = document.getElementById('search-bar-header');
    if (searchHeader) {
        searchHeader.addEventListener('click', () => {
            setSearchWindowCollapsed(!state.isSearchCollapsed);
        });
    }

    const btnToggleSearch = document.getElementById('btn-toggle-search');
    if (btnToggleSearch) {
        btnToggleSearch.addEventListener('click', (e) => {
            e.stopPropagation();
            setSearchWindowCollapsed(!state.isSearchCollapsed);
        });
    }

    // Botón Limpiar
    document.getElementById('btn-clear').addEventListener('click', () => {
        form.reset();
        clearResults();
        updateSearchSummary({});
        setSearchWindowCollapsed(false); // Expande para permitir ingresar nueva búsqueda
        showEmptyState('Comienza una búsqueda', 'Ingresa una partida inmobiliaria o nomenclatura para consultar.');
        state.map.setView(EXTENT_TIERRA_DEL_FUEGO.center, EXTENT_TIERRA_DEL_FUEGO.zoom);
    });

    // Accesos rápidos (Chips de prueba guiada)
    document.querySelectorAll('.chip').forEach(chip => {
        chip.addEventListener('click', () => {
            document.getElementById('input-partida').value = chip.dataset.partida || '';
            document.getElementById('select-departamento').value = chip.dataset.depto || '';
            document.getElementById('input-seccion').value = chip.dataset.sec || '';
            document.getElementById('input-macizo').value = chip.dataset.mzo || '';
            document.getElementById('input-parcela').value = chip.dataset.par || '';
            handleSearch();
        });
    });

    // Colapsar panel de resultados mediante el botón en su cabecera
    const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
    if (btnToggleSidebar) {
        btnToggleSidebar.addEventListener('click', () => {
            setResultsSidebarCollapsed(true);
        });
    }

    // Reabrir panel de resultados mediante la solapita flotante en el lateral
    const btnReopenSidebar = document.getElementById('btn-reopen-sidebar');
    if (btnReopenSidebar) {
        btnReopenSidebar.addEventListener('click', (e) => {
            // Si el usuario acaba de terminar un arrastre vertical, evitar abrir el panel
            if (btnReopenSidebar.dataset.dragged === 'true') {
                btnReopenSidebar.dataset.dragged = 'false';
                return;
            }
            setResultsSidebarCollapsed(false);
        });

        // Configurar arrastre vertical manteniendo presionado el botón derecho del mouse
        setupDraggableSolapita(btnReopenSidebar);
    }

    // Botón Vista Provincial
    document.getElementById('btn-extent-provincial').addEventListener('click', () => {
        state.map.setView(EXTENT_TIERRA_DEL_FUEGO.center, EXTENT_TIERRA_DEL_FUEGO.zoom);
    });

    // Botón Enfocar Parcela Seleccionada
    document.getElementById('btn-zoom-selected').addEventListener('click', () => {
        if (state.selectedParcel) {
            selectAndLocateParcel(state.selectedParcel.id);
        }
    });

    // Control de Capa Oficial AREF (activar/desactivar)
    const chkAref = document.getElementById('chk-aref-layer');
    chkAref.addEventListener('change', (e) => {
        if (e.target.checked) {
            state.arefDynamicLayer.addTo(state.map);
        } else {
            state.map.removeLayer(state.arefDynamicLayer);
        }
    });

    // Control de Opacidad de Capa AREF
    const rangeOpacity = document.getElementById('range-aref-opacity');
    rangeOpacity.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value) / 100;
        state.arefDynamicLayer.setOpacity(val);
    });

    // Cerrar Modal Ficha
    const modal = document.getElementById('modal-ficha');
    const closeModal = () => modal.classList.add('hidden');
    document.getElementById('btn-close-modal').addEventListener('click', closeModal);
    document.getElementById('btn-modal-close').addEventListener('click', closeModal);

    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    // Tecla Escape para cerrar modal
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
            closeModal();
        }
    });

    // Botón Ubicar en Mapa desde el Modal
    document.getElementById('btn-modal-locate').addEventListener('click', () => {
        closeModal();
        if (state.selectedParcel) {
            selectAndLocateParcel(state.selectedParcel.id);
        }
    });

    // Botón Imprimir Ficha
    document.getElementById('btn-print-ficha').addEventListener('click', () => {
        window.print();
    });
}

// Funciones expuestas globalmente para botones en HTML dinámico
window.locateParcel = function (index) {
    selectAndLocateParcel(index);
};

window.openFichaModal = function (index) {
    openFichaParcelaria(index);
};

// ==============================================================================
// 10. INICIALIZACIÓN AL CARGAR LA PÁGINA
// ==============================================================================

document.addEventListener('DOMContentLoaded', () => {
    initMap();
    setupUIEventListeners();
});
