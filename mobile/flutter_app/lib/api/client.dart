// HTTP contract client. Endpoint paths, headers and timeouts are byte-identical
// to the pre-renewal client: the backend route contract is frozen.
//
// Auth: access tokens live 15 minutes. On a 401 from a non-auth route the
// client spends the stored refresh token (singleflight: concurrent 401s share
// one refresh, because refresh tokens are single-use and reuse kills the
// grant), persists the rotated pair, and retries the request once. A failed
// refresh clears local state so the user re-logs in. Mirrors user-web
// store/session.ts, except the refresh token travels in the JSON body (there
// is no cookie jar on mobile).
import 'dart:convert';

import 'package:http/http.dart' as http;

import '../legacy_tokens.dart';

/// Non-2xx responses. Display text is identical to the previous
/// `Exception(message)`, and it is still caught by `on Exception` sites.
class ApiException implements Exception {
  final int statusCode;
  final String message;
  ApiException(this.statusCode, this.message);
  @override
  String toString() => 'Exception: $message';
}

class Api {
  String baseUrl = apiBase;
  String? token;
  String? refreshToken;
  Future<void> Function(String access, String? refresh)? onTokensRefreshed;
  Future<void> Function()? onRefreshFailed;
  Future<String?>? _refreshing;
  final http.Client _http;

  Api({http.Client? httpClient}) : _http = httpClient ?? http.Client();

  Future<Map<String, dynamic>> call(
    String path, {
    String method = 'GET',
    Map<String, dynamic>? data,
  }) async {
    try {
      return await _rawCall(path, method: method, data: data, token: token);
    } on ApiException catch (e) {
      // Login/register failures are credential errors, never a refresh case.
      if (e.statusCode != 401 || path.startsWith('/api/v1/auth/')) rethrow;
      final fresh = await _singleflightRefresh();
      if (fresh == null) rethrow;
      return await _rawCall(path, method: method, data: data, token: fresh);
    }
  }

  Future<String?> _singleflightRefresh() {
    _refreshing ??= _doRefresh().whenComplete(() => _refreshing = null);
    return _refreshing!;
  }

  Future<String?> _doRefresh() async {
    final rt = refreshToken;
    if (rt == null) return null;
    try {
      final res = await _rawCall('/api/v1/auth/refresh',
          method: 'POST', data: {'refresh_token': rt});
      final access = res['access_token'] as String?;
      if (access == null) return null;
      token = access;
      final rotated = res['refresh_token'] as String?;
      if (rotated != null) refreshToken = rotated;
      await onTokensRefreshed?.call(access, refreshToken);
      return access;
    } catch (_) {
      token = null;
      refreshToken = null;
      await onRefreshFailed?.call();
      return null;
    }
  }

  Future<Map<String, dynamic>> _rawCall(
    String path, {
    String method = 'GET',
    Map<String, dynamic>? data,
    String? token,
  }) async {
    final uri = Uri.parse('$baseUrl$path');
    final headers = <String, String>{'Content-Type': 'application/json'};
    if (token != null) headers['Authorization'] = 'Bearer $token';

    late http.Response res;
    try {
      switch (method) {
        case 'POST':
          res = await _http
              .post(uri, headers: headers, body: jsonEncode(data ?? {}))
              .timeout(const Duration(seconds: 15));
          break;
        case 'PUT':
          res = await _http
              .put(uri, headers: headers, body: jsonEncode(data ?? {}))
              .timeout(const Duration(seconds: 15));
          break;
        case 'PATCH':
          res = await _http
              .patch(uri, headers: headers, body: jsonEncode(data ?? {}))
              .timeout(const Duration(seconds: 15));
          break;
        case 'DELETE':
          res = await _http
              .delete(uri, headers: headers)
              .timeout(const Duration(seconds: 15));
          break;
        default:
          res = await _http
              .get(uri, headers: headers)
              .timeout(const Duration(seconds: 15));
      }
    } catch (e) {
      throw Exception('네트워크 연결 오류: $e');
    }

    final parsed = jsonDecode(utf8.decode(res.bodyBytes));
    if (parsed is! Map<String, dynamic>) throw Exception('유효하지 않은 응답 형식');
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw ApiException(res.statusCode,
          parsed['error']?.toString() ?? 'HTTP 오류: ${res.statusCode}');
    }
    return parsed;
  }
}
