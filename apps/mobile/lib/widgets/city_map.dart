// Stylised demo map of Chennai, drawn in code (no paid maps, decision 2026-11-16).
// A port of apps/web/src/components/CityMap.tsx: same 0–100 coordinate space, same roads,
// rivers and pins, so a place sits in the same spot on the website and the app.
// Swap for a real map SDK after sign-off; the inputs (pickup, drop, vehicle) stay the same.
import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../api/models.dart';
import '../theme/tokens.dart';

typedef Pt = Offset;

Offset _control(Pt a, Pt b) {
  final mx = (a.dx + b.dx) / 2, my = (a.dy + b.dy) / 2;
  final dx = b.dx - a.dx, dy = b.dy - a.dy;
  return Offset(mx - dy * 0.25, my + dx * 0.25);
}

/// Point on the curved route between a and b at t (0..1).
Pt routePoint(Pt a, Pt b, double t) {
  final c = _control(a, b);
  final u = 1 - t;
  return Offset(u * u * a.dx + 2 * u * t * c.dx + t * t * b.dx, u * u * a.dy + 2 * u * t * c.dy + t * t * b.dy);
}

/// Where the simulated driver starts before heading to the pickup.
Pt driverStartFor(Pt pickup) => Offset(math.max(4, pickup.dx - 14), math.min(96, pickup.dy + 12));

/// `arrived` and `unmatched` come only from a live ride (the server); simulated rides go arriving → ontrip → done.
enum RidePhase { plan, searching, arriving, arrived, ontrip, done, unmatched }

/// Point on the route through [points] (pickup, stops…, drop) at t: shared out by leg length (as the website).
Pt routeVia(List<Pt> points, double t) {
  if (points.length < 2) return points.first;
  final lens = [for (var i = 1; i < points.length; i++) (points[i] - points[i - 1]).distance];
  final total = lens.fold<double>(0, (a, b) => a + b);
  var left = t.clamp(0.0, 1.0) * (total == 0 ? 1 : total);
  for (var i = 0; i < lens.length; i++) {
    if (left <= lens[i] || i == lens.length - 1) return routePoint(points[i], points[i + 1], lens[i] == 0 ? 1 : math.min(1, left / lens[i]));
    left -= lens[i];
  }
  return points.last;
}

/// Simulated vehicle position for a phase, t = progress through that phase.
Pt vehiclePosition(RidePhase phase, Pt pickup, Pt drop, double t, [List<Pt> stops = const []]) {
  if (phase == RidePhase.done) return drop;
  if (phase == RidePhase.ontrip) return routeVia([pickup, ...stops, drop], t);
  final s = driverStartFor(pickup);
  return Offset(s.dx + (pickup.dx - s.dx) * t, s.dy + (pickup.dy - s.dy) * t);
}

Pt placePt(Place p) => Offset(p.x, p.y);

class CityMap extends StatefulWidget {
  const CityMap({
    super.key,
    required this.places,
    this.pickup,
    this.drop,
    this.stops = const [],
    this.vehicle,
    this.vehicleFrom,
    this.showRoute = false,
    this.searching = false,
    this.bike = false,
  });
  final List<Place> places;
  final Place? pickup, drop;
  final List<Place> stops;
  final Pt? vehicle, vehicleFrom;
  final bool showRoute, searching, bike;

  @override
  State<CityMap> createState() => _CityMapState();
}

class _CityMapState extends State<CityMap> with SingleTickerProviderStateMixin {
  late final _pulse = AnimationController(vsync: this, duration: const Duration(milliseconds: 1600));

  @override
  void initState() {
    super.initState();
    if (widget.searching) _pulse.repeat();
  }

