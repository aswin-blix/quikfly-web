// Customer support: the customer's tickets and callback requests (/support), a new ticket
// (/support/new, ?booking= prefills it), a thread with reply and close (/support/:id), and the
// callback sheet used on the Help centre and holiday pages. Staff answer from the admin panel.
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../api/models.dart';
import '../../api/support_models.dart';
import '../../core/format.dart';
import '../../state/catalog.dart';
import '../../state/providers.dart';
import '../../theme/tokens.dart';
import '../../widgets/ui.dart';
import '../auth/login_screen.dart';

/// The signed-in customer's tickets and callbacks, newest activity first. Empty when signed out.
final supportTicketsProvider = FutureProvider<List<SupportTicket>>((ref) async {
  final user = ref.watch(userProvider.select((u) => u?.id));
  if (user == null) return const [];
  return ref.watch(apiProvider).tickets();
});

/// "Chat on WhatsApp", or nothing until the owner sets a WhatsApp number in Settings.
class WhatsAppButton extends ConsumerWidget {
  const WhatsAppButton({super.key, required this.text});
  final String text;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final uri = whatsappLink(ref.watch(configProvider).value?.settings.whatsappNumber ?? '', text);
    if (uri == null) return const SizedBox.shrink();
    return OutlinedButton.icon(
      onPressed: () => launchUrl(uri, mode: LaunchMode.externalApplication),
      icon: const Icon(Icons.chat_outlined, size: 18),
      label: const Text('Chat on WhatsApp'),
    );
  }
}

/// Opens the "Request a callback" sheet.
Future<void> showCallbackSheet(BuildContext context, {String topic = 'booking', String? about}) => showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
        child: _CallbackForm(topic: topic, about: about),
      ),
    );

class _CallbackForm extends ConsumerStatefulWidget {
  const _CallbackForm({required this.topic, this.about});
  final String topic;
  final String? about;
  @override
  ConsumerState<_CallbackForm> createState() => _CallbackFormState();
}

class _CallbackFormState extends ConsumerState<_CallbackForm> {
  late final _name = TextEditingController(text: ref.read(userProvider)?.name ?? '');
  late final _phone = TextEditingController(text: _tenDigits(ref.read(userProvider)?.phone ?? ''));
  final _message = TextEditingController();
  late String _topic = widget.topic;
  String _time = 'anytime';
  bool _busy = false;
  String? _error;
  String? _doneTime;

