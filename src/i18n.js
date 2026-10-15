// -----------------------------------------------------------------------------
// Every text the container produces, in the four languages of the Gladys
// interface. German says "du", Spanish says "usted" (maintainer's choice), the
// vocabulary follows the Gladys front (front/src/config/i18n): "Boost" is
// "Refuerzo" in Spanish, the water heater "Warmwasser" in German.
//
// Gladys tells an integration of type `device` nothing about the user's
// language: the `language` config field picks it (French by default). The
// feature names are frozen when the device is added to Gladys.
// -----------------------------------------------------------------------------

/** Feature names, by role key (≤ 40 characters). */
export const FEATURE_NAMES = {
  en: {
    outdoor_temperature: 'Outdoor temperature',
    supply_temperature: 'Supply line temperature',
    return_temperature: 'Return line temperature',
    hot_water_top_temperature: 'Hot water temperature (top)',
    hot_water_charging_temperature: 'Hot water temperature (charging)',
    indoor_temperature: 'Indoor temperature',
    compressor_frequency: 'Compressor frequency',
    compressor_status: 'Compressor',
    operating_mode: 'Operating mode',
    heating_offset: 'Heating curve offset',
    hot_water_mode: 'Hot water mode',
    hot_water_boost: 'Hot water boost',
    heat_produced_heating: 'Heat produced, heating (kWh)',
    heat_produced_hot_water: 'Heat produced, hot water (kWh)',
    active_alarms: 'Active alarms',
    last_alarm: 'Alarm',
  },
  fr: {
    outdoor_temperature: 'Température extérieure',
    supply_temperature: 'Température de départ',
    return_temperature: 'Température de retour',
    hot_water_top_temperature: 'Température ECS (haut)',
    hot_water_charging_temperature: 'Température ECS (charge)',
    indoor_temperature: 'Température intérieure',
    compressor_frequency: 'Fréquence du compresseur',
    compressor_status: 'Compresseur',
    operating_mode: 'Mode de fonctionnement',
    heating_offset: 'Décalage de la courbe de chauffe',
    hot_water_mode: 'Mode eau chaude',
    hot_water_boost: 'Boost eau chaude',
    heat_produced_heating: 'Chaleur produite, chauffage (kWh)',
    heat_produced_hot_water: 'Chaleur produite, eau chaude (kWh)',
    active_alarms: 'Alarmes actives',
    last_alarm: 'Alarme',
  },
  de: {
    outdoor_temperature: 'Außentemperatur',
    supply_temperature: 'Vorlauftemperatur',
    return_temperature: 'Rücklauftemperatur',
    hot_water_top_temperature: 'Warmwassertemperatur (oben)',
    hot_water_charging_temperature: 'Warmwassertemperatur (Ladung)',
    indoor_temperature: 'Innentemperatur',
    compressor_frequency: 'Verdichterfrequenz',
    compressor_status: 'Verdichter',
    operating_mode: 'Betriebsart',
    heating_offset: 'Heizkurvenverschiebung',
    hot_water_mode: 'Warmwassermodus',
    hot_water_boost: 'Warmwasser-Boost',
    heat_produced_heating: 'Erzeugte Wärme, Heizung (kWh)',
    heat_produced_hot_water: 'Erzeugte Wärme, Warmwasser (kWh)',
    active_alarms: 'Aktive Alarme',
    last_alarm: 'Alarm',
  },
  es: {
    outdoor_temperature: 'Temperatura exterior',
    supply_temperature: 'Temperatura de impulsión',
    return_temperature: 'Temperatura de retorno',
    hot_water_top_temperature: 'Temperatura ACS (arriba)',
    hot_water_charging_temperature: 'Temperatura ACS (carga)',
    indoor_temperature: 'Temperatura interior',
    compressor_frequency: 'Frecuencia del compresor',
    compressor_status: 'Compresor',
    operating_mode: 'Modo de funcionamiento',
    heating_offset: 'Desplazamiento de la curva',
    hot_water_mode: 'Modo de agua caliente',
    hot_water_boost: 'Refuerzo de agua caliente',
    heat_produced_heating: 'Calor producido, calefacción (kWh)',
    heat_produced_hot_water: 'Calor producido, ACS (kWh)',
    active_alarms: 'Alarmas activas',
    last_alarm: 'Alarma',
  },
};

