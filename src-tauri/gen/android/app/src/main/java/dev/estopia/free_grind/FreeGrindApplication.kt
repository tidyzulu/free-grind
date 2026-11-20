package dev.estopia.free_grind

import android.app.Application
import android.os.Build
import java.io.File

class FreeGrindApplication : Application() {
    // The ":recaptcha" process reports Grindr's package name (see
    // GrindrNative); every other process keeps ours.
    private val packageNameOverride by lazy { GrindrNative.packageNameFor(currentProcessName()) }

    override fun getPackageName(): String = packageNameOverride ?: super.getPackageName()

    override fun onCreate() {
        super.onCreate()
        // Pushes belong to the main process only, not to ":recaptcha" or
        // ":google_oauth" (GoogleOAuthActivity).
        if (currentProcessName() != applicationInfo.processName) return
        PushFirebase.initialize(this)
    }

    private fun currentProcessName(): String? =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            Application.getProcessName()
        } else {
            try {
                File("/proc/self/cmdline").readText().substringBefore('\u0000').trim()
            } catch (e: Exception) {
                null
            }
        }
}
