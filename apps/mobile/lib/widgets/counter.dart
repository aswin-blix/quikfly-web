// "Adults  −  2  +" stepper.
import 'package:flutter/material.dart';
import '../theme/tokens.dart';

class Counter extends StatelessWidget {
  const Counter({super.key, required this.label, required this.value, required this.onChanged, this.min = 0, this.max = 99});
  final String label;
  final int value, min, max;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    final c = context.qf;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(children: [
        Expanded(child: Text(label)),
        IconButton.outlined(
          tooltip: 'Fewer $label',
          visualDensity: VisualDensity.compact,
          onPressed: value > min ? () => onChanged(value - 1) : null,
          icon: const Icon(Icons.remove, size: 18),
        ),
        SizedBox(
          width: 36,
          child: Text('$value', textAlign: TextAlign.center, style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16, color: c.fgStrong)),
        ),
        IconButton.outlined(
          tooltip: 'More $label',
          visualDensity: VisualDensity.compact,
          onPressed: value < max ? () => onChanged(value + 1) : null,
          icon: const Icon(Icons.add, size: 18),
        ),
      ]),
    );
  }
}
