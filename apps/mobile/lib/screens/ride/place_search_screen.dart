// Full-screen place picker (GET /places?q=). Saved places come first before the rider types.
// Pops with the chosen Place.
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/models.dart';
import '../../state/providers.dart';
import '../../theme/tokens.dart';
import '../../widgets/ui.dart';

IconData savedPlaceIcon(String kind) => switch (kind) {
      'home' => Icons.home_outlined,
      'work' => Icons.work_outline,
      _ => Icons.place_outlined,
    };

/// Signed-in rider's saved places (Home, Work...). Empty when signed out.
final savedPlacesProvider = FutureProvider<List<SavedPlace>>((ref) async {
  final id = ref.watch(userProvider.select((u) => u?.id));
  if (id == null) return const [];
  return ref.watch(apiProvider).savedPlaces();
});

class PlaceSearchScreen extends ConsumerStatefulWidget {
  const PlaceSearchScreen({super.key, required this.title, this.exclude});
  final String title;
  /// A place that can't be picked (the other end of the trip).
  final String? exclude;

  @override
  ConsumerState<PlaceSearchScreen> createState() => _PlaceSearchScreenState();
}

class _PlaceSearchScreenState extends ConsumerState<PlaceSearchScreen> {
  final _q = TextEditingController();
  Timer? _debounce;
  List<Place>? _results;
  String? _err;

  @override
  void initState() {
    super.initState();
    _search('');
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _q.dispose();
    super.dispose();
  }

  Future<void> _search(String q) async {
    try {
      final r = await ref.read(apiProvider).places(q);
      if (!mounted || _q.text.trim() != q) return;
      setState(() {
        _results = r.where((p) => p.id != widget.exclude).toList();
        _err = null;
      });
    } catch (e) {
      if (mounted) setState(() => _err = errorText(e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.qf;
    final browsing = _q.text.trim().isEmpty;
    final saved = browsing ? (ref.watch(savedPlacesProvider).value ?? const []).where((s) => s.place.id != widget.exclude).toList() : const <SavedPlace>[];
    return Scaffold(
      appBar: AppBar(title: Text(widget.title)),
      body: SafeArea(
        child: Constrained(
          child: Column(children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(Brand.gutter, 4, Brand.gutter, 8),
              child: TextField(
                controller: _q,
                autofocus: true,
                textInputAction: TextInputAction.search,
                decoration: InputDecoration(
                  prefixIcon: const Icon(Icons.search),
                  hintText: 'Search a landmark or area',
                  suffixIcon: _q.text.isEmpty
                      ? null
                      : IconButton(
                          tooltip: 'Clear',
                          icon: const Icon(Icons.close),
                          onPressed: () {
                            _q.clear();
                            setState(() {});
                            _search('');
                          }),
                ),
                onChanged: (v) {
                  setState(() {});
                  _debounce?.cancel();
                  _debounce = Timer(const Duration(milliseconds: 250), () => _search(v.trim()));
                },
              ),
            ),
            if (_err != null) Padding(padding: const EdgeInsets.symmetric(horizontal: Brand.gutter), child: ErrorBox(_err!, onRetry: () => _search(_q.text.trim()))),
            Expanded(
              child: _results == null
                  ? const Center(child: CircularProgressIndicator())
                  : ListView(children: [
                      for (final s in saved)
                        ListTile(
                          leading: Icon(savedPlaceIcon(s.kind), color: c.accent),
                          title: Text(s.label, style: const TextStyle(fontWeight: FontWeight.w600)),
                          subtitle: Text(s.place.name, style: TextStyle(color: c.fgSubtle)),
                          onTap: () => Navigator.pop(context, s.place),
                        ),
                      if (saved.isNotEmpty) Divider(color: c.border),
                      for (final p in _results!)
                        ListTile(
                          leading: Icon(Icons.place_outlined, color: c.fgSubtle),
                          title: Text(p.name),
                          subtitle: Text('${p.area}, Chennai', style: TextStyle(color: c.fgSubtle)),
                          onTap: () => Navigator.pop(context, p),
                        ),
                      if (_results!.isEmpty) const EmptyState(icon: Icons.search_off, title: 'No places match', message: 'Try a nearby landmark.'),
                    ]),
            ),
          ]),
        ),
      ),
    );
  }
}