  static String _tenDigits(String phone) {
    final d = phone.replaceAll(RegExp(r'\D'), '');
    return d.length >= 10 ? d.substring(d.length - 10) : '';
  }

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    _message.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final name = _name.text.trim(), phone = _phone.text.trim();
    if (name.length < Rules.nameMin) return setState(() => _error = 'Enter your name');
    if (!Rules.phone.hasMatch(phone)) return setState(() => _error = 'Enter a valid 10-digit mobile number');
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final msg = _message.text.trim();
      await ref.read(apiProvider).requestCallback(name: name, phone: phone, topic: _topic, preferredTime: _time, message: msg.isEmpty ? null : msg, ref: widget.about);
      ref.invalidate(supportTicketsProvider);
      if (mounted) setState(() => _doneTime = _time);
    } catch (e) {
      if (mounted) setState(() => _error = errorText(e));
    }
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) {
    final c = context.qf;
    if (_doneTime != null) {
      final when = _doneTime == 'anytime' ? 'soon' : 'in the ${callbackTimes[_doneTime]!.toLowerCase()}';
      return SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(Brand.gutter, 0, Brand.gutter, 24),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Icon(Icons.check_circle_outline, color: c.accent, size: 44),
            const SizedBox(height: 10),
            Text('Request received', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 6),
            Text('Our team will call you $when.${ref.read(userProvider) != null ? ' You can follow it in Support tickets.' : ''}',
                textAlign: TextAlign.center, style: TextStyle(color: c.fgMuted)),
            const SizedBox(height: 16),
            GoldButton(label: 'Done', onPressed: () => Navigator.pop(context)),
          ]),
        ),
      );
    }
    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(Brand.gutter, 0, Brand.gutter, 24),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, mainAxisSize: MainAxisSize.min, children: [
          Text('Request a callback', style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 4),
          Text(widget.about == null ? 'Leave your number and we\'ll call you.' : 'About ${widget.about}. Leave your number and we\'ll call you.',
              style: TextStyle(color: c.fgMuted)),
          const SizedBox(height: 14),
          TextField(controller: _name, textCapitalization: TextCapitalization.words, decoration: const InputDecoration(labelText: 'Your name')),
          const SizedBox(height: 10),
          TextField(
            controller: _phone,
            keyboardType: TextInputType.phone,
            inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(10)],
            decoration: const InputDecoration(labelText: 'Mobile number', prefixText: '+91 '),
          ),
          const SizedBox(height: 10),
          DropdownButtonFormField<String>(
            initialValue: _topic,
            decoration: const InputDecoration(labelText: 'About'),
            items: [for (final e in supportTopics.entries) DropdownMenuItem(value: e.key, child: Text(e.value))],
            onChanged: (v) => setState(() => _topic = v ?? _topic),
          ),
          const SizedBox(height: 10),
          DropdownButtonFormField<String>(
            initialValue: _time,
            decoration: const InputDecoration(labelText: 'Best time to call'),
            items: [for (final e in callbackTimes.entries) DropdownMenuItem(value: e.key, child: Text(e.value))],
            onChanged: (v) => setState(() => _time = v ?? _time),
          ),
          const SizedBox(height: 10),
          TextField(
            controller: _message,
            minLines: 2,
            maxLines: 4,
            maxLength: SupportRules.messageMax,
            decoration: const InputDecoration(labelText: 'Anything we should know? (optional)', counterText: ''),
          ),
          FormError(_error),
          const SizedBox(height: 6),
          GoldButton(label: 'Call me back', icon: Icons.phone_callback_outlined, loading: _busy, onPressed: _send),
        ]),
      ),
    );
  }
}

class SupportListScreen extends ConsumerWidget {
  const SupportListScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.qf;
    final user = ref.watch(userProvider);
    if (user == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Support tickets')),
        body: ScreenList(children: [
          EmptyState(
            icon: Icons.support_agent,
            title: 'Sign in to see your tickets',
            message: 'Not signed in? You can still ask for a callback from the Help centre.',
            action: GoldButton(label: 'Login or sign up', expand: false, onPressed: () => ensureSignedIn(context, ref)),
          ),
        ]),
      );
    }
    final list = ref.watch(supportTicketsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Support tickets')),
      body: list.when(
        loading: () => const ScreenList(children: [Skeleton(height: 72), SizedBox(height: 8), Skeleton(height: 72)]),
        error: (e, _) => ScreenList(children: [ErrorBox(errorText(e), onRetry: () => ref.invalidate(supportTicketsProvider))]),
        data: (items) => ScreenList(
          onRefresh: () async => ref.invalidate(supportTicketsProvider),
          children: [
            Text('Your questions to QuikFly and our replies. You\'ll get a notification when we answer.', style: TextStyle(color: c.fgMuted)),
            const SizedBox(height: 12),
            GoldButton(label: 'New ticket', icon: Icons.add, onPressed: () => context.push('/support/new')),
            const SizedBox(height: 8),
            const WhatsAppButton(text: 'Hi QuikFly, I need help with '),
            const SizedBox(height: 12),
            if (items.isEmpty)
              const EmptyState(icon: Icons.support_agent, title: 'No requests yet', message: 'Open a ticket, or ask for a callback from the Help centre.')
            else
              for (final t in items)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Panel(
                    highlighted: t.status == 'answered',
                    onTap: () => context.push('/support/${t.id}'),
                    child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Icon(t.isCallback ? Icons.phone_callback_outlined : Icons.chat_bubble_outline, color: c.accent),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text('${t.topicLabel}${t.isCallback ? ' · callback' : ''}', style: const TextStyle(fontWeight: FontWeight.w600)),
                          const SizedBox(height: 2),
                          Text(t.messages.isEmpty ? '' : t.messages.first.body, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: c.fgMuted, fontSize: 13)),
                          const SizedBox(height: 6),
                          Row(children: [
                            Pill(t.statusLabel, color: t.status == 'answered' ? c.accent : c.fgMuted),
                            const SizedBox(width: 8),
                            Flexible(child: Text(dateTime(t.updatedAt), style: TextStyle(color: c.fgSubtle, fontSize: 12))),
                          ]),
                        ]),
                      ),
                    ]),
                  ),
                ),
          ],
        ),
      ),
    );
  }
}

