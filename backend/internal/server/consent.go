package server

import (
	"context"
	"database/sql"
	"time"
)

// F24 legal consent, mirroring scripts/cf_worker.js (LEGAL_VERSIONS,
// ageOnDate, luno_consents). The two version pairs MUST match; a node
// drift test reads both files and fails the suite if they differ.
const (
	legalTermsVersion   = "2026-11-24.1"
	legalPrivacyVersion = "2026-11-21.1"
)

type consentOffer struct {
	Terms   string `json:"terms"`
	Privacy string `json:"privacy"`
}

type consentRecord struct {
	Terms   string
	Privacy string
	Age14   sql.NullBool
}

// ageOnDate returns full years between a YYYY-MM-DD birthdate and a
// YYYY-MM-DD day, or -1 for anything malformed (including impossible dates
// and future birthdates). Same rule as the worker, both pure.
func ageOnDate(birthdate, onDay string) int {
	parse := func(s string) (time.Time, bool) {
		t, err := time.Parse("2006-01-02", s)
		if err != nil {
			return time.Time{}, false
		}
		// time.Parse normalizes Feb 30 to Mar 2; round-trip to reject it.
		if t.Format("2006-01-02") != s {
			return time.Time{}, false
		}
		return t, true
	}
	b, ok := parse(birthdate)
	if !ok {
		return -1
	}
	o, ok := parse(onDay)
	if !ok {
		return -1
	}
	age := o.Year() - b.Year()
	if o.Month() < b.Month() || (o.Month() == b.Month() && o.Day() < b.Day()) {
		age--
	}
	if age < 0 {
		return -1
	}
	return age
}

func consentOfferedValid(offer *consentOffer) bool {
	return offer != nil && offer.Terms == legalTermsVersion && offer.Privacy == legalPrivacyVersion
}

func consentCurrent() map[string]string {
	return map[string]string{"terms": legalTermsVersion, "privacy": legalPrivacyVersion}
}

func (a *App) loadConsent(ctx context.Context, userID string) (*consentRecord, error) {
	var rec consentRecord
	err := a.db.QueryRowContext(ctx, "SELECT terms_version,privacy_version,age14_confirmed FROM identity.consents WHERE user_id=$1", userID).
		Scan(&rec.Terms, &rec.Privacy, &rec.Age14)
	if err != nil {
		return nil, err
	}
	return &rec, nil
}

func (a *App) saveConsent(ctx context.Context, userID string, rec consentRecord) error {
	_, err := a.db.ExecContext(ctx,
		`INSERT INTO identity.consents(user_id,terms_version,privacy_version,age14_confirmed,consented_at,updated_at)
		 VALUES ($1,$2,$3,$4,now(),now())
		 ON CONFLICT (user_id) DO UPDATE SET terms_version=$2,privacy_version=$3,age14_confirmed=$4,updated_at=now()`,
		userID, rec.Terms, rec.Privacy, rec.Age14)
	return err
}
