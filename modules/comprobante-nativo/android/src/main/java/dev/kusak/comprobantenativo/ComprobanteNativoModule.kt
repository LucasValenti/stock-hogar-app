package dev.kusak.comprobantenativo

import android.content.Intent
import android.net.Uri
import android.os.Build
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.text.PDFTextStripper
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

/**
 * Lee el texto de un PDF de comprobante y recibe comprobantes compartidos desde otras apps.
 * Todo pasa en el dispositivo: nada se manda afuera.
 */
class ComprobanteNativoModule : Module() {
  private var pdfListo = false

  // El intent que llegó con la app abierta (onNewIntent), a la espera de que JS lo tome.
  private var intentNuevo: Intent? = null

  // El intent de arranque se mira una sola vez: el que estaba al abrir la app.
  private var intentInicialLeido = false

  override fun definition() = ModuleDefinition {
    Name("ComprobanteNativo")

    Events("onCompartido")

    AsyncFunction("textoDePdf") { uri: String ->
      val contexto = appContext.reactContext ?: throw IllegalStateException("No hay contexto de la app.")
      if (!pdfListo) {
        PDFBoxResourceLoader.init(contexto)
        pdfListo = true
      }
      // `contentResolver` abre tanto `content://` como `file://`.
      val entrada = contexto.contentResolver.openInputStream(Uri.parse(uri))
        ?: throw IllegalArgumentException("No pudimos abrir el comprobante.")
      entrada.use { flujo ->
        PDDocument.load(flujo).use { documento ->
          PDFTextStripper().apply { sortByPosition = true }.getText(documento)
        }
      }
    }

    // Devuelve el comprobante compartido una sola vez: después queda en null hasta el próximo.
    Function("tomarCompartido") {
      val contexto = appContext.reactContext
      if (contexto == null) return@Function null
      val intent = intentParaTomar()
      if (intent == null || intent.action != Intent.ACTION_SEND) return@Function null
      val origen = uriCompartida(intent) ?: return@Function null
      val tipo = intent.type ?: contexto.contentResolver.getType(origen) ?: ""
      if (!tipo.startsWith("image/") && tipo != "application/pdf") return@Function null
      val copia = File(contexto.cacheDir, "compartido-${System.currentTimeMillis()}.${extensionDe(tipo)}")
      val flujoOrigen = contexto.contentResolver.openInputStream(origen) ?: return@Function null
      flujoOrigen.use { entrada ->
        copia.outputStream().use { salida -> entrada.copyTo(salida) }
      }
      mapOf(
        "uri" to "file://${copia.absolutePath}",
        "tipo" to tipo,
        "bytes" to copia.length().toDouble(),
      )
    }

    OnNewIntent { intent ->
      intentNuevo = intent
      sendEvent("onCompartido", mapOf<String, Any>())
    }
  }

  private fun intentParaTomar(): Intent? {
    intentNuevo?.let { pendiente ->
      intentNuevo = null
      return pendiente
    }
    if (intentInicialLeido) return null
    intentInicialLeido = true
    return appContext.currentActivity?.intent
  }

  private fun uriCompartida(intent: Intent): Uri? {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
    } else {
      @Suppress("DEPRECATION")
      intent.getParcelableExtra(Intent.EXTRA_STREAM) as? Uri
    }
  }

  private fun extensionDe(tipo: String): String = when (tipo) {
    "application/pdf" -> "pdf"
    "image/png" -> "png"
    else -> "jpg"
  }
}
