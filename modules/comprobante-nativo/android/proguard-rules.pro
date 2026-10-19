# PdfBox nombra un decodificador de JPEG 2000 opcional que no se incluye: R8 no tiene que reclamarlo.
-dontwarn com.gemalto.jp2.**
# PdfBox carga partes por nombre (filtros, fuentes): que R8 no las borre ni las renombre al achicar el APK.
-keep class com.tom_roush.pdfbox.** { *; }
-keep class com.tom_roush.fontbox.** { *; }
-keep class com.tom_roush.harmony.** { *; }
