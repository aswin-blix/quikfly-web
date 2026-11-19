// Customer support (packages/shared/src/support.ts): callback requests and tickets.
// Keep the topics, times, labels and rules in step with that file.

import 'models.dart';

/// SUPPORT_TOPICS and SUPPORT_TOPIC_LABEL.
const supportTopics = <String, String>{
  'booking': 'A booking',
  'refund': 'A refund',
  'payment': 'A payment',
  'holiday': 'A holiday package',
  'group': 'Group travel quote',
  'partner': 'Becoming a partner',
  'account': 'My account',
  'other': 'Something else',
};

/// CALLBACK_TIMES and CALLBACK_TIME_LABEL.
const callbackTimes = <String, String>{
  'anytime': 'Any time',
  'morning': 'Morning (9–12)',
  'afternoon': 'Afternoon (12–5)',
  'evening': 'Evening (5–9)',
};

/// SUPPORT_RULES.
abstract final class SupportRules {
  static const messageMin = 5, messageMax = 1000, callbacksPerDay = 3, openTickets = 5;
}

/// whatsappLink(): a wa.me chat with a ready message, or null when no number is set.
Uri? whatsappLink(String number, String text) {
  var digits = number.replaceAll(RegExp(r'\D'), '');
  if (digits.isEmpty) return null;
  if (digits.length == 10) digits = '91$digits';
  return Uri.parse('https://wa.me/$digits?text=${Uri.encodeComponent(text)}');
}

class SupportMessage {
  const SupportMessage(this.id, this.fromStaff, this.staffName, this.body, this.createdAt);
  final String id, body;
  final bool fromStaff;
  final String? staffName;
  final DateTime createdAt;
  factory SupportMessage.fromJson(Json j) => SupportMessage(j['id'] as String, j['author'] == 'staff', j['staffName'] as String?, '${j['body']}',
      DateTime.tryParse('${j['createdAt']}')?.toLocal() ?? DateTime.now());
}

/// A callback request or ticket. Lists carry only the first message; GET /me/tickets/:id has the thread.
class SupportTicket {
  const SupportTicket(this.id, this.kind, this.status, this.topic, this.bookingId, this.ref, this.phone, this.preferredTime, this.updatedAt, this.messages);
  final String id, kind, status, topic, phone;
  final String? bookingId, ref, preferredTime;
  final DateTime updatedAt;
  final List<SupportMessage> messages;

  bool get isCallback => kind == 'callback';
  bool get closed => status == 'closed';
  String get topicLabel => supportTopics[topic] ?? topic;
  String get statusLabel => switch (status) { 'answered' => 'QuikFly replied', 'closed' => 'Closed', _ => 'Waiting for QuikFly' };

  factory SupportTicket.fromJson(Json j) => SupportTicket(
        j['id'] as String, '${j['kind']}', '${j['status']}', '${j['topic']}', j['bookingId'] as String?, j['ref'] as String?, '${j['phone']}',
        j['preferredTime'] as String?, DateTime.tryParse('${j['updatedAt']}')?.toLocal() ?? DateTime.now(),
        [for (final m in (j['messages'] as List? ?? const [])) SupportMessage.fromJson(m as Json)],
      );
}