class NewTicketScreen extends ConsumerStatefulWidget {
  const NewTicketScreen({super.key, this.bookingId});
  final String? bookingId;
  @override
  ConsumerState<NewTicketScreen> createState() => _NewTicketScreenState();
}

class _NewTicketScreenState extends ConsumerState<NewTicketScreen> {
  final _message = TextEditingController();
  String _topic = 'booking';
  late String? _bookingId = widget.bookingId;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _message.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    if (!await ensureSignedIn(context, ref)) return;
    final msg = _message.text.trim();
    if (msg.length < SupportRules.messageMin) return setState(() => _error = 'Tell us a little more about the problem');
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final t = await ref.read(apiProvider).openTicket(_topic, msg, bookingId: _bookingId);
      ref.invalidate(supportTicketsProvider);
      if (mounted) context.pushReplacement('/support/${t.id}');
    } catch (e) {
      if (mounted) setState(() => _error = errorText(e));
    }
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) {
    final bookings = ref.watch(bookingsProvider).value ?? const <Booking>[];
    final bookingKnown = _bookingId == null || bookings.any((b) => b.id == _bookingId);
    return Scaffold(
      appBar: AppBar(title: const Text('New ticket')),
      body: ScreenList(children: [
        DropdownButtonFormField<String>(
          initialValue: _topic,
          decoration: const InputDecoration(labelText: 'About'),
          items: [for (final e in supportTopics.entries) DropdownMenuItem(value: e.key, child: Text(e.value))],
          onChanged: (v) => setState(() => _topic = v ?? _topic),
        ),
        const SizedBox(height: 12),
        DropdownButtonFormField<String?>(
          key: ValueKey('booking-${bookings.length}'),
          initialValue: bookingKnown ? _bookingId : null,
          isExpanded: true,
          decoration: const InputDecoration(labelText: 'Booking (optional)'),
          items: [
            const DropdownMenuItem<String?>(value: null, child: Text('Not about a booking')),
            for (final b in bookings) DropdownMenuItem<String?>(value: b.id, child: Text('${b.title} · ${b.id}', overflow: TextOverflow.ellipsis)),
          ],
          onChanged: (v) => setState(() => _bookingId = v),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _message,
          minLines: 4,
          maxLines: 8,
          maxLength: SupportRules.messageMax,
          textCapitalization: TextCapitalization.sentences,
          decoration: const InputDecoration(labelText: 'What happened?', alignLabelWithHint: true),
        ),
        FormError(_error),
        const SizedBox(height: 6),
        GoldButton(label: 'Send to QuikFly', icon: Icons.send_outlined, loading: _busy, onPressed: _send),
      ]),
    );
  }
}

class SupportThreadScreen extends ConsumerStatefulWidget {
  const SupportThreadScreen({super.key, required this.id});
  final String id;
  @override
  ConsumerState<SupportThreadScreen> createState() => _SupportThreadScreenState();
}