  @override
  void didUpdateWidget(CityMap old) {
    super.didUpdateWidget(old);
    if (widget.searching && !_pulse.isAnimating) _pulse.repeat();
    if (!widget.searching && _pulse.isAnimating) _pulse.stop();
  }

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.qf;
    return ClipRRect(
      borderRadius: BorderRadius.circular(Brand.radiusPanel),
      child: Stack(children: [
        Positioned.fill(
          child: DecoratedBox(
            decoration: BoxDecoration(color: c.mapBg, border: Border.all(color: c.border), borderRadius: BorderRadius.circular(Brand.radiusPanel)),
            child: AnimatedBuilder(
              animation: _pulse,
              builder: (_, _) => CustomPaint(
                painter: _MapPainter(
                  colors: c,
                  places: widget.places,
                  pickup: widget.pickup,
                  drop: widget.drop,
                  stops: widget.stops,
                  vehicle: widget.vehicle,
                  vehicleFrom: widget.vehicleFrom,
                  showRoute: widget.showRoute,
                  pulse: widget.searching ? _pulse.value : null,
                  bike: widget.bike,
                ),
              ),
            ),
          ),
        ),
        Positioned(
          left: 10,
          bottom: 10,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(color: c.bg.withValues(alpha: 0.75), borderRadius: BorderRadius.circular(6)),
            child: Text('Demo map · Chennai', style: TextStyle(color: c.fgMuted, fontSize: 10.5)),
          ),
        ),
      ]),
    );
  }
}

class _MapPainter extends CustomPainter {
  _MapPainter({
    required this.colors,
    required this.places,
    this.pickup,
    this.drop,
    this.stops = const [],
    this.vehicle,
    this.vehicleFrom,
    required this.showRoute,
    this.pulse,
    required this.bike,
  });
  final QfColors colors;
  final List<Place> places;
  final Place? pickup, drop;
  final List<Place> stops;
  final Pt? vehicle, vehicleFrom;
  final bool showRoute, bike;
  final double? pulse;

  // Same paths as the website's SVG (0–100 space).
  static const _roads = [
    [Offset(0, 50), Offset(25, 48), Offset(50, 52), Offset(88, 46)],
    [Offset(30, 0), Offset(34, 30), Offset(40, 60), Offset(30, 100)],
    [Offset(60, 0), Offset(58, 30), Offset(54, 60), Offset(58, 100)],
    [Offset(10, 100), Offset(30, 70), Offset(60, 40), Offset(88, 20)],
    [Offset(45, 55), Offset(60, 70), Offset(75, 85), Offset(84, 100)],
    [Offset(0, 20), Offset(30, 25), Offset(60, 22), Offset(88, 28)],
  ];

