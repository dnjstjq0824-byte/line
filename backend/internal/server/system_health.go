package server

import (
	"net/http"
)

// systemHealth provides a comprehensive health check for all subsystems.
func (a *App) systemHealth(w http.ResponseWriter, r *http.Request) {
	status := "ok"
	checks := map[string]any{}

	// Database check
	if err := a.db.PingContext(r.Context()); err != nil {
		status = "degraded"
		checks["database"] = map[string]any{"status": "unhealthy", "error": err.Error()}
	} else {
		checks["database"] = map[string]any{"status": "healthy"}
	}

	// Push credentials check
	fcmOk := a.cfg.FCMProjectID != "" && (a.cfg.FCMAccessToken != "" || a.cfg.FCMServiceAccountJSON != "")
	apnsOk := a.cfg.APNsKeyID != "" && a.cfg.APNsPrivateKey != "" && a.cfg.APNsTeamID != "" && a.cfg.APNsBundleID != ""
	checks["push"] = map[string]any{
		"fcm":  fcmOk,
		"apns": apnsOk,
	}

	// Encryption check
	checks["encryption"] = map[string]any{
		"message_cipher": a.msgCipher != nil,
	}

	// Outbox check
	var pendingCount int
	// The relay records delivery per instance, not in the legacy published_at column.
	err := a.db.QueryRowContext(r.Context(), `SELECT count(*) FROM realtime.delivery_outbox o
		LEFT JOIN realtime.outbox_deliveries d ON d.outbox_id=o.id AND d.instance_id=$1
		WHERE d.id IS NULL`, a.instanceID).Scan(&pendingCount)
	if err != nil {
		status = "degraded"
		checks["outbox"] = map[string]any{"status": "unhealthy", "pending": nil}
	} else {
		checks["outbox"] = map[string]any{"status": "healthy", "pending": pendingCount}
	}

	send(w, 200, map[string]any{
		"status":  status,
		"checks":  checks,
		"version": "1.0.0",
	})
}
