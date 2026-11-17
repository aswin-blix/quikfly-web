// Shared building blocks. Screens compose these instead of styling from scratch,
// so spacing, colours and states (loading, error, empty) look the same everywhere.
import 'package:flutter/material.dart';
import '../api/api.dart';
import '../theme/tokens.dart';

/// A bordered surface: the app's card.
class Panel extends StatelessWidget {
  const Panel({super.key, required this.child, this.padding = const EdgeInsets.all(16), this.onTap, this.highlighted = false});
  final Widget child;
  final EdgeInsetsGeometry padding;
  final VoidCallback? onTap;
  /// Gold outline and tint, for the selected option or the wallet card.
  final bool highlighted;

  @override
  Widget build(BuildContext context) {
    final c = context.qf;
    final radius = BorderRadius.circular(Brand.radiusPanel);
    return Material(
      color: highlighted ? Color.alphaBlend(Brand.gold.withValues(alpha: 0.07), c.surface) : c.surface,
      shape: RoundedRectangleBorder(borderRadius: radius, side: BorderSide(color: highlighted ? c.accent.withValues(alpha: 0.55) : c.border)),
      clipBehavior: Clip.antiAlias,
      child: InkWell(onTap: onTap, child: Padding(padding: padding, child: child)),
    );
  }
}

/// Small gold eyebrow + big title, used at the top of sections.
class SectionTitle extends StatelessWidget {
  const SectionTitle(this.title, {super.key, this.eyebrow, this.action});
  final String title;
  final String? eyebrow;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final c = context.qf;
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            if (eyebrow != null) ...[
              Text(eyebrow!.toUpperCase(), style: TextStyle(color: c.accent, fontSize: 11.5, fontWeight: FontWeight.w700, letterSpacing: 1.4)),
              const SizedBox(height: 4),
            ],
            Text(title, style: Theme.of(context).textTheme.headlineSmall),
          ]),
        ),
        ?action,
      ]),
    );
  }
}

/// Gold primary button that shows a spinner while [loading].
class GoldButton extends StatelessWidget {
  const GoldButton({super.key, required this.label, this.onPressed, this.loading = false, this.icon, this.expand = true});
  final String label;
  final VoidCallback? onPressed;
  final bool loading;
  final IconData? icon;
  final bool expand;

  @override
  Widget build(BuildContext context) {
    final child = loading
        ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.4, color: Brand.onGold))
        : Row(mainAxisSize: MainAxisSize.min, children: [
            Flexible(child: Text(label, overflow: TextOverflow.ellipsis)),
            if (icon != null) ...[const SizedBox(width: 8), Icon(icon, size: 19)],
          ]);
    final b = FilledButton(onPressed: loading ? () {} : onPressed, child: child);
    return expand ? SizedBox(width: double.infinity, child: b) : b;
  }
}

/// Red message box for a failed action or load, with an optional retry.
class ErrorBox extends StatelessWidget {
  const ErrorBox(this.message, {super.key, this.onRetry});
  final String message;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    final c = context.qf;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: c.danger.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(Brand.radiusField),
        border: Border.all(color: c.danger.withValues(alpha: 0.35)),
      ),
      child: Row(children: [
        Icon(Icons.error_outline, color: c.danger, size: 20),
        const SizedBox(width: 10),
        Expanded(child: Text(message, style: TextStyle(color: c.danger))),
        if (onRetry != null) TextButton(onPressed: onRetry, child: const Text('Retry')),
      ]),
    );
  }
}

/// Inline error text under a form.
class FormError extends StatelessWidget {
  const FormError(this.message, {super.key});
  final String? message;
  @override
  Widget build(BuildContext context) => message == null || message!.isEmpty
      ? const SizedBox.shrink()
      : Padding(padding: const EdgeInsets.only(top: 4, bottom: 8), child: Text(message!, style: TextStyle(color: context.qf.danger)));
}

