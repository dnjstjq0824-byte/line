import 'package:flutter/material.dart';

import '../design/v3.dart';

/// Harbor table: horizontally scrolling data table with quiet header wash.
class HarborTable extends StatelessWidget {
  const HarborTable({super.key, required this.columns, required this.rows});

  final List<String> columns;
  final List<List<String>> rows;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final channel = dark ? HarborDark.channel : HarborLight.channel;
    TableRow cell(List<String> values, {required bool header}) => TableRow(
          decoration: header
              ? BoxDecoration(color: dark ? HarborDark.chart : HarborLight.chart)
              : null,
          children: values
              .map((v) => Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                    child: Text(
                      v,
                      style: header
                          ? Theme.of(context).textTheme.bodySmall?.copyWith(fontWeight: FontWeight.w700)
                          : Theme.of(context).textTheme.bodyMedium,
                    ),
                  ))
              .toList(),
        );
    return DecoratedBox(
      decoration: BoxDecoration(
        color: dark ? HarborDark.surface : HarborLight.surface,
        borderRadius: BorderRadius.circular(HarborRadius.card),
        border: Border.all(color: channel),
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(HarborRadius.card),
        child: SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Table(
            defaultColumnWidth: const IntrinsicColumnWidth(),
            border: TableBorder(horizontalInside: BorderSide(color: channel)),
            children: [
              cell(columns, header: true),
              for (final r in rows) cell(r, header: false),
            ],
          ),
        ),
      ),
    );
  }
}
