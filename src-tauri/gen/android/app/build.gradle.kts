import java.net.URI
import java.net.URLEncoder
import java.util.Properties
import javax.inject.Inject

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("rust")
}

/**
 * Copies the Free Grind Google OAuth WebExtension (src-tauri/vendor) into the
 * APK's assets as `grindr-google-oauth/`, laid out as GeckoView loads a
 * built-in extension (see GoogleOAuthActivity.kt).
 */
abstract class BundleWebExtension : DefaultTask() {
    @get:InputDirectory
    @get:PathSensitive(PathSensitivity.RELATIVE)
    abstract val source: DirectoryProperty

    @get:OutputDirectory
    abstract val outputDir: DirectoryProperty

    @get:Inject
    abstract val fs: FileSystemOperations

    @TaskAction
    fun bundle() {
        val dest = outputDir.get().dir("grindr-google-oauth").asFile
        fs.delete { delete(outputDir) }
        fs.copy {
            from(source.dir("shared")) { into("shared") }
            from(source.dir("icons")) { into("icons") }
            from(source.file("geckoview/manifest.json"))
            into(dest)
        }
    }
}

/**
 * Generates res/xml/locales_config.xml (the manifest's android:localeConfig)
 * from the frontend's public/locales/<tag>/ folders (BCP 47 tags such as
 * de-DE, pt-BR), so Android 13+'s "App languages" settings page offers the
 * languages the app ships (see AppLocale.kt).
 */
abstract class GenerateLocaleConfig : DefaultTask() {
    @get:InputDirectory
    @get:PathSensitive(PathSensitivity.RELATIVE)
    abstract val localesDir: DirectoryProperty

    @get:OutputDirectory
    abstract val outputDir: DirectoryProperty

    @TaskAction
    fun generate() {
        val tags = localesDir.get().asFile
            .listFiles { f -> f.isDirectory && f.resolve("translation.json").isFile }
            .orEmpty()
            .map { it.name }
            .sorted()
        val xml = buildString {
            append("<?xml version=\"1.0\" encoding=\"utf-8\"?>\n")
            append("<locale-config xmlns:android=\"http://schemas.android.com/apk/res/android\">\n")
            tags.forEach { append("    <locale android:name=\"").append(it).append("\" />\n") }
            append("</locale-config>\n")
        }
        val out = outputDir.get().dir("xml").file("locales_config.xml").asFile
        outputDir.get().asFile.deleteRecursively()
        out.parentFile.mkdirs()
        out.writeText(xml)
    }
}

val tauriProperties = Properties().apply {
    val propFile = file("tauri.properties")
    if (propFile.exists()) {
        propFile.inputStream().use { load(it) }
    }
}

/**
 * The app manifest (manifest/app.json): it sets the application ID, and
 * manifest/android/res adds the launcher icons and name.
 */
val repoRoot = file("../../../..")
val manifestDir = repoRoot.resolve("manifest")
@Suppress("UNCHECKED_CAST")
val appManifest = groovy.json.JsonSlurper().parse(manifestDir.resolve("app.json")) as Map<String, Any?>
@Suppress("UNCHECKED_CAST")
val appApplicationId = (appManifest["android"] as Map<String, Any?>)["applicationId"] as String
val appSlug = appManifest["appSlug"] as String
// Repository web URL, GitLab (also self-hosted) or GitHub, see scripts/manifest.mjs.
val appRepoUrl = (appManifest["repository"] as String).trimEnd('/')
val appRepoHost = URI(appRepoUrl).host
val appRepoPath = URI(appRepoUrl).path.trim('/')
// APKs the in-app updater may install: the app's own download location
// (manifest updates.downloadUrl), else where its repository's release CI puts
// them (GitLab: the project's generic package registry; GitHub: releases).
@Suppress("UNCHECKED_CAST")
val appDownloadUrl = ((appManifest["updates"] as Map<String, Any?>?)?.get("downloadUrl") as String?)
    ?: if (appRepoHost == "github.com") {
        "https://github.com/$appRepoPath/releases/download/"
    } else {
        "https://$appRepoHost/api/v4/projects/${URLEncoder.encode(appRepoPath, "UTF-8")}/packages/generic/"
    }

// Without the keystore (ci/build/android.sh) the release APK comes out
// unsigned; CI signs it once two independent builds produced the same bytes.
// Local release builds: src-tauri/certs/<appSlug>-dev.jks, or FG_KEYSTORE_*.
val releaseKeystore = System.getenv("FG_KEYSTORE_PATH")?.takeIf { it.isNotBlank() }?.let { file(it) }
    ?: repoRoot.resolve("src-tauri/certs/$appSlug-dev.jks")
fun signingEnv(name: String) = System.getenv(name)?.takeIf { it.isNotEmpty() } ?: "opengrind"