/// Centered icon + message for empty lists.
class EmptyState extends StatelessWidget {
  const EmptyState({super.key, required this.icon, required this.title, this.message, this.action});
  final IconData icon;
  final String title;
  final String? message;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final c = context.qf;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 40, horizontal: 24),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Container(
          width: 64,
          height: 64,
          decoration: BoxDecoration(shape: BoxShape.circle, color: Brand.gold.withValues(alpha: 0.12)),
          child: Icon(icon, color: c.accent, size: 30),
        ),
        const SizedBox(height: 14),
        Text(title, textAlign: TextAlign.center, style: Theme.of(context).textTheme.titleMedium),
        if (message != null) ...[const SizedBox(height: 6), Text(message!, textAlign: TextAlign.center, style: TextStyle(color: c.fgMuted))],
        if (action != null) ...[const SizedBox(height: 18), action!],
      ]),
    );
  }
}

/// Grey placeholder block shown while data loads.
class Skeleton extends StatelessWidget {
  const Skeleton({super.key, this.height = 80, this.width = double.infinity, this.radius = Brand.radiusPanel});
  final double height, width, radius;
  @override
  Widget build(BuildContext context) =>
      Container(height: height, width: width, decoration: BoxDecoration(color: context.qf.skeleton, borderRadius: BorderRadius.circular(radius)));
}

/// A rounded label: status badges, tags.
class Pill extends StatelessWidget {
  const Pill(this.label, {super.key, this.color, this.icon});
  final String label;
  final Color? color;
  final IconData? icon;
  @override
  Widget build(BuildContext context) {
    final col = color ?? context.qf.accent;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3.5),
      decoration: BoxDecoration(
          color: col.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(99), border: Border.all(color: col.withValues(alpha: 0.35))),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        if (icon != null) ...[Icon(icon, size: 13, color: col), const SizedBox(width: 4)],
        Text(label, style: TextStyle(color: col, fontSize: 11.5, fontWeight: FontWeight.w600)),
      ]),
    );
  }
}

/// A label / value row for summaries and price breakdowns.
class KeyValue extends StatelessWidget {
  const KeyValue(this.label, this.value, {super.key, this.bold = false, this.valueColor});
  final String label, value;
  final bool bold;
  final Color? valueColor;
  @override
  Widget build(BuildContext context) {
    final c = context.qf;
    final style = TextStyle(fontWeight: bold ? FontWeight.w700 : FontWeight.w400, fontSize: bold ? 16 : 14.5);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Expanded(child: Text(label, style: style.copyWith(color: bold ? c.fgStrong : c.fgMuted))),
        const SizedBox(width: 12),
        Flexible(child: Text(value, textAlign: TextAlign.right, style: style.copyWith(color: valueColor ?? (bold ? c.fgStrong : c.fg)))),
      ]),
    );
  }
}

/// Short message at the bottom of the screen.
void toast(BuildContext context, String message) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(message)));
}

/// Turns any error into a sentence for the user.
String errorText(Object e) => e is ApiException ? e.message : 'Something went wrong. Please try again.';

/// Asks a yes/no question. Returns true when confirmed.
Future<bool> confirm(BuildContext context, {required String title, required String message, String yes = 'Yes', bool danger = false}) async {
  final c = context.qf;
  final r = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text(title),
      content: Text(message),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text('Keep', style: TextStyle(color: c.fgMuted))),
        TextButton(onPressed: () => Navigator.pop(ctx, true), child: Text(yes, style: TextStyle(color: danger ? c.danger : c.accent))),
      ],
    ),
  );
  return r ?? false;
}

/// Limits content width on tablets so lines stay readable; full width on phones.
class Constrained extends StatelessWidget {
  const Constrained({super.key, required this.child, this.maxWidth = 720});
  final Widget child;
  final double maxWidth;
  @override
  Widget build(BuildContext context) => Center(child: ConstrainedBox(constraints: BoxConstraints(maxWidth: maxWidth), child: child));
}

/// Standard padded, scrollable screen body capped at a readable width.
class ScreenList extends StatelessWidget {
  const ScreenList({super.key, required this.children, this.onRefresh, this.padding});
  final List<Widget> children;
  final Future<void> Function()? onRefresh;
  final EdgeInsets? padding;
  @override
  Widget build(BuildContext context) {
    final list = ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: padding ?? const EdgeInsets.fromLTRB(Brand.gutter, 8, Brand.gutter, 32),
      children: [for (final w in children) Constrained(child: w)],
    );
    return onRefresh == null ? list : RefreshIndicator(onRefresh: onRefresh!, child: list);
  }
}
