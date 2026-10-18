// Plugin de configuración de Android: deja que la app reciba comprobantes compartidos (imagen o PDF)
// de otras apps, sin abrir una pantalla nueva cada vez (singleTask).
const { AndroidConfig, withAndroidManifest } = require('expo/config-plugins');

const ACCION = 'android.intent.action.SEND';
const TIPOS = ['image/*', 'application/pdf'];

/** Un intent-filter que acepta compartir un tipo de archivo. */
function filtroDeCompartido(mimeType) {
  return {
    action: [{ $: { 'android:name': ACCION } }],
    category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }],
    data: [{ $: { 'android:mimeType': mimeType } }],
  };
}

/** Si la actividad ya tiene un filtro de compartir para ese tipo, no lo repetimos. */
function yaTiene(mainActivity, mimeType) {
  return (mainActivity['intent-filter'] ?? []).some(
    (filtro) =>
      (filtro.action ?? []).some((a) => a.$['android:name'] === ACCION) &&
      (filtro.data ?? []).some((d) => d.$['android:mimeType'] === mimeType),
  );
}

function withCompartido(config) {
  return withAndroidManifest(config, (config) => {
    const mainActivity = AndroidConfig.Manifest.getMainActivityOrThrow(config.modResults);
    mainActivity.$['android:launchMode'] = 'singleTask';
    mainActivity['intent-filter'] = mainActivity['intent-filter'] ?? [];
    for (const mimeType of TIPOS) {
      if (!yaTiene(mainActivity, mimeType)) mainActivity['intent-filter'].push(filtroDeCompartido(mimeType));
    }
    return config;
  });
}

module.exports = withCompartido;
