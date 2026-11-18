// Partner (vendor) registration shapes: a Dart copy of packages/shared/src/vendor.ts.
import 'models.dart' show Json;

const vendorVehicleTypes = ['car', 'auto', 'tempo', 'bus'];
const vendorVehicleLabel = {'car': 'Car (cab or outstation)', 'auto': 'Auto', 'tempo': 'Tempo traveller', 'bus': 'Bus or coach'};
const fuelTypes = ['petrol_diesel', 'cng_lpg', 'electric'];
const fuelLabel = {'petrol_diesel': 'Petrol or diesel', 'cng_lpg': 'CNG or LPG', 'electric': 'Electric'};
const vendorSections = ['vehicle', 'photo', 'bank', 'rc', 'insurance', 'audit'];
const vendorSectionLabel = {
  'vehicle': 'City & vehicle details',
  'photo': 'Profile photo',
  'bank': 'Bank account details',
  'rc': 'Vehicle registration certificate',
  'insurance': 'Vehicle insurance',
  'audit': 'Vehicle audit',
};
const auditSlots = ['morning', 'afternoon'];
const auditSlotLabel = {'morning': 'Morning (9 AM to 1 PM)', 'afternoon': 'Afternoon (2 PM to 6 PM)'};

/// Same patterns as VENDOR_RULES, so the app catches mistakes before the API does.
class VendorRules {
  static final regNumber = RegExp(r'^(?:[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{4}|\d{2}BH\d{4}[A-Z]{1,2})$');
  static final ifsc = RegExp(r'^[A-Z]{4}0[A-Z0-9]{6}$');
  static final account = RegExp(r'^\d{9,18}$');
  static final policyNumber = RegExp(r'^[A-Z0-9/-]{6,30}$');
  static const nameMin = 2;
  static const auditMaxDays = 30;
  static String normaliseReg(String s) => s.toUpperCase().replaceAll(RegExp(r'[\s-]'), '');
  static String formatReg(String s) {
    final m = RegExp(r'^([A-Z]{2})(\d{1,2})([A-Z]{0,3})(\d{4})$').firstMatch(s);
    return m == null ? s : [m[1], m[2], m[3], m[4]].where((x) => x != null && x.isNotEmpty).join(' ');
  }
}

class SectionStatus {
  const SectionStatus(this.state, this.note);
  /// pending · filled (waiting for review) · changes (staff asked for a fix) · approved
  final String state;
  final String? note;
  bool get done => state == 'filled' || state == 'approved';
}

class VendorVehicle {
  const VendorVehicle(this.id, this.type, this.fuel, this.regNumber, this.purchaseDate, this.rc, this.insurance, this.audit, this.status);
  final String id, type, fuel, regNumber, purchaseDate, status;
  final ({String ownerName, String validTill, bool hasPhoto})? rc;
  final ({String insurer, String policyNumber, String validTill, bool hasPhoto})? insurance;
  final ({String date, String slot, String result, String? note})? audit;

  factory VendorVehicle.fromJson(Json j) {
    final rc = j['rc'] as Json?, ins = j['insurance'] as Json?, au = j['audit'] as Json?;
    return VendorVehicle(
      j['id'] as String, '${j['type']}', '${j['fuel']}', '${j['regNumber']}', '${j['purchaseDate']}',
      rc == null ? null : (ownerName: '${rc['ownerName']}', validTill: '${rc['validTill']}', hasPhoto: rc['hasPhoto'] == true),
      ins == null ? null : (insurer: '${ins['insurer']}', policyNumber: '${ins['policyNumber']}', validTill: '${ins['validTill']}', hasPhoto: ins['hasPhoto'] == true),
      au == null ? null : (date: '${au['date']}', slot: '${au['slot']}', result: '${au['result']}', note: au['note'] as String?),
      '${j['status']}',
    );
  }
}

class VendorApplication {
  const VendorApplication({
    required this.id,
    required this.status,
    required this.city,
    required this.hasPhoto,
    required this.bank,
    required this.vehicle,
    required this.sections,
    required this.fee,
    required this.paidAt,
    required this.agreementAt,
    required this.stickerRequestedAt,
    required this.stickerDoneAt,
    required this.submittedAt,
    required this.note,
  });

  /// draft · submitted · onboarding · active · rejected · blocked
  final String id, status;
  final String? city, note, paidAt, agreementAt, stickerRequestedAt, stickerDoneAt, submittedAt;
  final bool hasPhoto;
  final ({String holder, String ifsc, String accountLast4})? bank;
  final VendorVehicle? vehicle;
  final Map<String, SectionStatus> sections;
  final int fee;

  bool get editable => status == 'draft';
  bool get readyToSubmit => vendorSections.every((s) => sections[s]?.done ?? false);
  bool get anySentBack => sections.values.any((s) => s.state == 'changes');

  factory VendorApplication.fromJson(Json j) {
    final b = j['bank'] as Json?;
    final on = (j['onboarding'] as Json?) ?? const {};
    final secs = (j['sections'] as Json?) ?? const {};
    return VendorApplication(
      id: j['id'] as String,
      status: '${j['status']}',
      city: j['city'] as String?,
      hasPhoto: j['hasPhoto'] == true,
      bank: b == null ? null : (holder: '${b['holder']}', ifsc: '${b['ifsc']}', accountLast4: '${b['accountLast4']}'),
      vehicle: j['vehicle'] == null ? null : VendorVehicle.fromJson(j['vehicle'] as Json),
      sections: {
        for (final s in vendorSections)
          s: SectionStatus('${(secs[s] as Json?)?['state'] ?? 'pending'}', (secs[s] as Json?)?['note'] as String?),
      },
      fee: (on['fee'] as num?)?.round() ?? 0,
      paidAt: on['paidAt'] as String?,
      agreementAt: on['agreementAt'] as String?,
      stickerRequestedAt: on['stickerRequestedAt'] as String?,
      stickerDoneAt: on['stickerDoneAt'] as String?,
      submittedAt: j['submittedAt'] as String?,
      note: j['note'] as String?,
    );
  }
}
