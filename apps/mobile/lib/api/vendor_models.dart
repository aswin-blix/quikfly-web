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
  const VendorVehicle(this.id, this.type, this.fuel, this.regNumber, this.purchaseDate, this.rc, this.insurance, this.audit, this.status,
      {this.reviewNote, this.blockedReason, this.docsPending = false, this.driverId});

  /// pending (in the application) · draft · submitted · approved (waiting for sticker) · active · inactive · blocked · rejected
  final String id, type, fuel, regNumber, purchaseDate, status;
  final String? reviewNote, blockedReason, driverId;

  /// A renewed RC or insurance is waiting for QuikFly to check it.
  final bool docsPending;
  bool get live => status == 'active' || status == 'inactive' || status == 'blocked';
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
      reviewNote: j['reviewNote'] as String?,
      blockedReason: j['blockedReason'] as String?,
      docsPending: j['docsPending'] == true,
      driverId: j['driverId'] as String?,
    );
  }
}

/// A driver the partner registered (VendorDriver in packages/shared).
class VendorDriver {
  const VendorDriver({
    required this.id,
    required this.name,
    required this.phone,
    required this.dlNumber,
    required this.dlValidTill,
    required this.hasDlPhoto,
    required this.status,
    this.policeVerifiedAt,
    this.reviewNote,
    this.blockedReason,
    this.docsPending = false,
    this.vehicleId,
    this.self = false,
    this.captainStatus,
    this.captainSeenAt,
  });

  /// submitted · active · rejected · blocked
  final String id, name, phone, dlNumber, dlValidTill, status;

  /// In QuikFly Captain (CaptainLiveStatus: onRide · online · silent · offline); null until they sign in.
  final String? captainStatus;
  final String? captainSeenAt;
  final bool hasDlPhoto, docsPending, self;
  final String? policeVerifiedAt, reviewNote, blockedReason, vehicleId;

  factory VendorDriver.fromJson(Json j) => VendorDriver(
        id: j['id'] as String,
        name: '${j['name']}',
        phone: '${j['phone']}',
        dlNumber: '${j['dlNumber']}',
        dlValidTill: '${j['dlValidTill']}',
        hasDlPhoto: j['hasDlPhoto'] == true,
        status: '${j['status']}',
        policeVerifiedAt: j['policeVerifiedAt'] as String?,
        reviewNote: j['reviewNote'] as String?,
        blockedReason: j['blockedReason'] as String?,
        docsPending: j['docsPending'] == true,
        vehicleId: j['vehicleId'] as String?,
        self: j['self'] == true,
        captainStatus: (j['captain'] as Json?)?['status'] as String?,
        captainSeenAt: (j['captain'] as Json?)?['seenAt'] as String?,
      );
}

/// CAPTAIN_STATUS_LABEL in packages/shared/src/driver.ts.
const captainStatusLabel = {'onRide': 'On a ride', 'online': 'Online', 'silent': 'Not heard from', 'offline': 'Offline'};

