// What the shared checkout needs, created by a service screen (bus seats, holiday, rental).
// Mirrors CheckoutDraft in packages/shared/src/types.ts.
import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../api/api.dart';
import '../api/models.dart';

/// What a parcel booking needs besides its quote. Never in `summary` or booking lines.
class ParcelDraft {
  const ParcelDraft({
    this.city = false,
    required this.receiverName,
    required this.receiverPhone,
    required this.contents,
    required this.declaration,
    required this.declaredValue,
  });
  final String receiverName, receiverPhone, contents, declaration;
  final int declaredValue;

  /// A Quick parcel: cash on pickup is allowed and the wording differs.
  final bool city;
}

class CheckoutDraft {
  const CheckoutDraft({
    required this.service,
    required this.title,
    required this.subtitle,
    this.image,
    required this.summary,
    required this.quote,
    required this.travellers,
    this.needsLicence = false,
    required this.policy,
    this.parcel,
  });
  final ServiceKey service;
  final String title, subtitle, policy;
  final String? image;
  final List<(String, String)> summary;
  /// The API's price; checkout shows its lines and books with its id.
  final PriceQuote quote;
  /// Labels for traveller name fields, e.g. ["Seat L4", "Seat L5"].
  final List<String> travellers;
  final bool needsLicence;
  final ParcelDraft? parcel;
}

class CheckoutNotifier extends Notifier<CheckoutDraft?> {
  @override
  CheckoutDraft? build() => null;
  void set(CheckoutDraft? d) => state = d;
}

final checkoutProvider = NotifierProvider<CheckoutNotifier, CheckoutDraft?>(CheckoutNotifier.new);

/// Live price estimate: asks POST /quotes after the inputs settle (decision 2026-11-17:
/// no price maths in the app). The latest quote is also what checkout books with.
class LiveQuote extends ChangeNotifier {
  LiveQuote(this._api, {this.delay = const Duration(milliseconds: 400)});
  final QuikFlyApi _api;
  final Duration delay;

  PriceQuote? quote;
  String? error;
  bool loading = false;
  Timer? _timer;
  int _seq = 0;
  String? _lastKey;

  /// Request a price for [request] (null clears). Repeated identical requests are ignored.
  void update(Map<String, Object?>? request) {
    final key = request?.toString();
    if (key == _lastKey) return;
    _lastKey = key;
    _timer?.cancel();
    final seq = ++_seq;
    if (request == null) {
      quote = null;
      error = null;
      loading = false;
      notifyListeners();
      return;
    }
    loading = true;
    error = null;
    notifyListeners();
    _timer = Timer(delay, () async {
      try {
        final q = await _api.quote(request);
        if (seq != _seq) return;
        quote = q;
      } catch (e) {
        if (seq != _seq) return;
        quote = null;
        error = e is ApiException ? e.message : 'Could not get a price. Please try again.';
      }
      loading = false;
      notifyListeners();
    });
  }

  /// A fresh quote for checkout: quotes book once and expire, so the shown one may be used up.
  Future<PriceQuote> fresh(Map<String, Object?> request) async {
    final q = await _api.quote(request);
    quote = q;
    notifyListeners();
    return q;
  }

  @override
  void dispose() {
    _timer?.cancel();
    _seq++; // an answer still on its way mustn't notify a disposed listener
    super.dispose();
  }
}
