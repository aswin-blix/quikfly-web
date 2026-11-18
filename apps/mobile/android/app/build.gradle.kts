import java.util.Properties

plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

android {
    namespace = "com.quikfly.app"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        // Fixed for good once the app is on the Play Store (decision 2026-11-17).
        applicationId = "com.quikfly.app"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        // Uses the version code from pubspec.yaml. When using split APKs, 1000 * ABI_VERSION
        // is added automatically by Flutter. (https://developer.android.com/studio/build/configure-apk-splits#configure-APK-versions)
        // You can force using the value of versionCode by specifying the `-P force-version-code-ignoring-abi=true`
        // flag during build.
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    // Two apps from one project: the customer app (default, lib/main.dart) and QuikFly Partner
    // for vehicle owners (lib/main_partner.dart). pubspec.yaml sets the default flavor, so
    // `flutter run` / `flutter build apk` keep building the customer app.
    flavorDimensions += "app"
    productFlavors {
        create("customer") {
            dimension = "app"
            applicationId = "com.quikfly.app"
            manifestPlaceholders["appLabel"] = "QuikFly"
        }
        create("partner") {
            dimension = "app"
            applicationId = "com.quikfly.partner"
            manifestPlaceholders["appLabel"] = "QuikFly Partner"
        }
    }

    // Release signing: android/key.properties (git-ignored) holds storeFile and keyAlias. The password
    // comes from the QUIKFLY_KEYSTORE_PASSWORD environment variable, so it is never written to disk
    // (a storePassword line in key.properties also works). See apps/mobile/README.md.
    // Without key.properties, release builds use the debug key so `flutter run --release` still works.
    val keyProps = Properties().apply {
        val f = rootProject.file("key.properties")
        if (f.exists()) f.inputStream().use { load(it) }
    }
    val keystorePassword: String? = System.getenv("QUIKFLY_KEYSTORE_PASSWORD") ?: keyProps.getProperty("storePassword")
    signingConfigs {
        if (keyProps.isNotEmpty()) {
            create("release") {
                storeFile = file(keyProps.getProperty("storeFile"))
                keyAlias = keyProps.getProperty("keyAlias")
                storePassword = keystorePassword
                // PKCS12 keystores (keytool's default) use one password for the store and the key.
                keyPassword = System.getenv("QUIKFLY_KEY_PASSWORD") ?: keyProps.getProperty("keyPassword") ?: keystorePassword
            }
        }
    }
    // A configured key without its password must fail loudly, not quietly ship a debug-signed APK.
    if (keyProps.isNotEmpty() && keystorePassword == null) {
        gradle.taskGraph.whenReady {
            if (allTasks.any { it.name.contains("Release") }) {
                throw GradleException("Set QUIKFLY_KEYSTORE_PASSWORD to the upload key's password before building a release APK.")
            }
        }
    }

    buildTypes {
        release {
            signingConfig = if (keyProps.isNotEmpty()) signingConfigs.getByName("release") else signingConfigs.getByName("debug")
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}
