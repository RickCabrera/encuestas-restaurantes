package mx.sitirt.encuestas.tablet

import android.app.admin.DeviceAdminReceiver

/** Componente que Android exige para registrar la app como "device owner" (ver docs/TABLET-APK.md). */
class AdminReceiver : DeviceAdminReceiver()
