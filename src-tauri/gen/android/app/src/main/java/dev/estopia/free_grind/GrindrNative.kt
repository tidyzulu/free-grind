package dev.estopia.free_grind

import android.content.Context
import android.content.Intent

/**
 * Native parts in module :grindr: push through Grindr's Firebase project and
 * reCAPTCHA minting.
 */
object GrindrNative {
    /**
     * The package name a process reports. The ":recaptcha" process poses as
     * Grindr towards the reCAPTCHA SDK, which keys its tokens to it; null
     * keeps the app's own.
     */
    fun packageNameFor(processName: String?): String? =
        if (processName?.endsWith(RecaptchaMintActivity.PROCESS_SUFFIX) == true) RecaptchaMintActivity.GRINDR_PACKAGE else null

    /** Sets up the default FirebaseApp (Grindr's project); returns whether there is one. */
    fun initializeDefaultFirebase(context: Context): Boolean = GrindrPush.initializeDefaultApp(context)

    /** Starts a reCAPTCHA token for [action] (see RecaptchaMintActivity), or null where there's no minting. */
    fun recaptchaIntent(context: Context, action: String): Intent? =
        Intent(context, RecaptchaMintActivity::class.java).putExtra(RecaptchaMintActivity.EXTRA_ACTION, action)

    /** Token, refusal marker and detail from RecaptchaMintActivity's result. */
    fun recaptchaResult(data: Intent?): Triple<String?, String?, String?> = Triple(
        data?.getStringExtra(RecaptchaMintActivity.EXTRA_TOKEN),
        data?.getStringExtra(RecaptchaMintActivity.EXTRA_ERROR),
        data?.getStringExtra(RecaptchaMintActivity.EXTRA_ERROR_DETAIL),
    )
}
