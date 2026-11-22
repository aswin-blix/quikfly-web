package com.quikfly.app

import android.app.Activity
import android.content.Intent
import android.provider.ContactsContract
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

/**
 * Adds one thing to Flutter's activity: the system's contact picker, for a parcel's receiver
 * (lib/core/contact_picker.dart). ACTION_PICK grants read access to the picked number only,
 * so the app asks for no contacts permission.
 */
class MainActivity : FlutterActivity() {
    private var pending: MethodChannel.Result? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL).setMethodCallHandler { call, result ->
            if (call.method == "pick") pick(result) else result.notImplemented()
        }
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
        private const val PICK_CONTACT = 0x5146
    }
}
