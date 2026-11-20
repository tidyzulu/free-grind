/**
 * Native parts that pose as Grindr: push through Grindr's own Firebase
 * project behind a spoofed package identity (SpoofedContext.kt) and reCAPTCHA
 * minting posing as the Grindr app (RecaptchaMintActivity.kt), with Grindr's
 * credentials and the proprietary reCAPTCHA SDK. The app reaches it through
 * GrindrNative.
 */
plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "dev.estopia.free_grind.grindr"
    // Keep in sync with app/build.gradle.kts.
    compileSdk = 36
    buildToolsVersion = "36.0.0"
    defaultConfig {
        minSdk = 26
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }
    kotlinOptions {
        jvmTarget = "1.8"
        // Same as the app: the reCAPTCHA SDK carries newer Kotlin metadata.
        freeCompilerArgs += "-Xskip-metadata-version-check"
    }
}

dependencies {
    implementation("androidx.annotation:annotation:1.9.1")
    implementation("com.google.firebase:firebase-messaging-ktx:24.1.2")
    // Proprietary, see RecaptchaMint.java.
    implementation("com.google.android.recaptcha:recaptcha:18.9.2")
}
