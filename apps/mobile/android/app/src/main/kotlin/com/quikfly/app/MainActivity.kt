package com.quikfly.app

import android.app.Activity
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.provider.ContactsContract
import android.speech.tts.TextToSpeech
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.util.Locale

/**
 * Adds three things to Flutter's activity: the system's contact picker, for a parcel's receiver
 * (lib/core/contact_picker.dart; ACTION_PICK grants read access to the picked number only, so the
 * app asks for no contacts permission), the notification channel phone pushes arrive on, and the
 * phone's text-to-speech, which QuikFly Captain uses to read ride offers aloud (lib/captain/speech.dart;
 * started only when first asked, so the other apps never start it).
 */
class MainActivity : FlutterActivity() {
    private var pending: MethodChannel.Result? = null
    private var tts: TextToSpeech? = null
    private var ttsReady = false
    private var queued: Pair<String, String>? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // One channel for every QuikFly update (the API sends on it: PUSH_ANDROID.channelId). People
        // can mute it in Android settings without blocking the app.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(PUSH_CHANNEL, "Trip and account updates", NotificationManager.IMPORTANCE_HIGH)
            channel.description = "Bookings, refunds, ride reminders, parcels and support replies"
            getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL).setMethodCallHandler { call, result ->
            if (call.method == "pick") pick(result) else result.notImplemented()
        }
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, SPEECH).setMethodCallHandler { call, result ->
            if (call.method == "speak") {
                speak(call.argument<String>("text") ?: "", call.argument<String>("locale") ?: "en-IN")
                result.success(null)
            } else {
                result.notImplemented()
            }
        }
    }

    /** Says [text] in [locale] (falls back to the engine's language when the phone has no voice for it). */
    private fun speak(text: String, locale: String) {
        if (text.isBlank()) return
        if (tts == null) {
            queued = text to locale
            tts = TextToSpeech(this) { status ->
                ttsReady = status == TextToSpeech.SUCCESS
                val q = queued
                queued = null
                if (ttsReady && q != null) say(q.first, q.second)
            }
            return
        }
        if (!ttsReady) {
            queued = text to locale
            return
        }
        say(text, locale)
    }

    private fun say(text: String, locale: String) {
        val engine = tts ?: return
        val wanted = Locale.forLanguageTag(locale)
        if (engine.isLanguageAvailable(wanted) >= TextToSpeech.LANG_AVAILABLE) engine.language = wanted
        engine.speak(text, TextToSpeech.QUEUE_FLUSH, null, "offer")
    }

    override fun onDestroy() {
        tts?.shutdown()
        tts = null
        super.onDestroy()
    }

    private fun pick(result: MethodChannel.Result) {
        if (pending != null) return result.success(null)
        pending = result
        try {
            @Suppress("DEPRECATION")
            startActivityForResult(
                Intent(Intent.ACTION_PICK).setType(ContactsContract.CommonDataKinds.Phone.CONTENT_TYPE),
                PICK_CONTACT,
            )
        } catch (e: Exception) {
            // No contacts app on this phone.
            pending = null
            result.error("unavailable", "No contact picker on this phone.", null)
        }
    }

    @Deprecated("FlutterActivity has no newer result API")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode != PICK_CONTACT) {
            // Plugins (the phone-number sheet, the photo picker) get their results from here.
            @Suppress("DEPRECATION")
            super.onActivityResult(requestCode, resultCode, data)
            return
        }
        val result = pending ?: return
        pending = null
        val uri = data?.data
        if (resultCode != Activity.RESULT_OK || uri == null) return result.success(null)
        val picked = try {
            val columns = arrayOf(
                ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
                ContactsContract.CommonDataKinds.Phone.NUMBER,
            )
            contentResolver.query(uri, columns, null, null, null)?.use { row ->
                if (row.moveToFirst()) {
                    mapOf("name" to (row.getString(0) ?: ""), "phone" to (row.getString(1) ?: ""))
                } else {
                    null
                }
            }
        } catch (e: Exception) {
            null
        }
        result.success(picked)
    }

    companion object {
        private const val CHANNEL = "quikfly/contact_picker"
        private const val SPEECH = "quikfly/speech"
        private const val PICK_CONTACT = 0x5146
        private const val PUSH_CHANNEL = "quikfly_updates"
    }
}