class _SupportThreadScreenState extends ConsumerState<SupportThreadScreen> {
  final _reply = TextEditingController();
  SupportTicket? _t;
  String? _loadError, _error;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _reply.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _loadError = null);
    try {
      final t = await ref.read(apiProvider).ticket(widget.id);
      if (mounted) setState(() => _t = t);
    } catch (e) {
      if (mounted) setState(() => _loadError = errorText(e));
    }
  }

  Future<void> _act(Future<SupportTicket> Function() fn) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final t = await fn();
      ref.invalidate(supportTicketsProvider);
      if (mounted) setState(() => _t = t);
    } catch (e) {
      if (mounted) setState(() => _error = errorText(e));
    }
    if (mounted) setState(() => _busy = false);
  }

  void _send() {
    final body = _reply.text.trim();
    if (body.length < SupportRules.messageMin) return setState(() => _error = 'Write a little more');
    _act(() async {
      final t = await ref.read(apiProvider).replyTicket(widget.id, body);
      _reply.clear();
      return t;
    });
  }

  Future<void> _close() async {
    if (!await confirm(context, title: 'Close this ticket?', message: 'Do this when your problem is solved. You can open a new ticket any time.', yes: 'Close it')) return;
    _act(() => ref.read(apiProvider).closeTicket(widget.id));
  }

  @override
  Widget build(BuildContext context) {
    final c = context.qf;
    final t = _t;
    return Scaffold(
      appBar: AppBar(title: Text(t == null ? 'Support' : t.isCallback ? 'Callback request' : 'Ticket')),
      body: t == null
          ? ScreenList(children: [_loadError != null ? ErrorBox(_loadError!, onRetry: _load) : const Skeleton(height: 160)])
          : ScreenList(onRefresh: _load, children: [
              Row(children: [
                Expanded(child: Text(t.topicLabel, style: Theme.of(context).textTheme.titleMedium)),
                Pill(t.statusLabel, color: t.status == 'answered' ? c.accent : c.fgMuted),
              ]),
              const SizedBox(height: 2),
              Text('${t.id}${t.bookingId != null ? ' · booking ${t.bookingId}' : ''}${t.ref != null ? ' · ${t.ref}' : ''}',
                  style: TextStyle(color: c.fgSubtle, fontSize: 12)),
              const SizedBox(height: 14),
              for (final m in t.messages)
                Align(
                  alignment: m.fromStaff ? Alignment.centerLeft : Alignment.centerRight,
                  child: FractionallySizedBox(
                    widthFactor: 0.88,
                    alignment: m.fromStaff ? Alignment.centerLeft : Alignment.centerRight,
                    child: Container(
                      margin: const EdgeInsets.only(bottom: 8),
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
                      decoration: BoxDecoration(
                        color: m.fromStaff ? c.accent.withValues(alpha: 0.10) : c.surfaceRaised,
                        borderRadius: BorderRadius.circular(Brand.radiusField),
                        border: Border.all(color: m.fromStaff ? c.accent.withValues(alpha: 0.30) : c.border),
                      ),
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text('${m.fromStaff ? '${m.staffName ?? 'QuikFly'} · QuikFly support' : 'You'} · ${dateTime(m.createdAt)}',
                            style: TextStyle(color: c.fgSubtle, fontSize: 11.5)),
                        const SizedBox(height: 3),
                        Text(m.body),
                      ]),
                    ),
                  ),
                ),
              if (t.status == 'open') Text('We usually reply within a few hours.', style: TextStyle(color: c.fgMuted, fontSize: 12.5)),
              const Divider(height: 28),
              if (t.closed)
                Text('This request is closed. Need more help? Open a new ticket.', style: TextStyle(color: c.fgMuted))
              else if (t.isCallback)
                Text('Our team will call you on ${t.phone}.', style: TextStyle(color: c.fgMuted))
              else ...[
                TextField(
                  controller: _reply,
                  minLines: 2,
                  maxLines: 6,
                  maxLength: SupportRules.messageMax,
                  textCapitalization: TextCapitalization.sentences,
                  decoration: const InputDecoration(labelText: 'Reply', alignLabelWithHint: true),
                ),
                FormError(_error),
                const SizedBox(height: 6),
                GoldButton(label: 'Send', icon: Icons.send_outlined, loading: _busy, onPressed: _send),
                const SizedBox(height: 6),
                TextButton(onPressed: _busy ? null : _close, child: const Text('My problem is solved, close it')),
              ],
            ]),
    );
  }
}
