ALTER TABLE users ADD COLUMN last_activity_at TEXT;

CREATE INDEX audit_events_actor_activity
  ON audit_events(tenant_id,actor_id,created_at DESC);

CREATE INDEX login_events_user_activity
  ON login_events(tenant_id,user_id,created_at DESC);

UPDATE users
SET last_activity_at = NULLIF(
  MAX(
    COALESCE(
      (SELECT MAX(created_at) FROM login_events WHERE user_id=users.id AND tenant_id=users.tenant_id AND succeeded=1),
      ''
    ),
    COALESCE(
      (SELECT MAX(created_at) FROM audit_events WHERE actor_id=users.id AND tenant_id=users.tenant_id),
      ''
    )
  ),
  ''
);
