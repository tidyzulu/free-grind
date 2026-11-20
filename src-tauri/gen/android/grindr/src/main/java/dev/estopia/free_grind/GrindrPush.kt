package dev.estopia.free_grind

import android.content.Context
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import dev.estopia.free_grind.grindr.R

/**
 * Grindr's own Firebase project as the default FirebaseApp, registered under
 * a spoofed package identity (SpoofedContext), so Grindr's push servers reach
 * this app.
 */
object GrindrPush {
    /** Returns whether the default app is set up. */
    fun initializeDefaultApp(context: Context): Boolean {
        val spoofed = SpoofedContext(context.applicationContext)
        val options = FirebaseOptions.Builder()
            .setApplicationId(context.getString(R.string.fcm_google_app_id))
            .setProjectId(context.getString(R.string.fcm_project_id))
            .setApiKey(context.getString(R.string.fcm_google_api_key))
            .setGcmSenderId(context.getString(R.string.fcm_gcm_defaultSenderId))
            .build()
        if (FirebaseApp.getApps(spoofed).isEmpty()) {
            FirebaseApp.initializeApp(spoofed, options)
        }
        return true
    }
}
