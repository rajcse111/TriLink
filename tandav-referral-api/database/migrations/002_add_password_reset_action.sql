-- Add 'password_reset' to the login_logs action constraint.
-- Safe to run multiple times: drops the old constraint by name then re-creates it.
DO $$
DECLARE
  v_con TEXT;
BEGIN
  SELECT con.conname INTO v_con
  FROM   pg_constraint con
  JOIN   pg_class      rel ON rel.oid = con.conrelid
  WHERE  rel.relname = 'login_logs'
    AND  con.contype = 'c'
    AND  con.conname LIKE '%action%';

  IF v_con IS NOT NULL THEN
    EXECUTE 'ALTER TABLE login_logs DROP CONSTRAINT ' || quote_ident(v_con);
  END IF;

  ALTER TABLE login_logs
    ADD CONSTRAINT login_logs_action_check
    CHECK (action IN ('login','logout','failed_login','register','otp_sent','otp_verified','password_reset'));
END $$;
