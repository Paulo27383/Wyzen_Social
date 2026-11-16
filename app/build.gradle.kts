plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.wyzen.social"
    compileSdk = 35

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions { jvmTarget = "17" }

    defaultConfig {
        applicationId = "com.wyzen.social"
        minSdk = 24
        targetSdk = 35
        versionCode = 3
        versionName = "3.0.0"
    }
}

dependencies {
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
}