/** Compressor states, by NIBE value (≤ 24 characters). */
export const COMPRESSOR_STATES = {
  en: { 20: 'Off', 40: 'Starting', 60: 'Running', 100: 'Stopping' },
  fr: { 20: 'Arrêté', 40: 'Démarrage', 60: 'En marche', 100: 'Arrêt en cours' },
  de: { 20: 'Aus', 40: 'Startet', 60: 'Läuft', 100: 'Stoppt' },
  es: { 20: 'Apagado', 40: 'Arrancando', 60: 'En marcha', 100: 'Parándose' },
};

/** What the heat pump is working for (NIBE "priority"), by value. */
export const OPERATING_MODES = {
  en: {
    10: 'Off',
    20: 'Hot water',
    30: 'Heating',
    40: 'Pool',
    41: 'Pool 2',
    50: 'Transfer',
    60: 'Cooling',
  },
  fr: {
    10: 'Arrêt',
    20: 'Eau chaude',
    30: 'Chauffage',
    40: 'Piscine',
    41: 'Piscine 2',
    50: 'Transfert',
    60: 'Rafraîchissement',
  },
  de: {
    10: 'Aus',
    20: 'Warmwasser',
    30: 'Heizung',
    40: 'Pool',
    41: 'Pool 2',
    50: 'Umschaltung',
    60: 'Kühlung',
  },
  es: {
    10: 'Apagado',
    20: 'Agua caliente',
    30: 'Calefacción',
    40: 'Piscina',
    41: 'Piscina 2',
    50: 'Transferencia',
    60: 'Refrigeración',
  },
};

/**
 * Option texts myUplink sends in English (hot water mode, boost durations),
 * by lowercased English text. An unknown text is shown as myUplink wrote it.
 */
export const OPTION_TEXTS = {
  en: {
    economy: 'Economy',
    normal: 'Normal',
    luxury: 'Luxury',
    'smart control': 'Smart control',
    small: 'Small',
    medium: 'Medium',
    large: 'Large',
    off: 'Off',
    on: 'On',
    '3 hrs': '3 hours',
    '6 hrs': '6 hours',
    '12 hrs': '12 hours',
    'one time increase': 'One-time increase',
  },
  fr: {
    economy: 'Économie',
    normal: 'Normal',
    luxury: 'Confort',
    'smart control': 'Contrôle intelligent',
    small: 'Faible',
    medium: 'Moyen',
    large: 'Élevé',
    off: 'Arrêt',
    on: 'Marche',
    '3 hrs': '3 heures',
    '6 hrs': '6 heures',
    '12 hrs': '12 heures',
    'one time increase': 'Hausse ponctuelle',
  },
  de: {
    economy: 'Sparbetrieb',
    normal: 'Normal',
    luxury: 'Komfort',
    'smart control': 'Smart Control',
    small: 'Gering',
    medium: 'Mittel',
    large: 'Hoch',
    off: 'Aus',
    on: 'Ein',
    '3 hrs': '3 Stunden',
    '6 hrs': '6 Stunden',
    '12 hrs': '12 Stunden',
    'one time increase': 'Einmalige Erhöhung',
  },
  es: {
    economy: 'Económico',
    normal: 'Normal',
    luxury: 'Confort',
    'smart control': 'Control inteligente',
    small: 'Bajo',
    medium: 'Medio',
    large: 'Alto',
    off: 'Apagado',
    on: 'Encendido',
    '3 hrs': '3 horas',
    '6 hrs': '6 horas',
    '12 hrs': '12 horas',
    'one time increase': 'Aumento puntual',
  },
};

