import AVFoundation
import Flutter
import UIKit

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  /// QuikFly Captain reads ride offers aloud (lib/captain/speech.dart, channel "quikfly/speech").
  private let speech = AVSpeechSynthesizer()

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)
    guard let registrar = engineBridge.pluginRegistry.registrar(forPlugin: "QuikFlySpeech") else { return }
    FlutterMethodChannel(name: "quikfly/speech", binaryMessenger: registrar.messenger()).setMethodCallHandler { [weak self] call, result in
      guard call.method == "speak", let args = call.arguments as? [String: Any], let text = args["text"] as? String else {
        result(FlutterMethodNotImplemented)
        return
      }
      let utterance = AVSpeechUtterance(string: text)
      // Nil (no voice for that language on this phone) leaves the system's own voice.
      utterance.voice = AVSpeechSynthesisVoice(language: args["locale"] as? String)
      self?.speech.stopSpeaking(at: .immediate)
      self?.speech.speak(utterance)
      result(nil)
    }
  }
}