android {
    // Keep in sync with ci/build/Dockerfile. Left unset, AGP picks (and
    // downloads) its own default versions.
    compileSdk = 36
    buildToolsVersion = "36.0.0"
    ndkVersion = "29.0.14206865"
    namespace = "dev.estopia.free_grind"
    defaultConfig {
        manifestPlaceholders["usesCleartextTraffic"] = "false"
        applicationId = appApplicationId
        // ApkUpdater only installs APKs downloaded from this repository's releases.
        buildConfigField("String", "RELEASES_DOWNLOAD_URL", "\"$appDownloadUrl\"")
        // GeckoView (Google sign-in, see GoogleOAuthActivity.kt) needs Android 8.0.
        minSdk = 26
        targetSdk = 36
        versionCode = tauriProperties.getProperty("tauri.android.versionCode", "1").toInt()
        versionName = tauriProperties.getProperty("tauri.android.versionName", "1.0")
    }
    signingConfigs {
        create("release") {
            storeFile = releaseKeystore
            storePassword = signingEnv("FG_KEYSTORE_PASSWORD")
            keyAlias = signingEnv("FG_KEY_ALIAS")
            keyPassword = signingEnv("FG_KEY_PASSWORD")
        }
    }
    sourceSets.getByName("main") {
        res.srcDir(manifestDir.resolve("android/res"))
    }
    buildTypes {
        getByName("debug") {
            manifestPlaceholders["usesCleartextTraffic"] = "true"
            isDebuggable = true
            isJniDebuggable = true
            isMinifyEnabled = false
            packaging {                jniLibs.keepDebugSymbols.add("*/arm64-v8a/*.so")
                jniLibs.keepDebugSymbols.add("*/armeabi-v7a/*.so")
                jniLibs.keepDebugSymbols.add("*/x86/*.so")
                jniLibs.keepDebugSymbols.add("*/x86_64/*.so")
            }
        }
        getByName("release") {
            if (releaseKeystore.exists()) {
                signingConfig = signingConfigs.getByName("release")
            }
            isMinifyEnabled = false
            proguardFiles(
                *fileTree(".") { include("**/*.pro") }
                    .plus(getDefaultProguardFile("proguard-android-optimize.txt"))
                    .toList().toTypedArray()
            )
        }
    }
    kotlinOptions {
        jvmTarget = "1.8"
        // The reCAPTCHA SDK and GeckoView's kotlin-stdlib carry Kotlin 2.3
        // metadata, which this Kotlin 1.9 compiler refuses otherwise — for
        // every module on the classpath, used or not. Upgrading Kotlin instead
        // would also hit the Tauri plugin modules (this kotlinOptions DSL).
        freeCompilerArgs += "-Xskip-metadata-version-check"
    }
    buildFeatures {
        buildConfig = true
    }
    // Compressed native libs: GeckoView's libxul.so is ~145 MB raw but ~60 MB
    // compressed per ABI, and the APK is downloaded for every self-update.
    packaging {
        jniLibs {
            useLegacyPackaging = true
        }
    }
    // Google's encrypted dependency report differs on every build.
    dependenciesInfo {
        includeInApk = false
        includeInBundle = false
    }
}

// Reproducibility: the merged baseline profile (assets/dexopt/baseline.prof[m])
// and kotlin-tooling-metadata.json differ between otherwise identical builds.
tasks.whenTaskAdded {
    if (name.contains("ArtProfile") || name == "buildKotlinToolingMetadata") {
        enabled = false
    }
}

androidComponents {
    onVariants { variant ->
        val bundleTask = tasks.register<BundleWebExtension>(
            "bundle${variant.name.replaceFirstChar { it.uppercase() }}WebExtension"
        ) {
            source.set(file("../../../vendor/freegrind-google-oauth-webextension"))
        }
        variant.sources.assets?.addGeneratedSourceDirectory(bundleTask, BundleWebExtension::outputDir)

        val localeConfigTask = tasks.register<GenerateLocaleConfig>(
            "generate${variant.name.replaceFirstChar { it.uppercase() }}LocaleConfig"
        ) {
            localesDir.set(file("../../../../public/locales"))
        }
        variant.sources.res?.addGeneratedSourceDirectory(localeConfigTask, GenerateLocaleConfig::outputDir)
    }
}


rust {
    rootDirRel = "../../../"
}

dependencies {
    implementation("androidx.webkit:webkit:1.14.0")
    implementation("androidx.appcompat:appcompat:1.7.1")
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("androidx.core:core-splashscreen:1.0.1")
    implementation("com.google.android.material:material:1.12.0")
    implementation("com.google.firebase:firebase-messaging-ktx:24.1.2")
    // Native parts that pose as Grindr (spoofed Firebase, reCAPTCHA minting).
    implementation(project(":grindr"))
    // Google sign-in, see GoogleOAuthActivity.kt. ~85 MB of the APK; releases
    // ship arm64-v8a only (see release.yml).
    implementation("org.mozilla.geckoview:geckoview:152.0.20260629141727")
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.1.4")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.5.0")
}

apply(from = "tauri.build.gradle.kts")