  @override
  void paint(Canvas canvas, Size size) {
    // Camera: cover the box with the 100×100 map (like SVG "slice"), then zoom out just enough
    // to keep pickup, drop and the vehicle in view, centred on them. Wide phone boxes would
    // otherwise crop places near the top or bottom edge.
    final focus = <Offset>[
      if (pickup != null) placePt(pickup!),
      if (drop != null) placePt(drop!),
      // The route's bulge, so the camera stays still while the vehicle drives along it.
      if (pickup != null && drop != null) routePoint(placePt(pickup!), placePt(drop!), 0.5),
      for (final s in stops) placePt(s),
      ?vehicleFrom,
    ];
    var s = math.max(size.width, size.height) / 100;
    var centre = const Offset(50, 50);
    if (focus.isNotEmpty) {
      final xs = focus.map((p) => p.dx), ys = focus.map((p) => p.dy);
      final box = Rect.fromLTRB(xs.reduce(math.min), ys.reduce(math.min), xs.reduce(math.max), ys.reduce(math.max)).inflate(9);
      final fit = math.min(size.width / box.width, size.height / box.height);
      s = math.max(math.min(s, fit), math.min(size.width, size.height) / 100);
      centre = box.center;
    }
    // Keep the map covering the box where it can (no empty margins unless zoomed right out).
    double clampAxis(double c, double viewport) {
      final half = viewport / s / 2;
      return half >= 50 ? 50 : c.clamp(half, 100 - half);
    }
    centre = Offset(clampAxis(centre.dx, size.width), clampAxis(centre.dy, size.height));
    canvas.save();
    canvas.clipRect(Offset.zero & size);
    canvas.translate(size.width / 2 - centre.dx * s, size.height / 2 - centre.dy * s);
    canvas.scale(s);

    final grid = Paint()
      ..color = colors.mapGrid
      ..strokeWidth = 0.35;
    for (double v = 0; v <= 100; v += 6) {
      canvas.drawLine(Offset(v, 0), Offset(v, 100), grid);
      canvas.drawLine(Offset(0, v), Offset(100, v), grid);
    }

    // Bay of Bengal
    final sea = Path()
      ..moveTo(88, 0)
      ..cubicTo(86, 20, 90, 35, 87, 50)
      ..cubicTo(84, 65, 92, 80, 95, 100)
      ..lineTo(100, 100)
      ..lineTo(100, 0)
      ..close();
    canvas.drawPath(sea, Paint()..color = colors.mapWater);

    final park = Paint()..color = colors.mapPark;
    canvas.drawCircle(const Offset(40, 70), 5, park);
    canvas.drawCircle(const Offset(36, 22), 3, park);

    Path curve(List<Offset> p) => Path()
      ..moveTo(p[0].dx, p[0].dy)
      ..cubicTo(p[1].dx, p[1].dy, p[2].dx, p[2].dy, p[3].dx, p[3].dy);
    Paint stroke(Color c, double w) => Paint()
      ..color = c
      ..strokeWidth = w
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;

    final river = stroke(colors.mapWater, 1.5);
    canvas.drawPath(Path()..moveTo(0, 33)..cubicTo(20, 30, 40, 40, 60, 36)..cubicTo(80, 32, 80, 40, 88, 42), river);
    canvas.drawPath(Path()..moveTo(10, 70)..cubicTo(30, 62, 55, 66, 72, 62)..cubicTo(89, 58, 84, 60, 88, 60), river);

    for (final r in _roads) {
      canvas.drawPath(curve(r), stroke(colors.mapRoad, 1.3));
    }
    for (final r in [_roads[0], _roads[1], _roads[3]]) {
      _dashed(canvas, curve(r), stroke(colors.mapRoadLine, 0.3), 1.5, 1.5);
    }

    // Landmarks
    for (final p in places) {
      if (p.id == pickup?.id || p.id == drop?.id || stops.any((s) => s.id == p.id)) continue;
      canvas.drawCircle(Offset(p.x, p.y), 0.7, Paint()..color = colors.mapLandmark.withValues(alpha: 0.6));
      _text(canvas, p.name.split(' ').first, Offset(p.x + 1.4, p.y - 1.3), 2.2, colors.mapLandmarkText.withValues(alpha: 0.75));
    }

    final pu = pickup, dr = drop;
    if (pu != null && dr != null && showRoute) {
      // One curved leg from each point to the next: pickup → stops → drop.
      final pts = [placePt(pu), for (final s in stops) placePt(s), placePt(dr)];
      final route = Path()..moveTo(pts.first.dx, pts.first.dy);
      for (var i = 1; i < pts.length; i++) {
        final c = _control(pts[i - 1], pts[i]);
        route.quadraticBezierTo(c.dx, c.dy, pts[i].dx, pts[i].dy);
      }
      canvas.drawPath(route, stroke(colors.accent.withValues(alpha: 0.25), 2.2));
      _dashed(canvas, route, stroke(colors.accent, 0.8), 2, 2);
    }
    if (vehicleFrom != null && pu != null) {
      _dashed(canvas, Path()..moveTo(vehicleFrom!.dx, vehicleFrom!.dy)..lineTo(pu.x, pu.y), stroke(colors.success.withValues(alpha: 0.5), 0.5), 1, 1.2);
    }

    if (pu != null) {
      final at = placePt(pu);
      if (pulse != null) {
        canvas.drawCircle(at, 2 + 6 * pulse!, Paint()..color = colors.success.withValues(alpha: 0.4 * (1 - pulse!)));
      }
      canvas.drawCircle(at, 2, Paint()..color = colors.success);
      canvas.drawCircle(at, 2, stroke(colors.mapPinOutline, 0.8));
      _label(canvas, at, pu.name, colors.success, dr != null && pu.y >= dr.y ? 5.5 : -5.5);
    }
    if (dr != null) {
      final at = placePt(dr);
      final r = Rect.fromCenter(center: at, width: 3.6, height: 3.6);
      canvas.drawRect(r, Paint()..color = Brand.gold);
      canvas.drawRect(r, stroke(colors.mapPinOutline, 0.8));
      _label(canvas, at, dr.name, Brand.gold, pu != null && dr.y <= pu.y ? -5.5 : 5.5);
    }
    // Stops: numbered pins.
    for (var i = 0; i < stops.length; i++) {
      final at = placePt(stops[i]);
      canvas.drawCircle(at, 2, Paint()..color = colors.accent);
      canvas.drawCircle(at, 2, stroke(colors.mapPinOutline, 0.7));
      _text(canvas, '${i + 1}', Offset(at.dx - 0.7, at.dy - 1.4), 2.2, Brand.onGold);
      _label(canvas, at, stops[i].name, colors.accent, pu != null && stops[i].y >= pu.y ? 5.5 : -5.5);
    }
    if (vehicle != null) _vehicle(canvas, vehicle!);

    canvas.restore();
  }

