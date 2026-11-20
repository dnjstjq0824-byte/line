// F5: avatar/cover arrive as an R2 serving path (/api/v1/users/...),
// an absolute URL, or a legacy inline data: URL.
import 'dart:convert';

import 'package:flutter/widgets.dart';

ImageProvider? profilePhotoImage(String baseUrl, String url, {String? token}) {
  if (url.startsWith('data:image/')) {
    final i = url.indexOf('base64,');
    if (i < 0) return null;
    try {
      return MemoryImage(base64Decode(url.substring(i + 7)));
    } catch (_) {
      return null;
    }
  }
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return NetworkImage(url);
  }
  // Versioned paths (?v=) load without a token; older bare paths need the
  // bearer header or the server answers 401 and the photo never shows.
  if (url.startsWith('/')) {
    return NetworkImage('$baseUrl$url',
        headers: (token == null || token.isEmpty)
            ? null
            : {'Authorization': 'Bearer $token'});
  }
  return null;
}
