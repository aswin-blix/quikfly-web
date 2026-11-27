// Live rides (docs/driver-app-plan.md, step 4): the app declares it follows them, and a live ride
// parses with no driver while it searches, then with its captain and progress.
import 'package:flutter_test/flutter_test.dart';
import 'package:quikfly/api/models.dart';

Map<String, dynamic> _place(String id, double x, double y) => {'id': id, 'name': id, 'area': 'Chennai', 'x': x, 'y': y};

Map<String, dynamic> _ride({Map<String, dynamic>? driver, Map<String, dynamic>? live}) => {
      'id': 'RD1',
      'quote': {
        'option': {'id': 'mini', 'service': 'car', 'name': 'Mini', 'eta': '3 min', 'capacity': 4, 'perKm': 12, 'base': 50, 'image': '', 'models': ['Maruti Swift']},
        'fare': 250, 'distanceKm': 9.1, 'durationMin': 27, 'etaMin': 3, 'surge': 1,
      },
      'pickup': _place('p1', 62, 30),
      'drop': _place('p3', 44, 52),
      'driver': driver,
      'otp': '4826',
      'payment': 'upi',
      'scheduledFor': null,
      'stops': [],
      'live': live,
    };

void main() {
  test('every request says the app follows live rides', () {
    expect(ServiceKey.clientAccept, contains('services=parcel'));
    expect(ServiceKey.clientAccept, endsWith('; rides=live'));
  });

  test('a live ride searching for its captain has no driver yet', () {
    final r = Ride.fromJson(_ride(live: {'phase': 'searching', 'captain': null, 'etaMin': null}));
    expect(r.isLive, isTrue);
    expect(r.driver, isNull);
    expect(r.live!.phase, 'searching');
    expect(r.live!.hasCaptain, isFalse);
  });

  test('once a captain accepts, the ride carries them and where they are', () {
    final r = Ride.fromJson(_ride(
      driver: {'name': 'Smoke Vendor', 'rating': 5, 'trips': 0, 'vehicle': 'Maruti Swift', 'plate': 'TN 10 QF 1234', 'phone': '+91 7000000001'},
      live: {'phase': 'arriving', 'captain': {'x': 60, 'y': 31}, 'etaMin': 1},
    ));
    expect(r.driver!.plate, 'TN 10 QF 1234');
    expect(r.live!.captainX, 60);
    expect(r.live!.etaMin, 1);
  });

  test('a simulated ride has no live progress', () {
    final r = Ride.fromJson(_ride(driver: {'name': 'Arjun K', 'rating': 4.9, 'trips': 1200, 'vehicle': 'Maruti Swift', 'plate': 'TN 09 AB 1234', 'phone': '+91 9000000000'}));
    expect(r.isLive, isFalse);
    expect(r.driver!.name, 'Arjun K');
  });
}
