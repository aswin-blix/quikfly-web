// Real GPS for QuikFly Captain (step 7 of docs/driver-app-plan.md). While a captain is online with GPS,
// the position stream runs as an Android foreground service (a "You're online" notification) or with
// iOS background location, so they stay online and keep getting offers with the app closed. Only the
// latest fix is sent (the API keeps only the latest). The app explains why before Android or iOS asks.
import 'dart:io' show Platform;
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../api/captain_models.dart';
import '../theme/tokens.dart';
import '../widgets/ui.dart';

/// Moves smaller than this (metres) don't produce a new fix.
const gpsDistanceFilterMetres = 20;

/// The explanation was shown and accepted (Play's prominent-disclosure rule: before the system prompt).
const _disclosedKey = 'quikfly.captain.gpsDisclosed';

/// Why GPS can't be used right now, in words for the captain, with what fixes it.
enum GpsProblem {
  serviceOff('Location is turned off on this phone. Turn it on to go online.'),
  denied('QuikFly Captain needs your location to offer you rides nearby.'),
  deniedForever('Location is blocked for QuikFly Captain. Allow it in the phone\'s settings to go online.'),
  unavailable("Your location couldn't be read. Step outside or near a window and try again.");

  const GpsProblem(this.message);
  final String message;

  /// Opens the phone setting that fixes this, when there is one.
  Future<void> openSettings() async {
    try {
      if (this == serviceOff) await Geolocator.openLocationSettings();
      if (this == deniedForever) await Geolocator.openAppSettings();
    } catch (_) {/* no settings screen to open */}
  }

  bool get hasSettings => this == serviceOff || this == deniedForever;
}

LocationSettings _settings({required bool background}) {
  if (Platform.isAndroid) {
    return AndroidSettings(
      accuracy: LocationAccuracy.high,
      distanceFilter: gpsDistanceFilterMetres,
      intervalDuration: const Duration(seconds: 5),
      foregroundNotificationConfig: background
          ? const ForegroundNotificationConfig(
              notificationTitle: "You're online in QuikFly Captain",
              notificationText: 'Sharing your location for rides nearby. Go offline in the app to stop.',
              notificationIcon: AndroidResource(name: 'ic_stat_quikfly', defType: 'drawable'),
              enableWakeLock: true,
              setOngoing: true,
            )
          : null,
    );
  }
  if (Platform.isIOS) {
    return AppleSettings(
      accuracy: LocationAccuracy.high,
      distanceFilter: gpsDistanceFilterMetres,
      activityType: ActivityType.automotiveNavigation,
      pauseLocationUpdatesAutomatically: false,
      allowBackgroundLocationUpdates: background,
      showBackgroundLocationIndicator: background,
    );
  }
  return const LocationSettings(accuracy: LocationAccuracy.high, distanceFilter: gpsDistanceFilterMetres);
}

/// The phone's location, for QuikFly Captain only.
class CaptainGps {
  /// Null when GPS can be used; otherwise what stops it. Asks Android or iOS when it hasn't yet
  /// (callers show [gpsDisclosure] first).
  static Future<GpsProblem?> access() async {
    try {
      if (!await Geolocator.isLocationServiceEnabled()) return GpsProblem.serviceOff;
      var p = await Geolocator.checkPermission();
      if (p == LocationPermission.denied) p = await Geolocator.requestPermission();
      if (p == LocationPermission.denied) return GpsProblem.denied;
      if (p == LocationPermission.deniedForever) return GpsProblem.deniedForever;
      return null;
    } catch (_) {
      return GpsProblem.unavailable;
    }
  }

  /// True when location may already be used without asking (to resume after a restart).
  static Future<bool> allowed() async {
    try {
      final p = await Geolocator.checkPermission();
      return (p == LocationPermission.whileInUse || p == LocationPermission.always) && await Geolocator.isLocationServiceEnabled();
    } catch (_) {
      return false;
    }
  }

  /// One fix now (to go online).
  static Future<GpsFix?> current() async {
    try {
      final p = await Geolocator.getCurrentPosition(locationSettings: _settings(background: false)).timeout(const Duration(seconds: 20));
      return GpsFix(p.latitude, p.longitude);
    } catch (_) {
      final last = await Geolocator.getLastKnownPosition().catchError((_) => null);
      return last == null ? null : GpsFix(last.latitude, last.longitude);
    }
  }

  /// Fixes while online, kept alive with the app closed (Android foreground service, iOS background location).
  static Stream<GpsFix> watch() =>
      Geolocator.getPositionStream(locationSettings: _settings(background: true)).map((p) => GpsFix(p.latitude, p.longitude));
}

/// Explains, once, why Captain uses location and that it continues with the app closed, before the system prompt.
/// True when the captain agreed (now or before).
Future<bool> gpsDisclosure(BuildContext context) async {
  final prefs = await SharedPreferences.getInstance();
  if (prefs.getBool(_disclosedKey) ?? false) return true;
  if (!context.mounted) return false;
  final ok = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (ctx) {
      final c = ctx.qf;
      Widget point(IconData icon, String text) => Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Icon(icon, size: 20, color: c.accent),
              const SizedBox(width: 10),
              Expanded(child: Text(text)),
            ]),
          );
      return SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text('Your location while you\'re online', style: Theme.of(ctx).textTheme.titleLarge),
            const SizedBox(height: 12),
            point(Icons.near_me_outlined, 'QuikFly Captain uses your location while you\'re online to offer you rides nearby and show your rider where you are.'),
            point(Icons.phone_android, 'It keeps working with the app closed or the screen off, so you don\'t miss rides. A notification shows while it does.'),
            point(Icons.power_settings_new, 'Go offline and it stops. Only your latest position is kept, never a trail.'),
            const SizedBox(height: 8),
            GoldButton(label: 'Continue', onPressed: () => Navigator.pop(ctx, true)),
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Not now')),
          ]),
        ),
      );
    },
  );
  if (ok == true) await prefs.setBool(_disclosedKey, true);
  return ok == true;
}