/** Short texts: feature values, widget labels (≤ 24 characters). */
export const TEXT = {
  noAlarm: { en: 'No alarm', fr: 'Aucune alarme', de: 'Kein Alarm', es: 'Sin alarma' },
  unknown: { en: 'Unknown', fr: 'Inconnu', de: 'Unbekannt', es: 'Desconocido' },
  heating: { en: 'Heating', fr: 'Chauffage', de: 'Heizung', es: 'Calefacción' },
  hotWater: { en: 'Hot water', fr: 'Eau chaude', de: 'Warmwasser', es: 'Agua caliente' },
  outdoor: { en: 'Outdoor', fr: 'Extérieur', de: 'Außen', es: 'Exterior' },
  indoor: { en: 'Indoor', fr: 'Intérieur', de: 'Innen', es: 'Interior' },
  supply: { en: 'Supply line', fr: 'Départ', de: 'Vorlauf', es: 'Impulsión' },
  mode: { en: 'Mode', fr: 'Mode', de: 'Betriebsart', es: 'Modo' },
  compressor: { en: 'Compressor', fr: 'Compresseur', de: 'Verdichter', es: 'Compresor' },
  offset: {
    en: 'Curve offset',
    fr: 'Décalage courbe',
    de: 'Kurvenverschiebung',
    es: 'Desplaz. curva',
  },
  hotWaterMode: { en: 'Hot water mode', fr: 'Mode ECS', de: 'Warmwassermodus', es: 'Modo ACS' },
  boost: { en: 'Boost', fr: 'Boost', de: 'Boost', es: 'Refuerzo' },
  boostOn: {
    en: 'Start boost',
    fr: 'Lancer le boost',
    de: 'Boost starten',
    es: 'Iniciar refuerzo',
  },
  boostOff: {
    en: 'Cancel boost',
    fr: 'Annuler le boost',
    de: 'Boost abbrechen',
    es: 'Cancelar refuerzo',
  },
  active: { en: 'On', fr: 'Actif', de: 'Ein', es: 'Activado' },
  inactive: { en: 'Off', fr: 'Inactif', de: 'Aus', es: 'Desactivado' },
  alarms: { en: 'Alarms', fr: 'Alarmes', de: 'Alarme', es: 'Alarmas' },
  connection: { en: 'myUplink', fr: 'myUplink', de: 'myUplink', es: 'myUplink' },
  online: { en: 'Connected', fr: 'Connectée', de: 'Verbunden', es: 'Conectada' },
  offline: { en: 'Disconnected', fr: 'Déconnectée', de: 'Getrennt', es: 'Desconectada' },
  offsetDown: { en: 'Offset −1', fr: 'Décalage −1', de: 'Verschiebung −1', es: 'Desplaz. −1' },
  offsetUp: { en: 'Offset +1', fr: 'Décalage +1', de: 'Verschiebung +1', es: 'Desplaz. +1' },
};

