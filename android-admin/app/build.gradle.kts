plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// El workflow de GitHub Actions pasa la versión y la firma por variables de entorno.
// Sin ellas (compilación local) sale un release sin firmar; para probar usa assembleDebug.
val keystoreFile: String? = System.getenv("ANDROID_KEYSTORE_FILE")?.takeIf { it.isNotBlank() }

// Servidor que abre la app. Se puede cambiar al compilar (p. ej. para un entorno de pruebas).
val serverUrl: String = System.getenv("ADMIN_SERVER_URL")?.takeIf { it.isNotBlank() } ?: "https://cuentanos.com.mx"

android {
    namespace = "mx.sitirt.encuestas.admin"
    compileSdk = 36

    defaultConfig {
        applicationId = "mx.sitirt.encuestas.admin"
        minSdk = 26
        // Google Play exige API 36 (Android 16) para apps nuevas y actualizaciones desde el 31/08/2026.
        targetSdk = 36
        versionCode = System.getenv("VERSION_CODE")?.toIntOrNull() ?: 1
        versionName = System.getenv("VERSION_NAME")?.takeIf { it.isNotBlank() } ?: "1.0.0"
        buildConfigField("String", "SERVER_URL", "\"${serverUrl.trimEnd('/')}\"")
    }

    signingConfigs {
        if (keystoreFile != null) {
            create("release") {
                storeFile = file(keystoreFile)
                storePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("ANDROID_KEY_ALIAS")
                keyPassword = System.getenv("ANDROID_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.findByName("release")
        }
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}

// La app no usa bibliotecas: solo las pruebas.
dependencies {
    testImplementation("junit:junit:4.13.2")
}
