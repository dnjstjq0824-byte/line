// HTTP contract client. Endpoint paths, headers and timeouts are byte-identical
// to the pre-renewal client: the backend route contract is frozen.
import 'dart:convert';

import 'package:http/http.dart' as http;

import '../legacy_tokens.dart';

class Api {
  String baseUrl = apiBase;
  String? token;

  Future<Map<String, dynamic>> call(
    String path, {
    String method = 'GET',
    Map<String, dynamic>? data,
  }) async {
    final uri = Uri.parse('$baseUrl$path');
    final headers = <String, String>{'Content-Type': 'application/json'};
    if (token != null) headers['Authorization'] = 'Bearer $token';

    late http.Response res;
    try {
      switch (method) {
        case 'POST':
          res = await http
              .post(uri, headers: headers, body: jsonEncode(data ?? {}))
              .timeout(const Duration(seconds: 15));
          break;
        case 'PUT':
          res = await http
              .put(uri, headers: headers, body: jsonEncode(data ?? {}))
              .timeout(const Duration(seconds: 15));
          break;
        case 'PATCH':
          res = await http
              .patch(uri, headers: headers, body: jsonEncode(data ?? {}))
              .timeout(const Duration(seconds: 15));
          break;
        case 'DELETE':
          res = await http.delete(uri, headers: headers).timeout(const Duration(seconds: 15));
          break;
        default:
          res = await http.get(uri, headers: headers).timeout(const Duration(seconds: 15));
      }
    } catch (e) {
      throw Exception('네트워크 연결 오류: $e');
    }

    final parsed = jsonDecode(utf8.decode(res.bodyBytes));
    if (parsed is! Map<String, dynamic>) throw Exception('유효하지 않은 응답 형식');
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw Exception(parsed['error'] ?? 'HTTP 오류: ${res.statusCode}');
    }
    return parsed;
  }
}
