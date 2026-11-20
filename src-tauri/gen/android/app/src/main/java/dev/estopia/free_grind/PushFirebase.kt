package dev.estopia.free_grind

import android.content.Context
import android.util.Log
import com.google.firebase.messaging.FirebaseMessaging

/**
 * Owns the Firebase setup for push. Initialized from FreeGrindApplication so
 * it's ready whenever the process starts — including when a push wakes a
 * killed app and MainActivity never runs.
 */
object PushFirebase {
    private const val TAG = "FCM"

    @Volatile
    private var initialized = false

    @Synchronized
    fun initialize(context: Context) {
        if (initialized) return
        try {
            // The default FirebaseApp: Grindr's project (GrindrNative).
            initialized = GrindrNative.initializeDefaultFirebase(context)
            Log.d(TAG, if (initialized) "Default Firebase app initialized" else "No default Firebase app")
        } catch (t: Throwable) {
            Log.e(TAG, "Firebase initialization failed; continuing without push", t)
        }
    }

    fun token(onToken: (String) -> Unit) {
        if (!initialized) {
            Log.w(TAG, "Firebase not initialized; no push token")
            return
        }
        try {
            FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
                if (task.isSuccessful) {
                    onToken(task.result)
                } else {
                    Log.w(TAG, "Failed to get push token", task.exception)
                }
            }
        } catch (t: Throwable) {
            Log.e(TAG, "Firebase Messaging unavailable; continuing without push token", t)
        }
    }
}