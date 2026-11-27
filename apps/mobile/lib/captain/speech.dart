// Offers read aloud, so a captain on a bike doesn't have to read the phone: "Auto ride, T. Nagar to
// Adyar, 6 kilometres, 84 rupees". The phone's own text-to-speech, free and offline, through a small
// channel ("quikfly/speech": Android's TextToSpeech in MainActivity.kt, iOS's AVSpeechSynthesizer in
// AppDelegate.swift) rather than a plugin, so the iPhone project stays on Swift Package Manager.
// The voice language is the captain's choice (English, Tamil, Hindi), apart from the app's language.
// The Tamil and Hindi phrases need a native speaker's check before launch (as all translations do).
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../api/captain_models.dart';

const _voiceOnKey = 'quikfly.captain.voice';
const _voiceLangKey = 'quikfly.captain.voiceLang';

/// The languages offers can be read in, with the text-to-speech locale for each.
const voiceLanguages = {'en': ('English', 'en-IN'), 'ta': ('தமிழ்', 'ta-IN'), 'hi': ('हिन्दी', 'hi-IN')};

/// The sentence for an offer, in [lang]. Place names stay as they are written.
String offerSentence(CaptainOffer o, String lang) {
  final t = o.trip;
  final km = t.distanceKm.toStringAsFixed(t.distanceKm < 10 ? 1 : 0).replaceAll(RegExp(r'\.0$'), '');
  final fare = t.money.customerPays;
  final cash = t.cash;
  switch (lang) {
    case 'ta':
      return '${t.rideType} சவாரி. ${t.pickup.name} முதல் ${t.drop.name} வரை. $km கிலோமீட்டர். $fare ரூபாய்${cash ? ', ரொக்கம்' : ''}.';
    case 'hi':
      return '${t.rideType} सवारी. ${t.pickup.name} से ${t.drop.name}. $km किलोमीटर. $fare रुपये${cash ? ', नकद' : ''}.';
    default:
      return '${t.rideType} ride. ${t.pickup.name} to ${t.drop.name}. $km kilometres. $fare rupees${cash ? ', cash' : ''}.';
  }
}

class VoiceSettings {
  const VoiceSettings({this.on = true, this.lang = 'en'});
  final bool on;
  final String lang;
}

const _speech = MethodChannel('quikfly/speech');

class VoiceNotifier extends Notifier<VoiceSettings> {
  @override
  VoiceSettings build() {
    _load();
    return const VoiceSettings();
  }

  Future<void> _load() async {
    final p = await SharedPreferences.getInstance();
    final lang = p.getString(_voiceLangKey);
    state = VoiceSettings(on: p.getBool(_voiceOnKey) ?? true, lang: voiceLanguages.containsKey(lang) ? lang! : 'en');
  }

  Future<void> set({bool? on, String? lang}) async {
    state = VoiceSettings(on: on ?? state.on, lang: lang ?? state.lang);
    final p = await SharedPreferences.getInstance();
    await p.setBool(_voiceOnKey, state.on);
    await p.setString(_voiceLangKey, state.lang);
  }

  /// Reads the offer aloud (or does nothing when the voice is off or the phone has no speech engine).
  Future<void> speak(CaptainOffer o) async {
    if (!state.on) return;
    try {
      await _speech.invokeMethod('speak', {'text': offerSentence(o, state.lang), 'locale': voiceLanguages[state.lang]!.$2});
    } catch (e) {
      debugPrint('offer voice: $e'); // no engine for that language, or tests: the screen still shows it
    }
  }
}

final voiceProvider = NotifierProvider<VoiceNotifier, VoiceSettings>(VoiceNotifier.new);