/// GET /vendor/fleet: every vehicle and driver.
class VendorFleet {
  const VendorFleet(this.vehicles, this.drivers);
  final List<VendorVehicle> vehicles;
  final List<VendorDriver> drivers;
  factory VendorFleet.fromJson(Json j) => VendorFleet(
        ((j['vehicles'] as List?) ?? const []).map((x) => VendorVehicle.fromJson(x as Json)).toList(),
        ((j['drivers'] as List?) ?? const []).map((x) => VendorDriver.fromJson(x as Json)).toList(),
      );
  VendorVehicle? vehicle(String? id) => vehicles.where((v) => v.id == id).firstOrNull;
  VendorDriver? driver(String? id) => drivers.where((d) => d.id == id).firstOrNull;
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


// ── Trips and money (amounts in paise; see packages/shared/src/vendor.ts) ──

int _p(dynamic v) => (v as num?)?.round() ?? 0;

/// "₹1,234.50" from paise.
String inrPaise(int paise) {
  final neg = paise < 0;
  final abs = paise.abs();
  final rupees = abs ~/ 100;
  final digits = rupees.toString();
  // Indian grouping: last 3 digits, then pairs.
  String grouped;
  if (digits.length <= 3) {
    grouped = digits;
  } else {
    final head = digits.substring(0, digits.length - 3);
    final tail = digits.substring(digits.length - 3);
    final parts = <String>[];
    for (var i = head.length; i > 0; i -= 2) {
      parts.insert(0, head.substring(i - 2 < 0 ? 0 : i - 2, i));
    }
    grouped = '${parts.join(',')},$tail';
  }
  return '${neg ? '−' : ''}₹$grouped.${(abs % 100).toString().padLeft(2, '0')}';
}

class VendorTrip {
  const VendorTrip(this.j);
  final Json j;
  String get bookingId => j['bookingId'] as String;
  String get status => '${j['status']}';
  String get service => '${j['service']}';
  String get title => '${j['title']}';
  String get subtitle => '${j['subtitle'] ?? ''}';
  DateTime get createdAt => DateTime.tryParse('${j['createdAt']}')?.toLocal() ?? DateTime.now();
  DateTime? get startsAt => j['startsAt'] == null ? null : DateTime.tryParse('${j['startsAt']}')?.toLocal();
  DateTime? get completedAt => j['completedAt'] == null ? null : DateTime.tryParse('${j['completedAt']}')?.toLocal();
  String? get regNumber => j['regNumber'] as String?;
  String? get driverName => j['driverName'] as String?;
  String? get driverId => j['driverId'] as String?;
  String get payment => '${j['payment']}';
  int get gross => _p(j['grossPaise']);
  int get discount => _p(j['discountPaise']);
  int get gst => _p(j['gstPaise']);
  int get fare => _p(j['farePaise']);
  int get commission => _p(j['commissionPaise']);
  int get tds => _p(j['tdsPaise']);
  int get earning => _p(j['earningPaise']);
  bool get estimate => j['estimate'] == true;
  /// What the customer actually paid (after coupons and credits).
  int get collected => gross - discount;
}

class VendorTripSummary {
  const VendorTripSummary(this.j);
  final Json j;
  Json get _r => (j['revenue'] as Json?) ?? const {};
  int get trips => _p(_r['trips']);
  int get gross => _p(_r['grossPaise']);
  int get cash => _p(_r['cashPaise']);
  int get online => _p(_r['onlinePaise']);
  int get discount => _p(_r['discountPaise']);
  int get earning => _p(_r['earningPaise']);
  List<({String id, String reg, int trips, int earning})> get vehicles => [
        for (final v in (j['vehicles'] as List?) ?? const []) (id: '${v['vehicleId']}', reg: '${v['regNumber']}', trips: _p(v['trips']), earning: _p(v['earningPaise'])),
      ];
  List<({String id, String name, int trips, int earning})> get drivers => [
        for (final d in (j['drivers'] as List?) ?? const []) (id: '${d['driverId']}', name: '${d['name']}', trips: _p(d['trips']), earning: _p(d['earningPaise'])),
      ];
}

const ledgerLabel = {
  'earning': 'Trip earning',
  'cash': 'Cash your driver collected',
  'fee': 'Daily fee',
  'penalty': 'Ride cancelled by your driver',
  'payout': 'Paid to your bank',
  'payment': 'You paid QuikFly',
  'adjustment': 'Adjustment',
};

class VendorPayout {
  const VendorPayout(this.j);
  final Json j;
  String get id => j['id'] as String;
  int get amount => _p(j['amountPaise']);
  /// requested · paid · rejected
  String get status => '${j['status']}';
  String? get reference => j['reference'] as String?;
  String? get note => j['note'] as String?;
  DateTime get requestedAt => DateTime.tryParse('${j['requestedAt']}')?.toLocal() ?? DateTime.now();
}

class VendorMoney {
  const VendorMoney(this.j);
  final Json j;
  /// Positive: QuikFly owes the partner. Negative: the partner owes QuikFly.
  int get balance => _p(j['balancePaise']);
  int get minPayout => _p(j['minPayoutPaise']);
  VendorPayout? get pending => j['pendingPayout'] == null ? null : VendorPayout(j['pendingPayout'] as Json);
  List<({String month, int trips, int gross, int commission, int fee, int tds, int earning, int cash})> get statements => [
        for (final s in (j['statements'] as List?) ?? const [])
          (month: '${s['month']}', trips: _p(s['trips']), gross: _p(s['grossPaise']), commission: _p(s['commissionPaise']), fee: _p(s['feePaise']), tds: _p(s['tdsPaise']), earning: _p(s['earningPaise']), cash: _p(s['cashPaise'])),
      ];
  List<({String id, String kind, int amount, String note, DateTime at})> get entries => [
        for (final e in (j['entries'] as List?) ?? const [])
          (id: '${e['id']}', kind: '${e['kind']}', amount: _p(e['amountPaise']), note: '${e['note']}', at: DateTime.tryParse('${e['createdAt']}')?.toLocal() ?? DateTime.now()),
      ];
  List<VendorPayout> get payouts => [for (final p in (j['payouts'] as List?) ?? const []) VendorPayout(p as Json)];
}