  void _vehicle(Canvas canvas, Pt at) {
    canvas.save();
    canvas.translate(at.dx, at.dy);
    canvas.drawCircle(Offset.zero, 3.6, Paint()..color = Brand.gold.withValues(alpha: 0.25));
    canvas.drawCircle(Offset.zero, 3.2, Paint()..color = colors.mapPinOutline);
    canvas.drawCircle(Offset.zero, 3.2, Paint()..color = Brand.gold..style = PaintingStyle.stroke..strokeWidth = 0.6);
    final gold = Paint()..color = Brand.gold;
    if (bike) {
      final line = Paint()
        ..color = Brand.gold
        ..style = PaintingStyle.stroke
        ..strokeWidth = 0.45;
      canvas.drawCircle(const Offset(-1.2, 0.6), 0.9, line);
      canvas.drawCircle(const Offset(1.2, 0.6), 0.9, line);
      canvas.drawPath(Path()..moveTo(-1.2, 0.6)..lineTo(0, -1)..lineTo(1.2, 0.6)..moveTo(0, -1)..lineTo(0.8, -1.2), line);
    } else {
      canvas.drawRRect(RRect.fromRectAndRadius(const Rect.fromLTWH(-1.7, -0.9, 3.4, 1.6), const Radius.circular(0.5)), gold);
      canvas.drawRRect(RRect.fromRectAndRadius(const Rect.fromLTWH(-1, -1.6, 2, 0.9), const Radius.circular(0.3)), gold);
      for (final x in [-1.0, 1.0]) {
        canvas.drawCircle(Offset(x, 0.8), 0.45, Paint()..color = colors.mapPinOutline);
      }
    }
    canvas.restore();
  }

  void _label(Canvas canvas, Pt p, String text, Color color, double dy) {
    final t = text.length > 26 ? '${text.substring(0, 25)}…' : text;
    final tp = _layout(t, 2.4, colors.mapLabelText, FontWeight.w600);
    final w = tp.width + 3;
    final x = math.min(99 - w, math.max(1.0, p.dx - w / 2));
    final y = p.dy + dy;
    final r = RRect.fromRectAndRadius(Rect.fromLTWH(x, y - 2.5, w, 5), const Radius.circular(1.2));
    canvas.drawRRect(r, Paint()..color = colors.mapLabelBg);
    canvas.drawRRect(r, Paint()..color = color..style = PaintingStyle.stroke..strokeWidth = 0.3);
    tp.paint(canvas, Offset(x + 1.5, y - tp.height / 2));
  }

  TextPainter _layout(String s, double size, Color color, [FontWeight weight = FontWeight.w400]) => TextPainter(
        text: TextSpan(text: s, style: TextStyle(fontFamily: Brand.bodyFont, fontSize: size, color: color, fontWeight: weight, height: 1)),
        textDirection: TextDirection.ltr,
      )..layout();

  void _text(Canvas canvas, String s, Offset at, double size, Color color) => _layout(s, size, color).paint(canvas, at);

  void _dashed(Canvas canvas, Path path, Paint paint, double dash, double gap) {
    for (final m in path.computeMetrics()) {
      for (double d = 0; d < m.length; d += dash + gap) {
        canvas.drawPath(m.extractPath(d, math.min(d + dash, m.length)), paint);
      }
    }
  }

  @override
  bool shouldRepaint(_MapPainter old) =>
      old.pickup != pickup ||
      old.drop != drop ||
      old.stops != stops ||
      old.vehicle != vehicle ||
      old.vehicleFrom != vehicleFrom ||
      old.showRoute != showRoute ||
      old.pulse != pulse ||
      old.colors != colors ||
      old.places != places;
}
