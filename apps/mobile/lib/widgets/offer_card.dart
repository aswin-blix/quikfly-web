// A coupon card on hue artwork, with the code to copy.
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../api/models.dart';
import '../core/format.dart';
import '../core/services.dart';
import 'art.dart';
import 'ui.dart';

/// "Up to ₹150 off · min ₹500 · till 31 Dec"
String offerTerms(Offer o) {
  final parts = <String>[
    o.percent >= 100 ? 'Flat ${inr(o.maxDiscount)} off' : '${o.percent}% off up to ${inr(o.maxDiscount)}',
    if (o.minAmount > 0) 'min ${inr(o.minAmount)}',
    if (o.validUntil != null) 'till ${o.validUntil}',
  ];
  return parts.join(' · ');
}

String offerService(Offer o) => o.service == 'all' ? 'All services' : serviceOf(ServiceKey.parse(o.service)).action;

class OfferCard extends StatelessWidget {
  const OfferCard(this.offer, {super.key, this.compact = false});
  final Offer offer;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final o = offer;
    return Container(
      decoration: BoxDecoration(gradient: hueGradient(o.hue), borderRadius: BorderRadius.circular(20)),
      padding: const EdgeInsets.all(16),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
        Row(children: [
          Pill(offerService(o), color: onArt),
          const Spacer(),
          const Icon(Icons.local_offer, color: onArtMuted, size: 18),
        ]),
        const SizedBox(height: 10),
        Text(o.title, maxLines: 2, overflow: TextOverflow.ellipsis,
            style: const TextStyle(color: onArt, fontWeight: FontWeight.w700, fontSize: 17, height: 1.2)),
        if (!compact && o.description.isNotEmpty) ...[
          const SizedBox(height: 4),
          Text(o.description, style: const TextStyle(color: onArtMuted, fontSize: 13)),
        ],
        const SizedBox(height: 4),
        Text(offerTerms(o), maxLines: compact ? 1 : 2, overflow: TextOverflow.ellipsis, style: const TextStyle(color: onArtMuted, fontSize: 12)),
        if (compact) const Spacer() else const SizedBox(height: 12),
        Row(children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: onArtMuted, style: BorderStyle.solid),
              color: Colors.black.withValues(alpha: 0.18),
            ),
            child: Text(o.code, style: const TextStyle(color: onArt, fontWeight: FontWeight.w700, letterSpacing: 1.2)),
          ),
          const Spacer(),
          TextButton.icon(
            style: TextButton.styleFrom(foregroundColor: onArt, visualDensity: VisualDensity.compact),
            onPressed: () {
              Clipboard.setData(ClipboardData(text: o.code));
              toast(context, '${o.code} copied. Apply it at checkout.');
            },
            icon: const Icon(Icons.copy, size: 16),
            label: const Text('Copy'),
          ),
        ]),
      ]),
    );
  }
}