/** Sentences: connection status, errors, action results (≤ 200 characters). */
export const MESSAGES = {
  notConfigured: {
    en: 'Enter the client ID and secret of your myUplink application (see the documentation).',
    fr: "Saisissez l'identifiant et le secret de votre application myUplink (voir la documentation).",
    de: 'Gib die Client-ID und das Secret deiner myUplink-Anwendung ein (siehe Dokumentation).',
    es: 'Introduzca el ID de cliente y el secreto de su aplicación myUplink (consulte la documentación).',
  },
  credentials: {
    en: 'myUplink refused the client ID or secret: check them on dev.myuplink.com.',
    fr: "myUplink refuse l'identifiant ou le secret : vérifiez-les sur dev.myuplink.com.",
    de: 'myUplink lehnt Client-ID oder Secret ab: prüfe sie auf dev.myuplink.com.',
    es: 'myUplink rechaza el ID de cliente o el secreto: compruébelos en dev.myuplink.com.',
  },
  unreachable: {
    en: 'myUplink does not answer for now, the integration keeps trying.',
    fr: "myUplink ne répond pas pour l'instant, l'intégration réessaie.",
    de: 'myUplink antwortet gerade nicht, die Integration versucht es weiter.',
    es: 'myUplink no responde por ahora, la integración sigue intentándolo.',
  },
  rateLimited: {
    en: 'myUplink quota reached: the integration waits before asking again.',
    fr: "Quota myUplink atteint : l'intégration attend avant de redemander.",
    de: 'myUplink-Kontingent erreicht: die Integration wartet, bevor sie erneut fragt.',
    es: 'Cuota de myUplink alcanzada: la integración espera antes de volver a preguntar.',
  },
  noSystem: {
    en: 'No heat pump on this myUplink account: the application must belong to the account of the heat pump.',
    fr: "Aucune pompe à chaleur sur ce compte myUplink : l'application doit appartenir au compte de la PAC.",
    de: 'Keine Wärmepumpe in diesem myUplink-Konto: die Anwendung muss zum Konto der Wärmepumpe gehören.',
    es: 'Ninguna bomba de calor en esta cuenta myUplink: la aplicación debe pertenecer a la cuenta de la bomba.',
  },
  initFailed: {
    en: 'The integration could not start, see its logs.',
    fr: "L'intégration n'a pas pu démarrer, voir ses journaux.",
    de: 'Die Integration konnte nicht starten, siehe ihre Protokolle.',
    es: 'La integración no pudo iniciarse, consulte sus registros.',
  },
  premiumRequired: {
    en: 'Changing a setting requires the myUplink "Premium Manage" subscription for this heat pump.',
    fr: "Modifier un réglage exige l'abonnement myUplink « Premium Manage » pour cette pompe à chaleur.",
    de: 'Eine Einstellung zu ändern erfordert das myUplink-Abo „Premium Manage“ für diese Wärmepumpe.',
    es: 'Cambiar un ajuste requiere la suscripción myUplink «Premium Manage» para esta bomba de calor.',
  },
  writeScopeMissing: {
    en: 'Your myUplink application has no write access (WRITESYSTEM): settings cannot be changed.',
    fr: "Votre application myUplink n'a pas l'accès en écriture (WRITESYSTEM) : réglages impossibles.",
    de: 'Deine myUplink-Anwendung hat keinen Schreibzugriff (WRITESYSTEM): keine Einstellungen möglich.',
    es: 'Su aplicación myUplink no tiene acceso de escritura (WRITESYSTEM): no se pueden cambiar ajustes.',
  },
  readOnly: {
    en: 'myUplink does not allow changing this setting on this heat pump.',
    fr: 'myUplink ne permet pas de modifier ce réglage sur cette pompe à chaleur.',
    de: 'myUplink erlaubt nicht, diese Einstellung an dieser Wärmepumpe zu ändern.',
    es: 'myUplink no permite cambiar este ajuste en esta bomba de calor.',
  },
  invalidValue: {
    en: 'This value is not one the heat pump accepts.',
    fr: "Cette valeur n'est pas acceptée par la pompe à chaleur.",
    de: 'Diesen Wert akzeptiert die Wärmepumpe nicht.',
    es: 'La bomba de calor no acepta este valor.',
  },
  deviceOffline: {
    en: 'The heat pump is not connected to myUplink right now.',
    fr: "La pompe à chaleur n'est pas connectée à myUplink en ce moment.",
    de: 'Die Wärmepumpe ist gerade nicht mit myUplink verbunden.',
    es: 'La bomba de calor no está conectada a myUplink en este momento.',
  },
  unknownDevice: {
    en: 'This heat pump is no longer on the myUplink account.',
    fr: "Cette pompe à chaleur n'est plus sur le compte myUplink.",
    de: 'Diese Wärmepumpe ist nicht mehr im myUplink-Konto.',
    es: 'Esta bomba de calor ya no está en la cuenta myUplink.',
  },
  writeFailed: {
    en: 'myUplink refused the change, try again later.',
    fr: 'myUplink a refusé la modification, réessayez plus tard.',
    de: 'myUplink hat die Änderung abgelehnt, versuche es später erneut.',
    es: 'myUplink rechazó el cambio, inténtelo más tarde.',
  },
  pickDevice: {
    en: 'Choose a heat pump in the widget settings.',
    fr: 'Choisissez une pompe à chaleur dans les réglages du widget.',
    de: 'Wähle eine Wärmepumpe in den Einstellungen des Widgets.',
    es: 'Elija una bomba de calor en los ajustes del widget.',
  },
  widgetNotReady: {
    en: 'No data from this heat pump yet: the first reading comes within a few minutes.',
    fr: 'Pas encore de données de cette pompe à chaleur : la première lecture arrive sous quelques minutes.',
    de: 'Noch keine Daten dieser Wärmepumpe: die erste Abfrage kommt in wenigen Minuten.',
    es: 'Aún no hay datos de esta bomba de calor: la primera lectura llega en pocos minutos.',
  },
  boostStarted: {
    en: 'Hot water boost started.',
    fr: 'Boost eau chaude lancé.',
    de: 'Warmwasser-Boost gestartet.',
    es: 'Refuerzo de agua caliente iniciado.',
  },
  boostStopped: {
    en: 'Hot water boost cancelled.',
    fr: 'Boost eau chaude annulé.',
    de: 'Warmwasser-Boost abgebrochen.',
    es: 'Refuerzo de agua caliente cancelado.',
  },
  offsetLimit: {
    en: 'The heating curve offset is already at its limit.',
    fr: 'Le décalage de la courbe de chauffe est déjà à sa limite.',
    de: 'Die Heizkurvenverschiebung ist schon am Anschlag.',
    es: 'El desplazamiento de la curva ya está en su límite.',
  },
};

