// Bus m-ticket: the booking's trip, seats and travellers with a QR code. The code opens the
// website's public /ticket page (same as the web m-ticket), so a conductor can check it.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:qr_flutter/qr_flutter.dart';
import '../../api/models.dart';
import '../../core/env.dart';
import '../../state/catalog.dart';
import '../../theme/tokens.dart';
import '../../widgets/ui.dart';

/// The page a ticket's QR code opens.
String ticketUrl(String token) => '$webUrl/ticket?t=${Uri.encodeQueryComponent(token)}';

class TicketScreen extends ConsumerWidget {
  const TicketScreen({super.key, required this.id});
  final String id;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.qf;
    final bookings = ref.watch(bookingsProvider);
    final b = (bookings.value ?? const <Booking>[]).where((x) => x.id == id).firstOrNull;
    return Scaffold(
      appBar: AppBar(title: const Text('m-Ticket')),
      body: bookings.isLoading && b == null
          ? const Center(child: CircularProgressIndicator())
          : b == null || b.ticketToken == null
              ? const ScreenList(children: [EmptyState(icon: Icons.confirmation_number_outlined, title: 'Ticket not found')])
              : ScreenList(children: [
                  Panel(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                      Row(children: [
                        Icon(Icons.directions_bus_outlined, color: c.accent),
                        const SizedBox(width: 8),
                        Expanded(child: Text(b.title, style: Theme.of(context).textTheme.titleLarge)),
                        Pill(
                          b.status == BookingStatus.confirmed ? 'Valid' : b.status == BookingStatus.cancelled ? 'Cancelled' : 'Completed',
                          color: b.status == BookingStatus.confirmed ? c.success : b.status == BookingStatus.cancelled ? c.danger : c.fgMuted,
                        ),
                      ]),
                      if (b.subtitle.isNotEmpty) Text(b.subtitle, style: TextStyle(color: c.fgMuted)),
                      const SizedBox(height: 10),
                      for (final k in const ['Date', 'Departure', 'Arrival'])
                        if (b.line(k) != null) KeyValue(k, b.line(k)!),
                      KeyValue('Seats', b.line('Seats') ?? b.seats.map((s) => s.id).join(', ')),
                      if (b.line('Traveller names') != null) KeyValue('Travellers', b.line('Traveller names')!),
                      KeyValue('PNR', b.id),
                    ]),
                  ),
                  if (b.status == BookingStatus.confirmed) ...[
                    const SizedBox(height: 16),
                    Center(
                      // Dark on white in both themes, so any scanner reads it.
                      child: Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(Brand.radiusField)),
                        child: QrImageView(
                          data: ticketUrl(b.ticketToken!),
                          size: 200,
                          backgroundColor: Colors.white,
                          semanticsLabel: 'QR code for ticket ${b.id}',
                        ),
                      ),
                    ),
                    const SizedBox(height: 10),
                    Text('Show this at boarding. Scanning the code opens the ticket page, so the conductor sees it is valid.',
                        textAlign: TextAlign.center, style: TextStyle(color: c.fgMuted, fontSize: 12.5)),
                  ],
                  const SizedBox(height: 10),
                  Text('Demo: the bus timetable is simulated.', textAlign: TextAlign.center, style: TextStyle(color: c.fgSubtle, fontSize: 12)),
                ]),
    );
  }
}