/** Sentences with values, built at runtime (≤ 200 characters once filled). */
export const TEMPLATES = {
  offsetSet: {
    en: (value) => `Heating curve offset set to ${value}.`,
    fr: (value) => `Décalage de la courbe de chauffe réglé sur ${value}.`,
    de: (value) => `Heizkurvenverschiebung auf ${value} gesetzt.`,
    es: (value) => `Desplazamiento de la curva ajustado a ${value}.`,
  },
  connectionOk: {
    en: (pumps, premium) =>
      `Connection OK: ${pumps} heat pump(s) found. Premium Manage subscription: ${premium}.`,
    fr: (pumps, premium) =>
      `Connexion réussie : ${pumps} pompe(s) à chaleur trouvée(s). Abonnement Premium Manage : ${premium}.`,
    de: (pumps, premium) =>
      `Verbindung OK: ${pumps} Wärmepumpe(n) gefunden. Abo Premium Manage: ${premium}.`,
    es: (pumps, premium) =>
      `Conexión correcta: ${pumps} bomba(s) de calor encontrada(s). Suscripción Premium Manage: ${premium}.`,
  },
  premiumState: {
    en: (state) => ({ yes: 'yes', no: 'no', unknown: 'unknown' })[state],
    fr: (state) => ({ yes: 'oui', no: 'non', unknown: 'inconnu' })[state],
    de: (state) => ({ yes: 'ja', no: 'nein', unknown: 'unbekannt' })[state],
    es: (state) => ({ yes: 'sí', no: 'no', unknown: 'desconocido' })[state],
  },
  unknownValue: {
    en: (value) => `Unknown (${value})`,
    fr: (value) => `Inconnu (${value})`,
    de: (value) => `Unbekannt (${value})`,
    es: (value) => `Desconocido (${value})`,
  },
};

/** One language of a multi-language object, English as the fallback. */
export const pick = (texts, language) => texts[language] ?? texts.en;
